/**
 * Сборка разобранных строк в исполняемые инструкции и таблицу переменных.
 *
 * Перенос logic/LAssembler.java. Тонкости:
 *
 *  - имя сначала ищется среди глобальных констант, и только потом считается литералом или переменной;
 *  - строковый литерал становится скрытой константой с именем ___"текст";
 *  - в нестроковых токенах пробелы заменяются подчёркиванием;
 *  - поддерживаются 0b, 0x со знаком и цвета вида %RRGGBB и %RRGGBBAA;
 *  - бесконечность в литерале превращается в ноль, а не в NaN;
 *  - переменная по умолчанию — объект null, а не ноль.
 */

import {LVar} from './lvar.js'
import {Diagnostic, diagnostic} from './errors.js'
import {operations, conditions} from './ops.js'
import {parse} from './parser.js'
import {PI, E, degRad, radDeg, parseDouble, parseLong, javaDoubleToString} from './arc.js'
import {NOT_SENSED} from './world.js'
import {ALIGN_NAMES} from './font.js'

/** Все 53 инструкции из LStatements.java: нужны, чтобы отличать опечатку от неперенесённого. */
export const KNOWN_INSTRUCTIONS = new Set([
    'noop', 'read', 'write', 'draw', 'print', 'printchar', 'format', 'drawflush', 'printflush',
    'getlink', 'control', 'radar', 'sensor', 'set', 'op', 'select', 'wait', 'stop', 'lookup',
    'packcolor', 'unpackcolor', 'end', 'jump', 'ubind', 'ucontrol', 'uradar', 'ulocate',
    'query', 'getblock', 'setblock', 'spawn', 'bullet', 'status', 'weathersense', 'weatherset',
    'spawnwave', 'setrule', 'message', 'cutscene', 'effect', 'explosion', 'setrate', 'fetch',
    'sync', 'clientdata', 'getflag', 'setflag', 'setprop', 'playsound', 'playmusic', 'setmarker',
    'makemarker', 'localeprint'
])

/** Константы, не зависящие от контента игры. GlobalVars.java:45-70 */
function baseGlobals() {
    const globals = new Map()

    const constant = (name, value, isObject = false) => {
        const variable = new LVar(name, {constant: true})
        if (isObject) {
            variable.isobj = true
            variable.objval = value
        } else {
            variable.isobj = false
            variable.numval = value
        }
        globals.set(name, variable)
    }

    constant('false', 0)
    constant('true', 1)
    constant('null', null, true)

    // Все четыре берутся из Mathf, где они объявлены как float. Поэтому @pi в mlog это
    // 3.1415927410125732, а вовсе не число пи двойной точности
    constant('@pi', PI)
    constant('π', PI)
    constant('@e', E)
    constant('@degToRad', degRad)
    constant('@radToDeg', radDeg)

    // Выравнивание для draw print. GlobalVars.java:151 раскладывает LStatement.nameToAlign
    for (const [name, value] of Object.entries(ALIGN_NAMES)) constant(`@${name}`, value)

    // Свойства sensor: в игре они кладутся в константы обходом LAccess.all
    for (const access of LACCESS) constant(`@${access}`, {access}, true)

    return globals
}

/**
 * `Color.toDoubleBits`: RGBA8888 кладётся в **младшие 32 бита double**, а не в float.
 * Из-за этого упакованный цвет — крошечное денормализованное число, и печатать его
 * бессмысленно; зато `draw col` достаёт байты обратно тем же приведением.
 *
 * Красный в старшем байте: `rgba8888` собирает `(r << 24) | (g << 16) | (b << 8) | a`.
 */
const colorBuffer = new DataView(new ArrayBuffer(8))

function packColorBits(r, g, b, a) {
    colorBuffer.setUint32(0, 0)
    colorBuffer.setUint32(4, (((r << 24) | (g << 16) | (b << 8) | a) >>> 0))
    return colorBuffer.getFloat64(0)
}

/** Color.fromDouble: `(int)Double.doubleToRawLongBits(value)` — те же младшие 32 бита. */
export function unpackColorBits(value) {
    colorBuffer.setFloat64(0, value)
    const packed = colorBuffer.getUint32(4)

    return [
        (packed >>> 24) / 255,
        ((packed >>> 16) & 0xff) / 255,
        ((packed >>> 8) & 0xff) / 255,
        (packed & 0xff) / 255
    ]
}

/**
 * Канал 0..1 в байт. `Color.rgba8888` умножает во float и **усекает**, а не округляет:
 * половина яркости даёт 127, а не 128.
 */
const channelByte = (value) => Math.trunc(Math.fround(Math.fround(clamp01(Math.fround(value))) * 255))

const clamp01 = (value) => Math.min(1, Math.max(0, value))

const hex = (text, from, to) => {
    const value = parseInt(text.slice(from, to), 16)
    return Number.isNaN(value) ? 0 : value
}

/** Свойства LAccess, читаемые через sensor. Имена совпадают с logic/LAccess.java. */
export const LACCESS = [
    'totalItems', 'firstItem', 'totalLiquids', 'totalPower', 'itemCapacity', 'liquidCapacity',
    'powerCapacity', 'powerNetStored', 'powerNetCapacity', 'powerNetIn', 'powerNetOut', 'ammo',
    'ammoCapacity', 'currentAmmoType', 'memoryCapacity', 'health', 'maxHealth', 'heat', 'shield',
    'armor', 'efficiency', 'progress', 'timescale', 'rotation', 'x', 'y', 'velocityX', 'velocityY',
    'shootX', 'shootY', 'cameraX', 'cameraY', 'cameraWidth', 'cameraHeight', 'displayWidth',
    'displayHeight', 'bufferSize', 'operations', 'size', 'solid', 'dead', 'range', 'shooting',
    'boosting', 'mineX', 'mineY', 'mining', 'buildX', 'buildY', 'pingX', 'pingY', 'pingText',
    'building', 'breaking', 'speed', 'team', 'type', 'flag', 'flying', 'controlled', 'controller',
    'name', 'payloadCount', 'payloadType', 'totalPayload', 'payloadCapacity', 'maxUnits', 'id',
    'selectedBlock', 'selectedRotation', 'bulletLifetime', 'bulletTime', 'enabled', 'shoot',
    'shootp', 'config', 'color'
]

/** Свойства control, принимающие объект, а не число. LAccess: isObj */
const OBJECT_CONTROLS = new Set(['shootp', 'config'])

/** Достаёт имя свойства из константы вида @enabled. */
function propertyName(variable) {
    const object = variable.obj()
    return object !== null && object.access !== undefined ? object.access : null
}

/** PrintI.toString плюс правило «целое печатается без дробной части». */
function printValue(variable) {
    if (variable.isobj) {
        const object = variable.objval

        if (object === null) return 'null'
        if (typeof object === 'string') return object
        if (object.access !== undefined) return object.access
        if (object.name !== undefined) return object.name
        return '[object]'
    }

    // Порог 1e-5, тот же, что у bool(): близкое к целому печатается целым
    if (Math.abs(variable.numval - Math.round(variable.numval)) < 0.00001) {
        return String(Math.round(variable.numval))
    }

    return javaDoubleToString(variable.numval)
}

export class Assembler {
    /**
     * @param options.globals дополнительные константы: @copper, @router и прочий контент игры
     * @param options.colors  именованные цвета для синтаксиса %[name]
     */
    constructor({globals = new Map(), colors = new Map()} = {}) {
        this.vars = new Map()
        this.diagnostics = []
        this.colors = colors

        this.globals = baseGlobals()
        for (const [name, value] of globals) this.globals.set(name, value)

        // @counter существует как обычная переменная и обязательно числовая
        this.counter = this.putVar('@counter')
        this.counter.isobj = false
        this.counter.numval = 0

        this.putConst('@unit', null)
        this.putConst('@this', null)
    }

    putVar(name) {
        const existing = this.vars.get(name)
        if (existing !== undefined) return existing

        // Переменные по умолчанию — объекты null
        const variable = new LVar(name)
        this.vars.set(name, variable)
        return variable
    }

    putConst(name, value) {
        const variable = this.putVar(name)

        if (typeof value === 'number') {
            variable.isobj = false
            variable.numval = value
            variable.objval = null
        } else {
            variable.isobj = true
            variable.objval = value
        }

        variable.constant = true
        return variable
    }

    /** LAssembler.var: превращает токен в переменную или скрытую константу. */
    var(symbol) {
        const global = this.globals.get(symbol)
        if (global !== undefined) return global

        let name = symbol.trim()

        if (name.length > 1 && name.startsWith('"') && name.endsWith('"')) {
            // Единственное экранирование, которое игра раскрывает в литерале
            const text = name.slice(1, -1).split('\\n').join('\n')
            return this.putConst(`___${name}`, text)
        }

        name = name.split(' ').join('_')

        const value = this.parseNumber(name)

        if (Number.isNaN(value)) return this.putVar(name)

        // Бесконечность превращается в ноль, а не остаётся недопустимым числом
        return this.putConst(`___${value}`, Number.isFinite(value) ? value : 0)
    }

    /** LAssembler.parseDouble. */
    parseNumber(symbol) {
        for (const [prefix, base] of [['0b', 2], ['+0b', 2], ['-0b', 2], ['0x', 16], ['+0x', 16], ['-0x', 16]]) {
            if (!symbol.startsWith(prefix)) continue

            const parsed = parseLong(symbol, base, prefix.length, symbol.length)
            if (parsed === null) return NaN

            return prefix[0] === '-' ? -Number(parsed) : Number(parsed)
        }

        if (symbol.startsWith('%[') && symbol.endsWith(']') && symbol.length > 3) {
            const color = this.colors.get(symbol.slice(2, -1))
            return color === undefined ? NaN : color
        }

        if (symbol.startsWith('%') && (symbol.length === 7 || symbol.length === 9)) {
            // Strings.parseInt отдаёт ноль на мусоре, поэтому %zzzzzz — это чёрный, а не ошибка
            return packColorBits(
                hex(symbol, 1, 3),
                hex(symbol, 3, 5),
                hex(symbol, 5, 7),
                symbol.length === 9 ? hex(symbol, 7, 9) : 255
            )
        }

        return parseDouble(symbol)
    }

    report(code, line, data) {
        this.diagnostics.push(diagnostic(code, line, data))
    }
}

/** Построители инструкций первой версии. Остальные осознанно не перенесены, см. PLAN.md. */
const builders = {
    set: (asm, params) => {
        const to = asm.var(params[0] ?? 'result')
        const from = asm.var(params[1] ?? '0')
        return {run: () => { if (!to.constant) to.set(from) }}
    },

    op: (asm, params, line) => {
        const name = params[0] ?? 'add'
        const operation = operations[name]

        if (operation === undefined) {
            asm.report(Diagnostic.UNKNOWN_OPERATION, line, {operation: name})
            return null
        }

        const dest = asm.var(params[1] ?? 'result')
        const a = asm.var(params[2] ?? '0')
        const b = asm.var(params[3] ?? '0')

        return {
            run: () => {
                if (name === 'strictEqual') {
                    dest.setnum(strictEqualValue(a, b))
                } else if (operation.unary === true) {
                    dest.setnum(operation.fn(a.num()))
                } else if (operation.objFn !== undefined && a.isobj && b.isobj) {
                    dest.setnum(operation.objFn(a.obj(), b.obj()))
                } else {
                    dest.setnum(operation.fn(a.num(), b.num()))
                }
            }
        }
    },

    jump: (asm, params, line) => {
        const address = Number.parseInt(params[0] ?? '-1', 10)
        const name = params[1] ?? 'always'

        if (conditions[name] === undefined) {
            asm.report(Diagnostic.UNKNOWN_CONDITION, line, {condition: name})
            return null
        }

        const value = asm.var(params[2] ?? '0')
        const compare = asm.var(params[3] ?? '0')

        return {
            run: (vm) => {
                if (address !== -1 && vm.test(name, value, compare)) {
                    vm.counter.numval = address
                }
            }
        }
    },

    // EndI ставит счётчик за последнюю инструкцию, а не в ноль: на ноль его вернёт следующий шаг
    read: (asm, params) => {
        const output = asm.var(params[0] ?? 'result')
        const target = asm.var(params[1] ?? 'cell1')
        const position = asm.var(params[2] ?? '0')

        return {
            run: () => {
                const object = target.obj()

                if (object !== null && typeof object.read === 'function') {
                    output.setnum(object.read(position.num() | 0))
                } else if (typeof object === 'string') {
                    // Чтение из строки отдаёт код символа, а за границами — NaN
                    const index = position.num() | 0
                    output.setnum(index < 0 || index >= object.length ? NaN : object.charCodeAt(index))
                } else {
                    output.setobj(null)
                }
            }
        }
    },

    write: (asm, params) => {
        const value = asm.var(params[0] ?? 'result')
        const target = asm.var(params[1] ?? 'cell1')
        const position = asm.var(params[2] ?? '0')

        return {
            run: () => {
                const object = target.obj()
                if (object !== null && typeof object.write === 'function') {
                    object.write(position.num() | 0, value.num())
                }
            }
        }
    },

    print: (asm, params) => {
        const value = asm.var(params[0] ?? '"frog"')
        return {run: (vm) => vm.appendText(printValue(value))}
    },

    printchar: (asm, params) => {
        const value = asm.var(params[0] ?? '0')

        return {
            run: (vm) => {
                if (value.isobj) return
                vm.appendText(String.fromCharCode(Math.floor(value.numval)))
            }
        }
    },

    format: (asm, params) => {
        const value = asm.var(params[0] ?? '0')
        return {run: (vm) => vm.formatText(printValue(value))}
    },

    printflush: (asm, params) => {
        const target = asm.var(params[0] ?? 'message1')

        return {
            run: (vm) => {
                const building = target.obj()
                if (building !== null && typeof building.setMessage === 'function') {
                    building.setMessage(vm.textBuffer)
                }
                // Буфер чистится всегда, даже если цель не подходит
                vm.textBuffer = ''
            }
        }
    },

    draw: (asm, params) => {
        const type = params[0] ?? 'clear'
        const args = [1, 2, 3, 4, 5, 6].map(i => asm.var(params[i] ?? '0'))

        return {
            run: (vm) => vm.appendDraw(type, args)
        }
    },

    drawflush: (asm, params) => {
        const target = asm.var(params[0] ?? 'display1')

        return {
            run: (vm) => {
                const building = target.obj()
                if (building !== null && typeof building.flush === 'function') {
                    building.flush(vm.graphicsBuffer)
                }
                vm.graphicsBuffer = []
            }
        }
    },

    sensor: (asm, params) => {
        const output = asm.var(params[0] ?? 'result')
        const target = asm.var(params[1] ?? 'block1')
        const property = asm.var(params[2] ?? '@copper')

        return {
            run: () => {
                const object = target.obj()
                const name = propertyName(property)

                // Мёртвым считается и отсутствующий объект. SenseI
                if (object === null && name === 'dead') {
                    output.setnum(1)
                    return
                }

                if (object === null || typeof object.sense !== 'function') {
                    if ((name === 'size' || name === 'bufferSize') && typeof object === 'string') {
                        output.setnum(object.length)
                        return
                    }
                    output.setobj(null)
                    return
                }

                const asObject = object.senseObject(name)
                if (asObject !== NOT_SENSED) {
                    output.setobj(asObject)
                    return
                }

                output.setnum(object.sense(name))
            }
        }
    },

    control: (asm, params) => {
        const property = params[0] ?? 'enabled'
        const target = asm.var(params[1] ?? 'block1')
        const values = [2, 3, 4, 5].map(i => asm.var(params[i] ?? '0'))

        return {
            run: () => {
                const object = target.obj()
                if (object === null || typeof object.control !== 'function') return

                // Объектные свойства передают объект, остальные — число. ControlI
                const first = OBJECT_CONTROLS.has(property) && values[0].isobj
                    ? values[0].obj()
                    : values[0].num()

                object.control(property, first, values[1].num(), values[2].num(), values[3].num())
            }
        }
    },

    getlink: (asm, params) => {
        const output = asm.var(params[0] ?? 'result')
        const index = asm.var(params[1] ?? '0')

        return {
            run: (vm) => {
                const address = index.num() | 0
                output.setobj(address >= 0 && address < vm.links.length ? vm.links[address] : null)
            }
        }
    },

    lookup: (asm, params) => {
        const type = params[0] ?? 'block'
        const output = asm.var(params[1] ?? 'result')
        const index = asm.var(params[2] ?? '0')

        return {
            run: (vm) => output.setobj(vm.lookup(type, index.num() | 0))
        }
    },

    packcolor: (asm, params) => {
        const result = asm.var(params[0] ?? 'result')
        const channels = [1, 2, 3, 4].map(i => asm.var(params[i] ?? '0'))

        return {
            run: () => {
                // Каналы здесь в долях от нуля до единицы, а не 0-255 как в литерале %RRGGBB
                const [r, g, b, a] = channels.map(channel => channelByte(channel.num()))
                result.setnum(packColorBits(r, g, b, a))
            }
        }
    },

    unpackcolor: (asm, params) => {
        const outputs = [0, 1, 2, 3].map(i => asm.var(params[i] ?? 'result'))
        const value = asm.var(params[4] ?? '0')

        return {
            run: () => {
                const channels = unpackColorBits(value.num())
                outputs.forEach((output, index) => output.setnum(channels[index]))
            }
        }
    },

    select: (asm, params, line) => {
        const result = asm.var(params[0] ?? 'result')
        const name = params[1] ?? 'always'

        if (conditions[name] === undefined) {
            asm.report(Diagnostic.UNKNOWN_CONDITION, line, {condition: name})
            return null
        }

        const [compareA, compareB, whenTrue, whenFalse] =
            [2, 3, 4, 5].map(i => asm.var(params[i] ?? '0'))

        return {
            run: (vm) => {
                if (result.constant) return
                result.set(vm.test(name, compareA, compareB) ? whenTrue : whenFalse)
            }
        }
    },

    /**
     * WaitI хранит собственный счётчик времени, поэтому у инструкции есть состояние.
     * Ноль и меньше — просто уступить, не залипая на себе.
     */
    wait: (asm, params) => {
        const value = asm.var(params[0] ?? '0.5')
        let elapsed = 0

        return {
            run: (vm) => {
                const target = value.num()

                if (target <= 0) {
                    vm.yield = true
                    elapsed = 0
                } else if (elapsed >= target) {
                    elapsed = 0
                } else {
                    vm.counter.numval--
                    vm.yield = true
                    elapsed += vm.delta / 60
                }
            }
        }
    },

    end: () => ({run: (vm) => { vm.counter.numval = vm.instructions.length }}),

    // StopI отступает на шаг назад, чтобы застрять на себе же, и просит исполнителя уступить
    stop: () => ({run: (vm) => { vm.counter.numval--; vm.yield = true; vm.stopped = true }}),

    noop: () => ({run: () => { /* пустая инструкция */ }})
}

function strictEqualValue(a, b) {
    if (a.isobj !== b.isobj) return 0
    if (a.isobj) return a.objval === b.objval ? 1 : 0
    return a.numval === b.numval ? 1 : 0
}

/**
 * Собирает текст программы в инструкции.
 * Нераспознанное имя и неперенесённая инструкция дают диагностику и место в коде остаётся пустым:
 * молча пропускать нельзя, иначе ученик решит, что ошибся сам.
 */
export function assemble(text, options = {}) {
    const {statements, diagnostics} = parse(text)
    const asm = new Assembler(options)
    const instructions = []

    for (const statement of statements) {
        const builder = builders[statement.op]

        if (builder === undefined) {
            const code = KNOWN_INSTRUCTIONS.has(statement.op)
                ? Diagnostic.NOT_IMPLEMENTED
                : Diagnostic.UNKNOWN_INSTRUCTION

            asm.report(code, statement.line, {instruction: statement.op})
            instructions.push({op: statement.op, line: statement.line, run: () => { /* нет реализации */ }})
            continue
        }

        const built = builder(asm, statement.params, statement.line)

        instructions.push({
            op: statement.op,
            line: statement.line,
            run: built === null ? () => { /* нет реализации */ } : built.run
        })
    }

    return {
        instructions,
        vars: asm.vars,
        counter: asm.counter,
        diagnostics: [...diagnostics, ...asm.diagnostics]
    }
}

