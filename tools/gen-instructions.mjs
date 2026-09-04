#!/usr/bin/env node
/**
 * Генератор схемы инструкций для редактора блоков.
 *
 * Редактору нужно знать про каждую инструкцию: какие у неё параметры, в каком порядке, какого
 * типа и с какими значениями по умолчанию. Всё это объявлено в logic/LStatements.java полями
 * класса: аннотация @RegisterStatement задаёт имя инструкции, а порядок полей — порядок
 * параметров при записи в текст (сериализацию генерирует аннотационный процессор по объявлению).
 *
 * Писать такую таблицу руками нельзя: она разъедется с игрой на первом же обновлении версии.
 *
 * Использование:
 *   node tools/gen-instructions.mjs <путь-к-Mindustry>
 */

import {readFileSync, writeFileSync, existsSync} from 'node:fs'
import {join, resolve} from 'node:path'

const GAME_VERSION = 'v159.7'

/** Перечисления лежат не только в logic/: GraphicsType живёт внутри блока дисплея. */
const ENUM_LOCATIONS = {
    GraphicsType: 'core/src/mindustry/world/blocks/logic/LogicDisplay.java'
}

const enumPath = (root, name) =>
    join(root, ENUM_LOCATIONS[name] ?? `core/src/mindustry/logic/${name}.java`)

/** Находит тело блока по позиции открывающей скобки. */
function block(text, openIndex) {
    let depth = 0

    for (let i = openIndex; i < text.length; i++) {
        if (text[i] === '{') depth++
        else if (text[i] === '}') {
            depth--
            if (depth === 0) return text.slice(openIndex + 1, i)
        }
    }

    return ''
}

/** Убирает содержимое вложенных блоков: остаются только объявления верхнего уровня класса. */
function topLevelOnly(body) {
    let depth = 0
    let out = ''

    for (const char of body) {
        if (char === '{') depth++
        else if (char === '}') depth--
        else if (depth === 0) out += char
    }

    return out
}

/**
 * Разбирает объявления полей вида
 *   public String output = "result", target = "cell1";
 *   public LogicOp op = LogicOp.add;
 *   public boolean privileged;
 */
function parseFields(body) {
    const fields = []
    const declaration = /public\s+(?!static|final|void|class)([A-Za-z_][\w.<>\[\]]*)\s+([^;{}()=]+(?:=[^;{}]*)?);/g

    for (const match of body.matchAll(declaration)) {
        const type = match[1]
        // Отсекаем объявления методов, до которых мог дотянуться шаблон
        if (match[2].includes('(')) continue

        for (const part of splitDeclarations(match[2])) {
            const [rawName, rawDefault] = part.split('=').map(piece => piece.trim())
            if (!/^[A-Za-z_]\w*$/.test(rawName)) continue

            fields.push({name: rawName, type, default: cleanDefault(rawDefault, type)})
        }
    }

    return fields
}

/** Делит «a = "x", b = "y"» по запятым верхнего уровня: внутри строк запятые не считаются. */
function splitDeclarations(text) {
    const parts = []
    let current = ''
    let inString = false

    for (let i = 0; i < text.length; i++) {
        const char = text[i]

        if (char === '"' && text[i - 1] !== '\\') inString = !inString

        if (char === ',' && !inString) {
            parts.push(current)
            current = ''
        } else {
            current += char
        }
    }

    if (current.trim() !== '') parts.push(current)
    return parts
}

function cleanDefault(value, type) {
    if (value === undefined) return null

    const trimmed = value.trim()
    if (trimmed.startsWith('"')) return trimmed.slice(1, -1)

    // Значение перечисления записывается как Тип.значение
    const enumValue = trimmed.match(new RegExp(`^${type}\\.(\\w+)$`))
    if (enumValue !== null) return enumValue[1]

    return trimmed
}

/** Достаёт значения перечисления: идентификаторы в начале тела до точки с запятой. */
function parseEnum(root, name) {
    const path = enumPath(root, name)
    if (!existsSync(path)) return null

    const text = readFileSync(path, 'utf8')
    const start = text.indexOf(`enum ${name}{`)
    if (start === -1) return null

    const body = block(text, text.indexOf('{', start))

    // Значения перечисления идут до первой точки с запятой ВЕРХНЕГО уровня: внутри лямбд
    // и списков параметров точек с запятой нет, но скобки есть, поэтому считаем глубину
    const head = cutAtTopLevel(stripComments(body), ';')

    // Делим по запятым верхнего уровня и берём ведущий идентификатор каждого куска.
    // Регулярка тут не годится: лямбды вроде max("max", true, Math::max) полны запятых
    return splitTopLevel(head, ',')
        .map(part => part.trim().match(/^([a-zA-Z_]\w*)/))
        .filter(match => match !== null)
        .map(match => match[1])
        .filter((name, index, all) => all.indexOf(name) === index)
}

/**
 * Убирает комментарии, не трогая строковые литералы. Регулярка здесь не годится: в LogicOp
 * есть операция idiv с символом "//", и наивная замена срезала бы половину перечисления.
 */
function stripComments(text) {
    let out = ''
    let inString = false
    let inChar = false

    for (let i = 0; i < text.length; i++) {
        const char = text[i]
        const escaped = text[i - 1] === '\\'

        if (!inChar && char === '"' && !escaped) inString = !inString
        else if (!inString && char === "'" && !escaped) inChar = !inChar

        if (!inString && !inChar && char === '/' && text[i + 1] === '/') {
            while (i < text.length && text[i] !== '\n') i++
            out += '\n'
            continue
        }

        if (!inString && !inChar && char === '/' && text[i + 1] === '*') {
            const end = text.indexOf('*/', i + 2)
            i = end === -1 ? text.length : end + 1
            out += ' '
            continue
        }

        out += char
    }

    return out
}

/** Проходит текст, отслеживая скобки и строки, и вызывает обработчик на символах верхнего уровня. */
function scanTopLevel(text, visit) {
    let depth = 0
    let inString = false
    let inChar = false

    for (let i = 0; i < text.length; i++) {
        const char = text[i]
        const escaped = text[i - 1] === '\\'

        if (char === '"' && !escaped && !inChar) inString = !inString
        else if (char === "'" && !escaped && !inString) inChar = !inChar

        if (!inString && !inChar) {
            if (char === '(' || char === '{' || char === '[') depth++
            else if (char === ')' || char === '}' || char === ']') depth--
            else if (depth === 0 && visit(char, i) === false) return i
        }
    }

    return -1
}

function cutAtTopLevel(text, stopChar) {
    const index = scanTopLevel(text, (char) => char !== stopChar)
    return index === -1 ? text : text.slice(0, index)
}

function splitTopLevel(text, separator) {
    const parts = []
    let start = 0

    scanTopLevel(text, (char, index) => {
        if (char !== separator) return true
        parts.push(text.slice(start, index))
        start = index + 1
        return true
    })

    parts.push(text.slice(start))
    return parts.filter(part => part.trim() !== '')
}

function main() {
    const gameRoot = resolve(process.argv[2] ?? '../Mindustry')
    const source = join(gameRoot, 'core/src/mindustry/logic/LStatements.java')

    let text
    try {
        text = readFileSync(source, 'utf8')
    } catch {
        console.error(`Не найден ${source}`)
        console.error('Как развернуть исходники — см. CLAUDE.md')
        process.exit(1)
    }

    const classes = new Map()
    const order = []

    // Закомментированная регистрация не считается: так в исходниках отключён комментарий «#»
    const header = /(^[ \t]*)@RegisterStatement\("([^"]+)"\)\s*public static class (\w+) extends (\w+)/gm

    for (const match of text.matchAll(header)) {
        const [, , opcode, className, parent] = match
        const body = topLevelOnly(block(text, text.indexOf('{', match.index + match[0].length)))
        const full = block(text, text.indexOf('{', match.index + match[0].length))

        const category = full.match(/return LCategory\.(\w+)/)
        const privileged = /boolean privileged\(\)\s*\{\s*return true/.test(full)

        classes.set(className, {opcode, parent, fields: parseFields(body), category, privileged})
        order.push(className)
    }

    // Наследники вроде uradar берут поля родителя: своих объявлений у них нет
    const fieldsOf = (className) => {
        const entry = classes.get(className)
        if (entry === undefined) return []
        const inherited = entry.fields.length === 0 ? fieldsOf(entry.parent) : entry.fields
        return inherited
    }

    const enums = {}
    const instructions = []

    for (const className of order) {
        const entry = classes.get(className)
        const fields = fieldsOf(className)

        const params = fields.map(field => {
            const values = parseEnum(gameRoot, field.type)
            if (values !== null) enums[field.type] = values

            return {
                name: field.name,
                type: values !== null ? field.type : field.type === 'String' ? 'value' : field.type,
                default: field.default,
                ...(values !== null ? {enum: field.type} : {})
            }
        })

        instructions.push({
            opcode: entry.opcode,
            category: entry.category === null
                ? (classes.get(entry.parent)?.category?.[1] ?? 'unknown')
                : entry.category[1],
            privileged: entry.privileged,
            params
        })
    }

    const output = {
        gameVersion: GAME_VERSION,
        source: 'core/src/mindustry/logic/LStatements.java',
        note: 'Файл сгенерирован. Порядок параметров совпадает с порядком объявления полей — именно его использует сериализация игры.',
        counts: {
            instructions: instructions.length,
            processor: instructions.filter(instruction => !instruction.privileged).length,
            world: instructions.filter(instruction => instruction.privileged).length
        },
        enums,
        instructions
    }

    const target = 'core/data/instructions.json'
    writeFileSync(target, JSON.stringify(output, null, 2) + '\n')

    console.log(`${target} — из ${source}`)
    console.log(`  инструкций ${output.counts.instructions}: ` +
        `процессорных ${output.counts.processor}, мира ${output.counts.world}`)
    console.log(`  перечислений ${Object.keys(enums).length}: ${Object.keys(enums).join(', ')}`)
}

main()
