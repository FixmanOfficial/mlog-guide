/**
 * Снимает спеки блоков из `content/Blocks.java` в `core/data/block-specs.json`.
 *
 * Размер, здоровье, дальность связи, скорость процессора, объём памяти, сторона дисплея —
 * всё то, что модель мира отдаёт через `sensor` и по чему рисуется карта. Раньше это было
 * написано руками, и здоровье оказалось неверным у всех десяти блоков сразу: его в игре почти
 * никогда не задают числом, а выводят из размера и состава.
 *
 * Формула из `Block.init`:
 *
 *     health = round(size * size * 40 * (1 + сумма healthScaling всех предметов), 5)
 *
 * Поэтому генератор читает ещё и `content/Items.java`: у большинства предметов множитель
 * нулевой, а у тория, фазового волокна, вольфрама и прочего — нет.
 *
 *   node tools/gen-block-specs.mjs <путь-к-Mindustry>
 */

import {readFileSync, writeFileSync} from 'node:fs'
import {join, resolve} from 'node:path'

/** Блоки, которые моделирует песочница. Остальные пока не нужны. */
const WANTED = [
    'message', 'switch', 'door',
    'micro-processor', 'logic-processor', 'hyper-processor',
    'memory-cell', 'memory-bank',
    'logic-display', 'large-logic-display'
]

/** Поля, которые нас интересуют. Всё остальное в теле блока пропускается. */
const FIELDS = ['size', 'health', 'scaledHealth', 'range', 'instructionsPerTick', 'displaySize', 'memoryCapacity']

/** Тело фигурных скобок, начиная с позиции первой из них. */
function body(source, from) {
    let depth = 0

    for (let i = from; i < source.length; i++) {
        if (source[i] === '{') depth++
        if (source[i] === '}' && --depth === 0) return source.slice(from, i)
    }

    return ''
}

/** Простое арифметическое выражение с известными постоянными: `8 * 22`, `100 * wallHealthMultiplier`. */
function evaluate(text, constants) {
    const replaced = text.replace(/[A-Za-z_]\w*/g, (name) => {
        if (constants[name] === undefined) throw new Error(`неизвестная постоянная: ${name}`)
        return String(constants[name])
    })

    if (!/^[\d\s+\-*/.()]+$/.test(replaced)) throw new Error(`не выражение: ${text}`)

    // eslint-disable-next-line no-new-func — выражение уже проверено на состав
    return Function(`"use strict"; return (${replaced})`)()
}

/** healthScaling каждого предмета: у большинства ноль, поэтому важны исключения. */
function itemScaling(source) {
    const scaling = {}
    const item = /(\w+)\s*=\s*new Item\("([\w-]+)"/g

    for (const match of source.matchAll(item)) {
        const start = source.indexOf('{{', match.index)
        const inner = start === -1 ? '' : body(source, start + 1)
        const found = inner.match(/healthScaling\s*=\s*([\d.]+)f?/)

        scaling[match[2]] = found === null ? 0 : Number(found[1])
    }

    return scaling
}

/** Постоянные, объявленные прямо в `load()`: например `int wallHealthMultiplier = 4`. */
function constants(source) {
    const found = {}

    for (const match of source.matchAll(/\b(?:int|float)\s+(\w+)\s*=\s*([\d.]+)f?\s*;/g)) {
        found[match[1]] = Number(match[2])
    }

    return found
}

function parseBlock(source, name, constants) {
    const declaration = new RegExp(`new\\s+\\w+\\("${name}"\\)\\s*\\{\\{`)
    const match = source.match(declaration)
    if (match === null) return null

    const inner = body(source, source.indexOf('{{', match.index) + 1)
    const spec = {}

    for (const field of FIELDS) {
        const found = inner.match(new RegExp(`(?:^|[\\s;{])${field}\\s*=\\s*([^;]+);`))
        if (found !== null) spec[field] = evaluate(found[1].trim().replace(/f$/, ''), constants)
    }

    const requirements = inner.match(/with\(([^)]*)\)/)
    spec.requirements = requirements === null ? [] : [...requirements[1].matchAll(/Items\.(\w+)\s*,\s*(\d+)/g)]
        .map(entry => ({item: entry[1], amount: Number(entry[2])}))

    return spec
}

/** Имя поля в Java не всегда совпадает с именем предмета: metaglass, phaseFabric, surgeAlloy. */
function itemNames(source) {
    const names = {}
    for (const match of source.matchAll(/(\w+)\s*=\s*new Item\("([\w-]+)"/g)) names[match[1]] = match[2]
    return names
}

/** Block.init: здоровье выводится из размера и состава, если его не задали числом. */
function health(spec, scaling, names) {
    if (spec.health !== undefined) return spec.health

    const size = spec.size ?? 1

    if (spec.scaledHealth !== undefined) return Math.trunc(size * size * spec.scaledHealth)

    let total = 1
    for (const {item} of spec.requirements) total += scaling[names[item] ?? item] ?? 0

    // Mathf.round(value, 5): к ближайшему кратному пяти
    return Math.round(size * size * 40 * total / 5) * 5
}

function main() {
    const gameRoot = resolve(process.argv[2] ?? '../Mindustry')
    const read = (path) => readFileSync(join(gameRoot, 'core/src/mindustry', path), 'utf8')

    let blocks
    let items
    let logic
    try {
        blocks = read('content/Blocks.java')
        items = read('content/Items.java')
        logic = read('world/blocks/logic/LogicBlock.java')
    } catch (error) {
        console.error(`Не найдены исходники: ${error.message}`)
        process.exit(1)
    }

    const scaling = itemScaling(items)
    const names = itemNames(items)
    const known = constants(blocks)

    // Дальность связи по умолчанию объявлена в самом классе процессора
    const defaultRange = Number(logic.match(/public float range\s*=\s*8\s*\*\s*(\d+)/)?.[1] ?? 10) * 8

    const specs = {}

    for (const name of WANTED) {
        const parsed = parseBlock(blocks, name, known)

        if (parsed === null) {
            console.error(`Пропущен ${name}: объявление не найдено`)
            continue
        }

        const spec = {size: parsed.size ?? 1, health: health(parsed, scaling, names)}

        if (parsed.instructionsPerTick !== undefined) {
            spec.ipt = parsed.instructionsPerTick
            spec.range = parsed.range ?? defaultRange
        }

        if (parsed.memoryCapacity !== undefined) spec.memoryCapacity = parsed.memoryCapacity
        if (parsed.displaySize !== undefined) spec.displaySize = parsed.displaySize

        spec.requirements = parsed.requirements

        specs[name] = spec
    }

    writeFileSync('core/data/block-specs.json', JSON.stringify({
        gameVersion: 'v159.7',
        source: 'core/src/mindustry/content/Blocks.java',
        note: 'Файл сгенерирован, править вручную нельзя. Здоровье посчитано формулой Block.init: '
            + 'round(size * size * 40 * (1 + сумма healthScaling), 5), если оно не задано числом.',
        blocks: specs
    }, null, 2) + '\n')

    console.log(`core/data/block-specs.json: ${Object.keys(specs).length} блоков`)
    for (const [name, spec] of Object.entries(specs)) {
        console.log(`  ${name.padEnd(21)} размер ${spec.size}, здоровье ${spec.health}`)
    }
}

main()
