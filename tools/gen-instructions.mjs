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
import {GAME_VERSION} from './version.mjs'

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

/**
 * Достаёт значения перечисления и, если оно их несёт, имена параметров каждого значения.
 *
 * Часть перечислений в игре хранит человеческие имена полей прямо в объявлении:
 *
 *   move("x", "y"), build("x", "y", "block", "rotation", "config"), idle
 *   enabled("to"), shoot("x", "y", "shoot"), shootp(true, "unit", "shoot")
 *
 * Именно поэтому в игровом редакторе у `control enabled` видно одно поле, а у `control shoot` —
 * три, и подписаны они по-человечески. Значение без параметров не показывает полей вовсе.
 *
 * Признак такого перечисления — объявленное в нём поле `String[] params`. Без этой проверки
 * разбор потащил бы мусор: у LogicOp в скобках стоит символ операции, а не имя поля.
 */
function parseEnum(root, name) {
    const path = enumPath(root, name)
    if (!existsSync(path)) return null

    const text = readFileSync(path, 'utf8')
    const start = text.indexOf(`enum ${name}{`)
    if (start === -1) return null

    const body = block(text, text.indexOf('{', start))
    const clean = stripComments(body)
    const subsets = parseSubsets(text, name)
    const carriesParams = /String\[\]\s+params/.test(clean)

    // Часть перечислений несёт символ для показа: у LogicOp это «+», «//», «%%» и так далее,
    // и в редакторе на кнопке видно именно его, а не имя значения. LogicOp.toString
    const carriesSymbol = /String\s+symbol/.test(clean)
    const symbols = {}

    // Флаг func у операции означает запись функцией: max(a, b) вместо a max b
    const flags = {}

    // Значения перечисления идут до первой точки с запятой ВЕРХНЕГО уровня: внутри лямбд
    // и списков параметров точек с запятой нет, но скобки есть, поэтому считаем глубину
    const head = cutAtTopLevel(clean, ';')

    // Делим по запятым верхнего уровня и берём ведущий идентификатор каждого куска.
    // Регулярка тут не годится: лямбды вроде max("max", true, Math::max) полны запятых
    const values = []
    const params = {}

    for (const part of splitTopLevel(head, ',')) {
        const match = part.trim().match(/^([a-zA-Z_]\w*)/)
        if (match === null || values.includes(match[1])) continue

        values.push(match[1])
        const args = part.includes('(') ? part.slice(part.indexOf('(') + 1) : ''

        if (carriesParams) {
            // Ведущее true или false — это флаг объектного значения, а не имя поля
            params[match[1]] = [...args.matchAll(/"([^"]*)"/g)].map(argument => argument[1])
        }

        if (carriesSymbol) {
            const symbol = args.match(/"([^"]*)"/)
            if (symbol !== null) symbols[match[1]] = symbol[1]

            // Второй аргумент, равный true, означает запись функцией: max(a, b)
            if (/^\s*"[^"]*"\s*,\s*true\s*,/.test(args)) flags[match[1]] = {func: true}
        }
    }

    return {
        values,
        params: carriesParams ? params : null,
        symbols: carriesSymbol ? symbols : null,
        flags: carriesSymbol && Object.keys(flags).length > 0 ? flags : null,
        subsets: Object.keys(subsets).length > 0 ? subsets : null
    }
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

/**
 * Приводит сырую подсказку к виду, годному для редактора: выбрасывает ссылки на то,
 * что параметром не является (в разбор попадают локальные переменные вроде get у radar),
 * и решает, можно ли считать раскладку полной.
 */
function buildHint(hint, params) {
    const names = new Set(params.map(param => param.name))
    const items = hint.items.filter(item => item.param === undefined || names.has(item.param))

    return {
        // Полной считается раскладка без ветвлений, в которой упомянут каждый параметр
        complete: !hint.dynamic && params.every(param =>
            items.some(item => item.param === param.name)),
        items
    }
}

/** Тело метода по сигнатуре, или null, если метода нет. */
function methodBody(classBody, signature) {
    const index = classBody.indexOf(signature)
    if (index === -1) return null
    return block(classBody, classBody.indexOf('{', index + signature.length))
}

/**
 * Подсказка по раскладке строки инструкции в редакторе игры.
 *
 * ВАЖНО: подсказка, а не истина. Надёжно снимается примерно у трети инструкций — остальные
 * строят раскладку динамически или через обёртки, которые статическим разбором не берутся.
 * У неполных стоит complete: false, и редактор строит строку сам, по списку параметров.
 * Гнаться за полнотой тут не стоит: расположение полей — наше решение, а не данные игры,
 * и сами параметры всё равно генерируются и сверяются тестом.
 *
 * Метод build(Table) собирает строку из подписей и полей: `table.add(" = ")` рисует текст,
 * `field(table, имя, ...)` — редактируемое поле, `row(table)` переносит строку, а кнопка
 * с `showSelect` открывает список значений перечисления. Порядок вызовов и есть порядок
 * элементов на экране.
 *
 * Часть инструкций строит раскладку динамически, через rebuild(Table) с ветвлениями —
 * для них берётся тело rebuild, а порядок сохраняется линейно. Такие помечаются dynamic.
 */
/**
 * Именованные подмножества перечисления: `public static final TileLayer[] all = values(),
 * settable = {floor, ore, block};`. По ним игра строит меню, и полный список туда не всегда
 * попадает.
 */
function parseSubsets(text, name) {
    const start = text.indexOf(`enum ${name}{`)
    if (start === -1) return {}

    const subsets = {}
    const declaration = new RegExp(String.raw`${name}\[\]\s+([^;]+);`, 'g')

    for (const match of text.slice(start).matchAll(declaration)) {
        for (const part of match[1].split(/,\s*(?=\w+\s*=)/)) {
            const [, subset, values] = part.match(/(\w+)\s*=\s*\{([^}]*)\}/) ?? []
            if (subset !== undefined) subsets[subset] = values.split(',').map(item => item.trim())
        }
    }

    return subsets
}

function parseLayout(classBody) {
    let body = methodBody(classBody, 'public void build(Table table)')
    if (body === null) return null

    // build часто только зовёт rebuild: настоящая раскладка там
    if (/^\s*rebuild\(table\);\s*$/.test(stripComments(body))) {
        body = methodBody(classBody, 'void rebuild(Table table)') ?? body
    }

    const clean = stripComments(body)
    const layout = []

    const token = /(?:table|t)\.add\(\s*"([^"]*)"\s*\)|(?:^|[^\w.])field\(\s*\w+\s*,\s*(\w+)|fields\(\s*\w+\s*,\s*"([^"]*)"\s*,\s*(\w+)|(?:^|[^\w.])row\(\s*\w+\s*\)|showSelect\(\s*\w+\s*,\s*(\w+)\.(\w+)\s*,\s*(\w+)/g

    for (const match of clean.matchAll(token)) {
        const [, label, fieldName, fieldsLabel, fieldsName, enumType, enumSubset, enumParam] = match

        if (label !== undefined) layout.push({kind: 'label', text: label})
        else if (fieldName !== undefined) layout.push({kind: 'field', param: fieldName})
        else if (fieldsName !== undefined) {
            layout.push({kind: 'label', text: fieldsLabel})
            layout.push({kind: 'field', param: fieldsName})
        } else if (enumParam !== undefined) {
            // Меню открывается не всегда по полному списку: у `setblock` это TileLayer.settable,
            // где слоя building нет — здание нельзя поставить, его создаёт блок
            layout.push({
                kind: 'select', param: enumParam, enum: enumType,
                ...(enumSubset === 'all' ? {} : {subset: enumSubset})
            })
        }
        else layout.push({kind: 'row'})
    }

    return {dynamic: /\bif\s*\(/.test(clean), items: layout}
}

/**
 * Категории инструкций: имя, цвет из палитры и значок. Объявлены полями `LCategory`
 * одной строкой на категорию — `io = new LCategory("io", Pal.logicIo, Icon.logicSmall)`.
 *
 * Цвет здесь именем константы `Pal`, а не числом: сама палитра снимается `gen-pal.mjs`,
 * и держать её значение в двух местах значит однажды их разойтись.
 */
function parseCategories(root) {
    const source = join(root, 'core/src/mindustry/logic/LCategory.java')
    const text = stripComments(readFileSync(source, 'utf8'))

    const pattern = /(\w+)\s*=\s*new LCategory\(\s*"(\w+)"\s*,\s*Pal\.(\w+)\s*(?:,\s*Icon\.(\w+)\s*)?\)/g
    const categories = {}

    for (const [, field, name, color, icon] of text.matchAll(pattern)) {
        if (field !== name) throw new Error(`LCategory: поле ${field} названо ${name}`)
        categories[name] = {color, icon: icon ?? null}
    }

    if (Object.keys(categories).length === 0) throw new Error('LCategory: не разобралась ни одна категория')

    return categories
}

/** arc.util.Strings.insertSpaces: пробел ставится перед каждой заглавной, кроме первой. */
function insertSpaces(text) {
    return [...text].map((letter, index) =>
        index > 0 && letter === letter.toUpperCase() && letter !== letter.toLowerCase()
            ? ` ${letter}` : letter).join('')
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

        /*
         * Чем меню добавления решает, показывать ли инструкцию (`LogicDialog`, строка 302):
         * скрытая не показывается никогда, привилегированная — только у процессора мира,
         * `nonPrivileged` — наоборот, только у обычного. В v159.7 последнего нет ни у кого,
         * но снимается оно всё равно: появится в новой версии — приедет само.
         */
        const hidden = /boolean hidden\(\)\s*\{\s*return true/.test(full)
        const nonPrivileged = /boolean nonPrivileged\(\)\s*\{\s*return true/.test(full)

        // `noop` зарегистрирован классом InvalidStatement: это заглушка неразобранной
        // строки, и в меню её тоже нет
        const invalid = className === 'InvalidStatement'

        classes.set(className, {
            opcode, parent, category, privileged, hidden, nonPrivileged, invalid,
            fields: parseFields(body),
            layout: parseLayout(full)
        })
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
    const enumParams = {}
    const enumSymbols = {}
    const enumFlags = {}
    const instructions = []

    /** Раскладка класса или его родителя: подмножества меню объявлены именно там. */
    const hintOf = (entry) => (entry.layout ?? classes.get(entry.parent)?.layout)?.items

    for (const className of order) {
        const entry = classes.get(className)
        const fields = fieldsOf(className)

        const params = fields.map(field => {
            const parsed = parseEnum(gameRoot, field.type)
            const values = parsed === null ? null : parsed.values

            if (parsed !== null) {
                enums[field.type] = parsed.values
                if (parsed.params !== null) enumParams[field.type] = parsed.params
                if (parsed.symbols !== null) enumSymbols[field.type] = parsed.symbols
                if (parsed.flags !== null) enumFlags[field.type] = parsed.flags
            }

            /*
             * Меню в игре открывается не всегда по полному списку: у `setblock` это
             * `TileLayer.settable`, где нет слоя building. Поэтому если раскладка выбрала
             * подмножество, параметр несёт свой набор значений, а не весь.
             */
            const select = (hintOf(entry) ?? []).find(item => item.param === field.name)
            const subset = select?.subset === undefined ? null : parsed?.subsets?.[select.subset] ?? null

            return {
                name: field.name,
                type: values !== null ? field.type : field.type === 'String' ? 'value' : field.type,
                default: field.default,
                ...(values !== null ? {enum: field.type} : {}),
                ...(subset !== null ? {options: subset} : {})
            }
        })

        const hint = entry.layout ?? classes.get(entry.parent)?.layout ?? null

        instructions.push({
            opcode: entry.opcode,
            // `LStatement.name`: имя класса без «Statement», пробел перед каждой заглавной
            name: insertSpaces(className.replace('Statement', '')),
            category: entry.category === null
                ? (classes.get(entry.parent)?.category?.[1] ?? 'unknown')
                : entry.category[1],
            privileged: entry.privileged,
            hidden: entry.hidden,
            nonPrivileged: entry.nonPrivileged,
            invalid: entry.invalid,
            params,
            layoutHint: hint === null ? null : buildHint(hint, params)
        })
    }

    const categories = parseCategories(gameRoot)

    const output = {
        gameVersion: GAME_VERSION,
        source: 'core/src/mindustry/logic/LStatements.java',
        note: 'Файл сгенерирован. Порядок параметров совпадает с порядком объявления полей — ' +
            'именно его использует сериализация игры. layoutHint снят из build(Table) и полон ' +
            'не везде: при complete=false редактор строит строку сам, по списку параметров.',
        counts: {
            instructions: instructions.length,
            processor: instructions.filter(instruction => !instruction.privileged).length,
            world: instructions.filter(instruction => instruction.privileged).length,
            completeLayoutHints: instructions.filter(instruction => instruction.layoutHint?.complete).length,
            hidden: instructions.filter(instruction => instruction.hidden || instruction.invalid).length
        },
        // Категории: порядок объявления, он же порядок в окне игры
        categories,
        enums,
        // Имена полей, которые игра показывает для каждого значения перечисления.
        // Значение без параметров не показывает полей вовсе — так работает control idle.
        enumParams,
        // Символ значения: у LogicOp на кнопке видно «+», а не «add». LogicOp.toString
        enumSymbols,
        // Дополнительные признаки значения: func означает запись функцией, max(a, b)
        enumFlags,
        instructions
    }

    const target = 'core/data/instructions.json'
    writeFileSync(target, JSON.stringify(output, null, 2) + '\n')

    console.log(`${target} — из ${source}`)
    console.log(`  инструкций ${output.counts.instructions}: ` +
        `процессорных ${output.counts.processor}, мира ${output.counts.world}`)
    console.log(`  полных раскладок из игры: ${output.counts.completeLayoutHints}`)
    console.log(`  перечислений ${Object.keys(enums).length}: ${Object.keys(enums).join(', ')}`)
    console.log(`  категорий ${Object.keys(categories).length}: ${Object.keys(categories).join(', ')}`)
}

main()
