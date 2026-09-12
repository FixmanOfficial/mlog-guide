/**
 * Разбор текста программы в последовательность инструкций.
 *
 * Перенос logic/LParser.java. Тонкости:
 *
 *  - разделителем строки служит и перевод строки, и точка с запятой;
 *  - строковый литерал остаётся в токене вместе с кавычками, распаковывает его уже сборщик;
 *  - метка — это одиночный токен, кончающийся двоеточием; номер строки на неё не тратится;
 *  - у jump второй токен может быть меткой, и тогда адрес подставляется в конце разбора;
 *  - нераспознанная строка не роняет разбор, а становится noop с диагностикой.
 */

import {Diagnostic, diagnostic} from './errors.js'
import {operationAliases} from './ops.js'

export const MAX_INSTRUCTIONS = 1000
export const MAX_TOKENS = 16
export const MAX_LABELS = 500
export const MAX_STRING_BYTES = 65535

/** Устаревшие имена параметров, которые парсер подменяет молча. LParser.statement */
const PARAM_ALIASES = {
    '@configure': '@config',
    configure: 'config'
}

const isLineBreak = (char) => char === '\n' || char === ';'

/** Сколько байт занимает символ в записи игры. См. ByteBufferOutput.writeUTF */
function utf8Size(char) {
    const code = char.charCodeAt(0)
    return code !== 0 && code <= 0x7f ? 1 : code <= 0x7ff ? 2 : 3
}
const isSpace = (char) => char === ' ' || char === '\t'

/** Хвостовые шестнадцатеричные цифры экранирования `\uXXXX`. LParser.isHex */
const isHex = (char) => char !== undefined && /[0-9a-fA-F]/.test(char)

class Parser {
    constructor(text) {
        /*
         * Возврат каретки приравнивается к переводу строки прямо на входе: программа,
         * скопированная из-под Windows, раньше разбиралась через раз. LParser:28
         */
        this.chars = text.split('\r').join('\n')
        this.pos = 0
        this.line = 0
        this.statements = []
        this.diagnostics = []
        this.labels = new Map()
        this.pendingJumps = []
    }

    report(code, data) {
        this.diagnostics.push(diagnostic(code, this.line, data))
    }

    /** Пропускает остаток строки после решётки. */
    skipComment() {
        while (this.pos < this.chars.length && this.chars[this.pos++] !== '\n') { /* до конца строки */ }
    }

    /**
     * Читает строковый литерал вместе с кавычками. Перевод строки внутри — ошибка.
     *
     * Экранирование парсер не раскрывает, а только пропускает: в поле блока должен попасть
     * тот же текст, что был в программе, иначе запись обратно испортила бы её. Раскрывает
     * его ассемблер. LParser.string
     */
    readString() {
        const from = this.pos
        let utf8Length = 0

        while (++this.pos < this.chars.length) {
            const char = this.chars[this.pos]
            const next = this.chars[this.pos + 1]

            // \n, \" и \\ пропускаются парой: закрывающей кавычкой такая кавычка не считается
            if (char === '\\' && (next === 'n' || next === '"' || next === '\\')) {
                utf8Length += utf8Size(next)
                this.pos++
                continue
            }

            // \uXXXX: четыре шестнадцатеричные цифры, иначе ошибка
            if (char === '\\' && next === 'u') {
                const digits = [2, 3, 4, 5].map(offset => this.chars[this.pos + offset])

                if (!digits.every(isHex)) {
                    this.report(Diagnostic.INVALID_ESCAPE)
                    return this.chars.slice(from, this.pos)
                }

                utf8Length += utf8Size(String.fromCharCode(parseInt(digits.join(''), 16)))
                this.pos += 5
                continue
            }

            if (char === '\n') {
                this.report(Diagnostic.MISSING_CLOSING_QUOTE)
                return this.chars.slice(from, this.pos)
            }
            if (char === '"') break

            utf8Length += utf8Size(char)
        }

        if (this.pos >= this.chars.length || this.chars[this.pos] !== '"') {
            this.report(Diagnostic.MISSING_CLOSING_QUOTE)
            return this.chars.slice(from)
        }

        if (utf8Length > MAX_STRING_BYTES) this.report(Diagnostic.STRING_TOO_LONG)

        this.pos++
        return this.chars.slice(from, this.pos)
    }

    /** Читает обычный токен до пробела, решётки или конца строки. */
    readToken() {
        const from = this.pos

        while (this.pos < this.chars.length) {
            const char = this.chars[this.pos]
            if (isLineBreak(char) || isSpace(char) || char === '#') break
            this.pos++
        }

        return this.chars.slice(from, this.pos)
    }

    readStatement() {
        const tokens = []
        let expectSpace = false

        while (this.pos < this.chars.length) {
            const char = this.chars[this.pos]

            if (isLineBreak(char)) break

            if (tokens.length >= MAX_TOKENS) {
                this.report(Diagnostic.TOO_MANY_TOKENS)
                this.skipComment()
                return tokens
            }

            if (expectSpace && !isSpace(char) && char !== '#') {
                this.report(Diagnostic.EXPECTED_SPACE)
            }

            expectSpace = false

            if (char === '#') {
                this.skipComment()
                break
            } else if (char === '"') {
                tokens.push(this.readString())
                expectSpace = true
            } else if (!isSpace(char)) {
                tokens.push(this.readToken())
                expectSpace = true
            } else {
                this.pos++
            }
        }

        return tokens
    }

    /** Применяет переименования, которые игра держит ради совместимости со старым кодом. */
    applyAliases(tokens) {
        if (tokens[0] === 'op' && tokens.length > 1) {
            tokens[1] = operationAliases[tokens[1]] ?? tokens[1]
        }

        for (let i = 1; i < tokens.length; i++) {
            tokens[i] = PARAM_ALIASES[tokens[i]] ?? tokens[i]
        }

        return tokens
    }

    statement() {
        const tokens = this.readStatement()
        if (tokens.length === 0) return

        this.applyAliases(tokens)

        // Метка занимает строку, но не инструкцию: адреса считаются по инструкциям
        if (tokens.length === 1 && tokens[0].endsWith(':')) {
            const label = tokens[0].slice(0, -1)

            if (this.labels.size >= MAX_LABELS) {
                this.report(Diagnostic.TOO_MANY_LABELS, {label})
            } else if (this.labels.has(label)) {
                this.report(Diagnostic.DUPLICATE_LABEL, {label})
            } else {
                this.labels.set(label, this.line)
            }

            return
        }

        const statement = {op: tokens[0], params: tokens.slice(1), line: this.line}

        // У jump адресом может быть метка: её значение подставится, когда разбор дойдёт до конца
        if (statement.op === 'jump' && statement.params.length > 0 && !isInteger(statement.params[0])) {
            this.pendingJumps.push({statement, label: statement.params[0]})
            statement.params[0] = '-1'
        }

        this.statements.push(statement)
        this.line++
    }

    parse() {
        while (this.pos < this.chars.length && this.line < MAX_INSTRUCTIONS) {
            const char = this.chars[this.pos]

            if (char === '\n' || char === ';' || char === ' ') {
                this.pos++
            } else if (char === '\r') {
                // Перевод строки Windows: игра проглатывает пару целиком
                this.pos += 2
            } else {
                this.statement()
            }
        }

        for (const {statement, label} of this.pendingJumps) {
            if (this.labels.has(label)) {
                statement.params[0] = String(this.labels.get(label))
            } else {
                this.diagnostics.push(diagnostic(Diagnostic.UNDEFINED_LABEL, statement.line, {label}))
            }
        }

        return {statements: this.statements, diagnostics: this.diagnostics, labels: this.labels}
    }
}

/** Strings.canParseInt: метка отличается от адреса тем, что адрес — целое число. */
function isInteger(token) {
    return /^[+-]?\d+$/.test(token)
}

export function parse(text) {
    if (text === null || text === undefined || text === '') {
        return {statements: [], diagnostics: [], labels: new Map()}
    }

    return new Parser(text).parse()
}
