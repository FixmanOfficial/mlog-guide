/**
 * Исполнитель процессора.
 *
 * Перенос logic/LExecutor.java. Тонкости:
 *
 *  - счётчик увеличивается ДО запуска инструкции, поэтому внутри неё @counter уже указывает
 *    на следующую строку, а jump просто перезаписывает счётчик;
 *  - выход счётчика за границы программы возвращает его на ноль в начале следующего шага;
 *  - @counter принудительно становится числовым на каждом шаге: туда можно записать объект;
 *  - ядро не знает ни про время браузера, ни про рендер. Шагами управляет вызывающий код.
 */

import {assemble} from './assembler.js'
import {testCondition} from './ops.js'
import {MAX_INSTRUCTIONS} from './parser.js'

/** Сколько инструкций процессор успевает за тик. content/Blocks.java */
export const IPT = {
    micro: 2,
    logic: 8,
    hyper: 25
}

export class Processor {
    /**
     * @param code    текст программы
     * @param options ipt — инструкций за тик, плюс globals и colors для сборщика
     */
    constructor(code = '', {ipt = IPT.logic, ...assemblerOptions} = {}) {
        this.ipt = ipt
        this.assemblerOptions = assemblerOptions
        this.load(code)
    }

    load(code) {
        const {instructions, vars, counter, diagnostics} = assemble(code, this.assemblerOptions)

        this.instructions = instructions
        this.vars = vars
        this.counter = counter
        this.diagnostics = diagnostics

        this.stopped = false
        this.yield = false
        this.accumulator = 0

        return this
    }

    get loaded() {
        return this.instructions.length > 0
    }

    /** Значение переменной по имени, или undefined, если такой нет. */
    get(name) {
        return this.vars.get(name)
    }

    /** Числовое значение переменной — то, что обычно нужно проверке урока. */
    num(name) {
        const variable = this.vars.get(name)
        return variable === undefined ? undefined : variable.num()
    }

    test(condition, a, b) {
        return testCondition(condition, a, b)
    }

    /** LExecutor.runOnce: один шаг исполнения. */
    step() {
        if (!this.loaded) return false

        // Выход за границы программы возвращает счётчик в начало
        if (this.counter.numval >= this.instructions.length || this.counter.numval < 0) {
            this.counter.numval = 0
        }

        this.counter.isobj = false

        const index = Math.trunc(this.counter.numval)
        this.counter.numval = index + 1

        this.instructions[index].run(this)
        return true
    }

    /**
     * Один игровой тик: столько инструкций, сколько позволяет ipt.
     * Накопление дробного остатка повторяет LogicBlock: при просадке кадров процессор
     * доисполняет накопившееся, но не больше ограничения.
     */
    tick(delta = 1) {
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

    /** Прогон нескольких тиков подряд — обычная форма проверки в уроке. */
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

    /** Сброс состояния без перезагрузки кода. */
    reset() {
        for (const variable of this.vars.values()) {
            if (variable.constant) continue
            variable.isobj = true
            variable.objval = null
            variable.numval = 0
        }

        this.counter.isobj = false
        this.counter.numval = 0
        this.stopped = false
        this.yield = false
        this.accumulator = 0

        return this
    }
}

/** LogicBlock.maxInstructionScale: потолок накопленного долга по инструкциям. */
export const MAX_INSTRUCTION_SCALE = 5
