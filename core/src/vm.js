/**
 * Исполнитель процессора.
 *
 * Перенос logic/LExecutor.java. Тонкости:
 *
 *  - счётчик увеличивается ДО запуска инструкции, поэтому внутри неё @counter уже указывает
 *    на следующую строку, а jump просто перезаписывает счётчик;
 *  - выход счётчика за границы программы возвращает его на ноль в начале следующего шага;
 *  - @counter принудительно становится числовым на каждом шаге: туда можно записать объект;
 *  - буферы текста и графики живут на процессоре, а не в здании: printflush и drawflush
 *    переносят содержимое и чистят буфер даже тогда, когда цель не подходит;
 *  - ядро не знает ни про время браузера, ни про рендер. Шагами управляет вызывающий код.
 */

import {assemble} from './assembler.js'
import {testCondition} from './ops.js'
import {MAX_INSTRUCTIONS} from './parser.js'
import {LVar} from './lvar.js'
import {layoutPrint} from './font.js'
import {unpackColorBits} from './assembler.js'

/** Сколько инструкций процессор успевает за тик. content/Blocks.java */
export const IPT = {
    micro: 2,
    logic: 8,
    hyper: 25
}

/** LExecutor.java:44-46 */
export const MAX_TEXT_BUFFER = 400
export const MAX_GRAPHICS_BUFFER = 256

/** LogicDisplay.scaleStep: draw scale хранится шагами по 0.05. */
export const SCALE_STEP = 0.05

/**
 * Поля команды дисплея — по 10 бит: девять на модуль, один на знак.
 * `LExecutor.DrawI.packSign` и `LogicDisplay.unpackSign` вместе дают вот это.
 */
export const packSign = (value) => (value < 0 ? -1 : 1) * (Math.abs(value) & 0b111111111)

/** LogicBlock.maxInstructionScale: потолок накопленного долга по инструкциям. */
export const MAX_INSTRUCTION_SCALE = 5

export class Processor {
    /**
     * @param code    текст программы
     * @param options ipt — инструкций за тик; links — подключённые здания; world — модель мира;
     *                content — таблицы для lookup; плюс globals и colors для сборщика
     */
    constructor(code = '', {ipt = IPT.logic, links = [], world = null, content = null, ...assemblerOptions} = {}) {
        this.ipt = ipt
        this.links = links
        this.world = world
        this.content = content
        this.delta = 1
        this.assemblerOptions = assemblerOptions

        this.load(code)
    }

    load(code) {
        const options = {...this.assemblerOptions}

        // Связи видны программе по именам: cell1, display1 и так далее
        const globals = new Map(options.globals ?? [])
        for (const building of this.links) {
            const variable = new LVar(building.name, {constant: true})
            variable.isobj = true
            variable.objval = building
            globals.set(building.name, variable)
        }
        options.globals = globals

        const {instructions, vars, counter, diagnostics} = assemble(code, options)

        this.instructions = instructions
        this.vars = vars
        this.counter = counter
        this.diagnostics = diagnostics

        this.textBuffer = ''
        this.graphicsBuffer = []
        this.stopped = false
        this.yield = false
        this.accumulator = 0

        this.bindEnvironment()
        return this
    }

    /** Константы, зависящие от процессора и мира. GlobalVars.update */
    bindEnvironment() {
        const set = (name, value) => {
            const variable = this.vars.get(name)
            if (variable === undefined) return
            variable.constant = false
            variable.setnum(value)
            variable.constant = true
        }

        set('@ipt', this.ipt)
        set('@links', this.links.length)

        if (this.world !== null) {
            const {tick, time, second, minute} = this.world.time
            set('@tick', tick)
            set('@time', time)
            set('@second', second)
            set('@minute', minute)
        }
    }

    get loaded() {
        return this.instructions.length > 0
    }

    get(name) {
        return this.vars.get(name)
    }

    num(name) {
        const variable = this.vars.get(name)
        return variable === undefined ? undefined : variable.num()
    }

    test(condition, a, b) {
        return testCondition(condition, a, b)
    }

    /** PrintI: буфер не растёт за предел, лишнее обрезается. */
    appendText(text) {
        if (this.textBuffer.length >= MAX_TEXT_BUFFER) return
        this.textBuffer += text.slice(0, MAX_TEXT_BUFFER - this.textBuffer.length)
    }

    /**
     * FormatI: подставляет значение в место {N} с наименьшим номером, а не в первое попавшееся.
     * Если подходящего места нет, инструкция не делает ничего.
     */
    formatText(text) {
        let index = -1
        let lowest = 10

        for (let i = 0; i < this.textBuffer.length - 2; i++) {
            if (this.textBuffer[i] !== '{' || this.textBuffer[i + 2] !== '}') continue

            const digit = this.textBuffer.charCodeAt(i + 1) - 48
            if (digit < 0 || digit > 9 || digit >= lowest) continue

            lowest = digit
            index = i
        }

        if (index === -1) return

        this.textBuffer = this.textBuffer.slice(0, index) + text + this.textBuffer.slice(index + 3)
        if (this.textBuffer.length > MAX_TEXT_BUFFER) this.textBuffer = this.textBuffer.slice(0, MAX_TEXT_BUFFER)
    }

    /**
     * DrawI: команда кладётся в буфер как данные, рисованием занимается сайт.
     *
     * Все параметры проходят через `packSign` — в игре команда упакована в long полями по
     * 10 бит, поэтому от числа остаются девять бит модуля и бит знака. Дробная часть теряется
     * ещё раньше, на `numi()`. Из-за этого `draw rect 600 0 10 10` рисует на 88, а не за краем.
     */
    appendDraw(type, args) {
        if (this.graphicsBuffer.length >= MAX_GRAPHICS_BUFFER) return

        const [x, y, p1, p2, p3, p4] = args

        if (type === 'print') {
            this.appendPrintGlyphs(x.numi(), y.numi(), p1.numi())
            return
        }

        // draw col: цвет распаковывается здесь же и уезжает в буфер обычной командой color
        if (type === 'col') {
            const [r, g, b, a] = unpackColorBits(x.num()).map(channel => Math.round(channel * 255))
            this.graphicsBuffer.push({type: 'color', x: r, y: g, p1: b, p2: a, p3: 0, p4: 0})
            return
        }

        const command = {
            type,
            x: packSign(x.numi()),
            y: packSign(y.numi()),
            p1: packSign(p1.numi()),
            p2: packSign(p2.numi()),
            p3: packSign(p3.numi()),
            p4: packSign(p4.numi())
        }

        if (type === 'image') {
            // Картинка задаётся объектом контента: в игре сюда пакуется его тип и номер
            command.content = p1.obj()
            command.p1 = 0
            command.p4 = 0
        }

        // Масштаб хранится в шагах по 0.05: LogicDisplay.scaleStep
        if (type === 'scale') {
            command.x = packSign(Math.trunc(x.num() / SCALE_STEP))
            command.y = packSign(Math.trunc(y.num() / SCALE_STEP))
        }

        this.graphicsBuffer.push(command)
    }

    /**
     * draw print раскладывает текстовый буфер по символам и кладёт по команде на каждый глиф.
     * Символы без глифа пропускаются, но шаг курсора делается всё равно — поэтому пробел
     * оставляет пропуск, а кириллица не рисуется вовсе.
     *
     * Текстовый буфер после этого очищается: draw print его расходует.
     */
    appendPrintGlyphs(x, y, align) {
        if (this.textBuffer.length === 0) return

        for (const command of layoutPrint(this.textBuffer, x, y, align)) {
            if (this.graphicsBuffer.length >= MAX_GRAPHICS_BUFFER) break
            this.graphicsBuffer.push({...command, x: packSign(command.x), y: packSign(command.y)})
        }

        this.textBuffer = ''
    }

    /** LookupI: имя контента по логическому идентификатору. */
    lookup(type, index) {
        const table = this.content?.types?.[type]
        if (table === undefined) return null
        return index >= 0 && index < table.length ? table[index] : null
    }

    /** LExecutor.runOnce: один шаг исполнения. */
    step() {
        if (!this.loaded) return false

        if (this.counter.numval >= this.instructions.length || this.counter.numval < 0) {
            this.counter.numval = 0
        }

        this.counter.isobj = false

        const index = Math.trunc(this.counter.numval)
        this.counter.numval = index + 1

        this.instructions[index].run(this)
        return true
    }

    tick(delta = 1) {
        this.delta = delta
        this.bindEnvironment()

        const ceiling = this.ipt * MAX_INSTRUCTION_SCALE
        if (this.accumulator > ceiling) this.accumulator = ceiling

        let executed = 0

        while (this.accumulator >= 1) {
            if (!this.step()) break

            // Уступившая инструкция накопленное не тратит: wait и stop должны повториться
            if (this.yield) {
                this.yield = false
                break
            }

            this.accumulator--
            executed++
        }

        // Порядок важен: игра прибавляет накопленное ПОСЛЕ цикла, в исходниках на это есть
        // отдельный комментарий. Иначе первый же тик исполнит инструкции досрочно.
        this.accumulator += delta * this.ipt

        return executed
    }

    ticks(count, delta = 1) {
        let executed = 0
        for (let i = 0; i < count; i++) executed += this.tick(delta)
        return executed
    }

    /** Прогон ровно N инструкций, мимо модели времени: удобно в тестах. */
    run(count = MAX_INSTRUCTIONS) {
        let executed = 0

        for (let i = 0; i < count; i++) {
            if (this.stopped || !this.step()) break
            executed++
        }

        return executed
    }

    reset() {
        for (const variable of this.vars.values()) {
            if (variable.constant) continue
            variable.isobj = true
            variable.objval = null
            variable.numval = 0
        }

        this.counter.isobj = false
        this.counter.numval = 0
        this.textBuffer = ''
        this.graphicsBuffer = []
        this.stopped = false
        this.yield = false
        this.accumulator = 0

        this.bindEnvironment()
        return this
    }
}
