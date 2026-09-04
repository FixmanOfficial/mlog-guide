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

    constant('@pi', Math.PI)
    constant('π', Math.PI)
    constant('@e', Math.E)
    constant('@degToRad', Math.PI / 180)
    constant('@radToDeg', 180 / Math.PI)

    return globals
}

/** Color.toFloatBits: упаковка в ABGR и переинтерпретация битов как float. */
const colorBuffer = new DataView(new ArrayBuffer(4))

function packColorBits(r, g, b, a) {
    const packed = (((a << 24) | (b << 16) | (g << 8) | r) & 0xfeffffff) >>> 0
    colorBuffer.setUint32(0, packed)
    return colorBuffer.getFloat32(0)
}

const hex = (text, from, to) => parseInt(text.slice(from, to), 16)

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
        const radix = (prefix, base) => {
            if (!symbol.startsWith(prefix)) return undefined
            const negative = symbol[0] === '-'
            const digits = symbol.slice(prefix.length)
            if (digits === '' || !isRadixDigits(digits, base)) return NaN
            const parsed = Number(BigInt((base === 2 ? '0b' : '0x') + digits))
            return negative ? -parsed : parsed
        }

        for (const [prefix, base] of [['0b', 2], ['+0b', 2], ['-0b', 2], ['0x', 16], ['+0x', 16], ['-0x', 16]]) {
            const parsed = radix(prefix, base)
            if (parsed !== undefined) return parsed
        }

        if (symbol.startsWith('%[') && symbol.endsWith(']') && symbol.length > 3) {
            const color = this.colors.get(symbol.slice(2, -1))
            return color === undefined ? NaN : color
        }

        if (symbol.startsWith('%') && (symbol.length === 7 || symbol.length === 9)) {
            const body = symbol.slice(1)
            if (!/^[0-9a-fA-F]+$/.test(body)) return NaN

            return packColorBits(
                hex(symbol, 1, 3),
                hex(symbol, 3, 5),
                hex(symbol, 5, 7),
                symbol.length === 9 ? hex(symbol, 7, 9) : 255
            )
        }

        return /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(symbol) ? Number(symbol) : NaN
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
        if (operation.notImplemented !== undefined) {
            asm.report(operation.notImplemented, line, {instruction: 'op', operation: name})
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

function isRadixDigits(text, base) {
    return base === 2 ? /^[01]+$/.test(text) : /^[0-9a-fA-F]+$/.test(text)
}
