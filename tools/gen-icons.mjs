#!/usr/bin/env node
/**
 * Генератор таблицы иконок интерфейса.
 *
 * Иконки в игре не спрайты, а глифы шрифта `fonts/icon.ttf`: он загружается как обычный шрифт
 * (`ui/Fonts.java:78`), а класс `Icon` с именами вроде `add`, `copy`, `cancel`, `pencilSmall`
 * генерируется по нему при сборке. Имена глифов лежат в таблице `post` самого файла, коды —
 * в `cmap`, так что вся таблица достаётся из шрифта и нигде больше не продублирована.
 *
 * Значит для сайта не нужны никакие картинки: достаточно подключить тот же шрифт и выводить
 * символ по коду.
 *
 * Использование:
 *   node tools/gen-icons.mjs <путь-к-Mindustry>
 */

import {readFileSync, writeFileSync} from 'node:fs'
import {join, resolve} from 'node:path'

const GAME_VERSION = 'v159.7'

/** Разбирает оглавление файла шрифта. */
function tables(buffer) {
    const result = {}
    const count = buffer.readUInt16BE(4)

    for (let i = 0; i < count; i++) {
        const offset = 12 + i * 16
        result[buffer.toString('ascii', offset, offset + 4).trim()] = {
            offset: buffer.readUInt32BE(offset + 8),
            length: buffer.readUInt32BE(offset + 12)
        }
    }

    return result
}

/** Имена глифов из таблицы post версии 2.0. */
function glyphNames(buffer, post) {
    const version = buffer.readUInt32BE(post.offset)
    if (version !== 0x00020000) return null

    const count = buffer.readUInt16BE(post.offset + 32)
    const indices = []

    for (let i = 0; i < count; i++) {
        indices.push(buffer.readUInt16BE(post.offset + 34 + i * 2))
    }

    // Дальше идут имена подряд, каждое с длиной в первом байте
    const names = []
    let cursor = post.offset + 34 + count * 2
    const end = post.offset + post.length

    while (cursor < end) {
        const length = buffer.readUInt8(cursor)
        names.push(buffer.toString('latin1', cursor + 1, cursor + 1 + length))
        cursor += 1 + length
    }

    // Индексы меньше 258 ссылаются на стандартный набор Macintosh, он нам не нужен
    return indices.map(index => index < 258 ? null : names[index - 258] ?? null)
}

/** Соответствие кода символа номеру глифа из таблицы cmap, формат 4. */
function charToGlyph(buffer, cmap) {
    const count = buffer.readUInt16BE(cmap.offset + 2)
    let subtable = null

    for (let i = 0; i < count; i++) {
        const record = cmap.offset + 4 + i * 8
        const offset = cmap.offset + buffer.readUInt32BE(record + 4)
        if (buffer.readUInt16BE(offset) === 4) subtable = offset
    }

    if (subtable === null) return new Map()

    const segCountX2 = buffer.readUInt16BE(subtable + 6)
    const endBase = subtable + 14
    const startBase = endBase + segCountX2 + 2
    const deltaBase = startBase + segCountX2
    const rangeBase = deltaBase + segCountX2

    const mapping = new Map()

    for (let segment = 0; segment < segCountX2 / 2; segment++) {
        const start = buffer.readUInt16BE(startBase + segment * 2)
        const finish = buffer.readUInt16BE(endBase + segment * 2)
        const delta = buffer.readInt16BE(deltaBase + segment * 2)
        const rangeOffset = buffer.readUInt16BE(rangeBase + segment * 2)

        if (start === 0xffff) continue

        for (let code = start; code <= finish; code++) {
            let glyph
            if (rangeOffset === 0) {
                glyph = (code + delta) & 0xffff
            } else {
                const position = rangeBase + segment * 2 + rangeOffset + (code - start) * 2
                if (position + 1 >= buffer.length) continue
                const raw = buffer.readUInt16BE(position)
                glyph = raw === 0 ? 0 : (raw + delta) & 0xffff
            }

            if (glyph !== 0) mapping.set(glyph, code)
        }
    }

    return mapping
}

function main() {
    const gameRoot = resolve(process.argv[2] ?? '../Mindustry')
    const source = join(gameRoot, 'core/assets/fonts/icon.ttf')

    let buffer
    try {
        buffer = readFileSync(source)
    } catch {
        console.error(`Не найден ${source}`)
        console.error('Как развернуть исходники — см. CLAUDE.md')
        process.exit(1)
    }

    const found = tables(buffer)
    if (found.post === undefined || found.cmap === undefined) {
        console.error('В шрифте нет таблиц post или cmap: имена иконок достать неоткуда')
        process.exit(1)
    }

    const names = glyphNames(buffer, found.post)
    if (names === null) {
        console.error('Таблица post не версии 2.0: имён глифов в ней нет')
        process.exit(1)
    }

    const codes = charToGlyph(buffer, found.cmap)
    const icons = {}

    for (let glyph = 0; glyph < names.length; glyph++) {
        const name = names[glyph]
        const code = codes.get(glyph)
        if (name === null || code === undefined) continue

        icons[name] = code
    }

    const output = {
        gameVersion: GAME_VERSION,
        source: 'core/assets/fonts/icon.ttf',
        note: 'Файл сгенерирован. Иконки — глифы шрифта игры; имя берётся из таблицы post, код из cmap. ' +
            'Чтобы нарисовать иконку, подключите тот же шрифт и выведите символ по коду.',
        count: Object.keys(icons).length,
        icons
    }

    const target = 'core/data/icons.json'
    writeFileSync(target, JSON.stringify(output, null, 2) + '\n')

    console.log(`${target} — из ${source}`)
    console.log(`  иконок ${output.count}`)

    const wanted = ['add', 'copy', 'cancel', 'pencil', 'pencilSmall', 'trash', 'settings']
    for (const name of wanted) {
        if (icons[name] !== undefined) {
            console.log(`  ${name.padEnd(12)} U+${icons[name].toString(16).toUpperCase()}`)
        }
    }
}

main()
