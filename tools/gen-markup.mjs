#!/usr/bin/env node
/**
 * Генератор таблицы цветов текстовой разметки.
 *
 * Строки игры размечены цветом прямо в тексте: `[accent]Получите: [][lightgray]30[]/100`.
 * Имена в скобках — не выдумка перевода, а таблица `arc.graphics.Colors`, которую игра
 * дополняет своими пятью в `UI.init`. Без неё разметку не разобрать: `[stat]` это `#4d81ff`,
 * и угадать это нельзя.
 *
 * Таблица собирается из трёх мест:
 *  - `arc/graphics/Color.java` — сами константы, `new Color(0xrrggbbaa)` или доли;
 *  - `arc/graphics/Colors.reset()` — какие из них попадают в разметку и под какими именами,
 *    плюс переопределения вида `Color.valueOf("e55454")` для красного и зелёного;
 *  - `mindustry/core/UI.java` — `Colors.put` игры: accent, stat, negstat, highlight, unlaunched.
 *
 * Использование:
 *   node tools/gen-markup.mjs <путь-к-Mindustry> [путь-к-Arc]
 */

import {readFileSync, writeFileSync} from 'node:fs'
import {join, resolve} from 'node:path'

const GAME_VERSION = 'v159.7'

/** gradle.properties: игра закрепляет arc хешем коммита. */
const ARC_HASH = '208a754044'

const hex = (value) => `#${value.toString(16).padStart(6, '0')}`

/** Color(int rgba8888): старшие три байта — цвет, младший — прозрачность. */
const fromRgba = (rgba) => hex(Math.floor(rgba / 256))

/** Color(float r, g, b, a) */
const fromFloats = (r, g, b) => hex(
    (Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255))

/** Color.lerp: смешение по каналам. Нужно ровно одному цвету — `highlight`. */
function lerp(from, to, progress) {
    const channels = (value) => [1, 3, 5].map(at => parseInt(value.slice(at, at + 2), 16))
    const [a, b] = [channels(from), channels(to)]

    return hex(a.reduce((packed, channel, index) =>
        (packed << 8) | Math.round(channel + (b[index] - channel) * progress), 0))
}

/** Константы `Color`: обе записи, целым числом и долями. */
function parseColorConstants(arcRoot) {
    const source = readFileSync(join(arcRoot, 'arc-core/src/arc/graphics/Color.java'), 'utf8')
    const colors = {}

    for (const [, name, value] of source.matchAll(
        /public static final Color (\w+) = new Color\(0x([0-9a-fA-F]{8})\)/g)) {
        colors[name] = fromRgba(parseInt(value, 16))
    }

    for (const [, name, r, g, b] of source.matchAll(
        /public static final Color (\w+) = new Color\(([\d.]+)f?,\s*([\d.]+)f?,\s*([\d.]+)f?,\s*[\d.]+f?\)/g)) {
        colors[name] = fromFloats(Number(r), Number(g), Number(b))
    }

    if (Object.keys(colors).length === 0) throw new Error('Color.java: не разобрана ни одна константа')

    return colors
}

/**
 * `Colors.reset()`: имена разметки. Порядок важен только для чтения — в конце игра
 * дублирует все имена строчными без подчёркиваний, и пользуются на практике именно ими.
 */
function parseMarkupNames(arcRoot, constants) {
    const source = readFileSync(join(arcRoot, 'arc-core/src/arc/graphics/Colors.java'), 'utf8')
    const colors = {}

    for (const [, name, expression] of source.matchAll(/map\.put\("(\w+)",\s*([^)]+(?:\))?)\);/g)) {
        const constant = expression.match(/^Color\.(\w+)$/)
        const literal = expression.match(/^Color\.valueOf\("([0-9a-fA-F]{6})"\)$/)

        if (constant !== null) colors[name] = constants[constant[1]]
        else if (literal !== null) colors[name] = `#${literal[1].toLowerCase()}`
        else continue

        if (colors[name] === undefined) throw new Error(`Colors.java: неизвестный цвет ${expression}`)
    }

    // «lowercase versions» в конце reset(): те же цвета строчными и без подчёркиваний
    for (const [name, value] of Object.entries({...colors})) {
        colors[name.toLowerCase().replaceAll('_', '')] = value
    }

    return colors
}

/** `UI.init`: пять цветов, которые добавляет уже игра. */
function parseGameColors(gameRoot, pal, constants) {
    const source = readFileSync(join(gameRoot, 'core/src/mindustry/core/UI.java'), 'utf8')
    const colors = {}

    for (const [, name, expression] of source.matchAll(/Colors\.put\("(\w+)",\s*(.+?)\);/g)) {
        const palette = expression.match(/^Pal\.(\w+)$/)
        const literal = expression.match(/^Color\.valueOf\("([0-9a-fA-F]{6})"\)$/)
        const mixed = expression.match(/^Pal\.(\w+)\.cpy\(\)\.lerp\(Color\.(\w+),\s*([\d.]+)f\)$/)

        if (palette !== null) colors[name] = pal[palette[1]]
        else if (literal !== null) colors[name] = `#${literal[1].toLowerCase()}`
        else if (mixed !== null) colors[name] = lerp(pal[mixed[1]], constants[mixed[2]], Number(mixed[3]))
        else throw new Error(`UI.java: непонятное выражение ${expression}`)

        if (colors[name] === undefined) throw new Error(`UI.java: неизвестный цвет ${expression}`)
    }

    if (Object.keys(colors).length === 0) throw new Error('UI.java: не разобран ни один Colors.put')

    return colors
}

function main() {
    const gameRoot = resolve(process.argv[2] ?? '../Mindustry')
    const arcRoot = resolve(process.argv[3] ?? '../Arc')

    let pal
    try {
        pal = JSON.parse(readFileSync('core/data/pal.json', 'utf8')).colors
    } catch {
        console.error('Не найден core/data/pal.json — сначала запустите tools/gen-pal.mjs')
        process.exit(1)
    }

    let constants
    try {
        constants = parseColorConstants(arcRoot)
    } catch (error) {
        console.error(`Не разобран arc: ${error.message}`)
        console.error('Как развернуть arc — см. CLAUDE.md')
        process.exit(1)
    }

    const colors = {...parseMarkupNames(arcRoot, constants), ...parseGameColors(gameRoot, pal, constants)}

    const target = 'core/data/markup-colors.json'
    writeFileSync(target, JSON.stringify({
        gameVersion: GAME_VERSION,
        arcHash: ARC_HASH,
        source: 'arc/graphics/Color.java, arc/graphics/Colors.java, mindustry/core/UI.java',
        note: 'Файл сгенерирован, править вручную нельзя. Имена — те, что встречаются в тексте '
            + 'игры в квадратных скобках: [accent], [lightgray], [stat].',
        colors
    }, null, 2) + '\n')

    console.log(`${target}: ${Object.keys(colors).length} имён`)
}

main()
