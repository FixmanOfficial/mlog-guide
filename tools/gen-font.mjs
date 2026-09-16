#!/usr/bin/env node
/**
 * Вырезка подмножества основного шрифта игры.
 *
 * `core/assets/fonts/font.woff` весит 3.6 МБ и содержит 42 515 глифов — почти всё это иероглифы
 * и письменности, которых на русско-английском сайте не будет никогда. Целиком такое на страницу
 * не отдашь, но это и не нужно: берём латиницу, кириллицу и знаки препинания, остальное
 * выбрасываем. Получается несколько десятков килобайт, и редактор набирается настоящим шрифтом
 * игры, а не похожим.
 *
 * Что делает:
 *   1. распаковывает WOFF в обычный TrueType — таблицы внутри сжаты zlib;
 *   2. собирает номера нужных глифов по таблице cmap, добавляя составные части составных глифов;
 *   3. перестраивает glyf, loca, hmtx, cmap и maxp под новую нумерацию;
 *   4. выбрасывает всё, что не нужно для отрисовки: разметку GSUB/GPOS/GDEF, имена глифов;
 *   5. пакует результат в WOFF2 — так он вдвое легче.
 *
 * Использование:
 *   node tools/gen-font.mjs <путь-к-Mindustry> [файл-назначения]
 */

import {readFileSync, writeFileSync} from 'node:fs'
import {inflateSync} from 'node:zlib'
import {join, resolve} from 'node:path'

import {encodeWoff2} from './woff2.mjs'

/**
 * Что оставляем. Кириллица и латиница целиком, плюс знаки, которые реально встречаются
 * в интерфейсе и в текстах игры.
 */
const RANGES = [
    [0x0020, 0x007e], // ASCII
    [0x00a0, 0x00ff], // латиница с диакритикой, градусы, умножение
    [0x0400, 0x045f], // кириллица
    [0x0490, 0x0491], // украинская Ґ
    [0x2010, 0x2015], // тире
    [0x2018, 0x201f], // кавычки
    [0x2020, 0x2022], // сноски и точка
    [0x2026, 0x2026], // многоточие
    [0x2030, 0x2030], // промилле
    [0x2039, 0x203a], // угловые кавычки
    [0x2044, 0x2044], // дробная черта
    [0x20a0, 0x20bf], // валюты, включая рубль
    [0x2116, 0x2116], // номер
    [0x2190, 0x2193], // стрелки
    [0x2212, 0x2212], // минус
    [0x2260, 0x2265], // сравнения
    [0x25a0, 0x25cf], // геометрия для рамок
    [0x2713, 0x2717]  // галочки и крестики
]

/** Флаги составного глифа. Спецификация TrueType, таблица glyf. */
const ARG_1_AND_2_ARE_WORDS = 0x0001
const WE_HAVE_A_SCALE = 0x0008
const MORE_COMPONENTS = 0x0020
const WE_HAVE_AN_X_AND_Y_SCALE = 0x0040
const WE_HAVE_A_TWO_BY_TWO = 0x0080

/** Распаковывает WOFF в набор таблиц. Каждая сжата zlib, если сжатая длина меньше исходной. */
function readWoff(buffer) {
    if (buffer.toString('ascii', 0, 4) !== 'wOFF') {
        // Уже TrueType: читаем оглавление напрямую
        const tables = {}
        const count = buffer.readUInt16BE(4)

        for (let i = 0; i < count; i++) {
            const entry = 12 + i * 16
            const tag = buffer.toString('ascii', entry, entry + 4)
            const offset = buffer.readUInt32BE(entry + 8)
            tables[tag] = buffer.subarray(offset, offset + buffer.readUInt32BE(entry + 12))
        }

        return tables
    }

    const tables = {}
    const count = buffer.readUInt16BE(12)

    for (let i = 0; i < count; i++) {
        const entry = 44 + i * 20
        const tag = buffer.toString('ascii', entry, entry + 4)
        const offset = buffer.readUInt32BE(entry + 4)
        const compressed = buffer.readUInt32BE(entry + 8)
        const original = buffer.readUInt32BE(entry + 12)
        const slice = buffer.subarray(offset, offset + compressed)

        tables[tag] = compressed === original ? slice : inflateSync(slice)
    }

    return tables
}

/** Соответствие кода символа номеру глифа. cmap, формат 4. */
function readCmap(cmap) {
    const count = cmap.readUInt16BE(2)
    let subtable = null

    for (let i = 0; i < count; i++) {
        const record = 4 + i * 8
        const offset = cmap.readUInt32BE(record + 4)
        if (cmap.readUInt16BE(offset) === 4) subtable = offset
    }

    if (subtable === null) throw new Error('в шрифте нет таблицы cmap формата 4')

    const segCountX2 = cmap.readUInt16BE(subtable + 6)
    const endBase = subtable + 14
    const startBase = endBase + segCountX2 + 2
    const deltaBase = startBase + segCountX2
    const rangeBase = deltaBase + segCountX2

    const mapping = new Map()

    for (let segment = 0; segment < segCountX2 / 2; segment++) {
        const start = cmap.readUInt16BE(startBase + segment * 2)
        const finish = cmap.readUInt16BE(endBase + segment * 2)
        const delta = cmap.readInt16BE(deltaBase + segment * 2)
        const rangeOffset = cmap.readUInt16BE(rangeBase + segment * 2)

        for (let code = start; code <= finish && code !== 0xffff; code++) {
            let glyph

            if (rangeOffset === 0) {
                glyph = (code + delta) & 0xffff
            } else {
                const position = rangeBase + segment * 2 + rangeOffset + (code - start) * 2
                if (position + 1 >= cmap.length) continue
                const raw = cmap.readUInt16BE(position)
                glyph = raw === 0 ? 0 : (raw + delta) & 0xffff
            }

            if (glyph !== 0) mapping.set(code, glyph)
        }
    }

    return mapping
}

/** Границы глифов из loca. */
function readLoca(loca, numGlyphs, longFormat) {
    const offsets = []

    for (let i = 0; i <= numGlyphs; i++) {
        offsets.push(longFormat ? loca.readUInt32BE(i * 4) : loca.readUInt16BE(i * 2) * 2)
    }

    return offsets
}

/** Номера глифов, из которых собран составной глиф. */
function componentsOf(glyf, start, end) {
    if (end - start < 10) return []
    if (glyf.readInt16BE(start) >= 0) return []

    const parts = []
    let cursor = start + 10

    for (;;) {
        const flags = glyf.readUInt16BE(cursor)
        parts.push(glyf.readUInt16BE(cursor + 2))
        cursor += 4

        cursor += (flags & ARG_1_AND_2_ARE_WORDS) !== 0 ? 4 : 2

        if ((flags & WE_HAVE_A_SCALE) !== 0) cursor += 2
        else if ((flags & WE_HAVE_AN_X_AND_Y_SCALE) !== 0) cursor += 4
        else if ((flags & WE_HAVE_A_TWO_BY_TWO) !== 0) cursor += 8

        if ((flags & MORE_COMPONENTS) === 0) break
        if (cursor >= end) break
    }

    return parts
}

/** Переписывает номера частей составного глифа под новую нумерацию. */
function remapComposite(data, remap) {
    if (data.length < 10 || data.readInt16BE(0) >= 0) return data

    const out = Buffer.from(data)
    let cursor = 10

    for (;;) {
        const flags = out.readUInt16BE(cursor)
        const old = out.readUInt16BE(cursor + 2)
        out.writeUInt16BE(remap.get(old) ?? 0, cursor + 2)
        cursor += 4

        cursor += (flags & ARG_1_AND_2_ARE_WORDS) !== 0 ? 4 : 2

        if ((flags & WE_HAVE_A_SCALE) !== 0) cursor += 2
        else if ((flags & WE_HAVE_AN_X_AND_Y_SCALE) !== 0) cursor += 4
        else if ((flags & WE_HAVE_A_TWO_BY_TWO) !== 0) cursor += 8

        if ((flags & MORE_COMPONENTS) === 0) break
        if (cursor >= out.length) break
    }

    return out
}

/** Собирает cmap формата 4 для набора символов. */
function buildCmap(charToNewGlyph) {
    const codes = [...charToNewGlyph.keys()].sort((a, b) => a - b)

    // Соседние коды с последовательными номерами глифов складываются в один отрезок
    const segments = []

    for (const code of codes) {
        const glyph = charToNewGlyph.get(code)
        const last = segments.at(-1)

        if (last !== undefined && code === last.end + 1 && glyph === last.startGlyph + (code - last.start)) {
            last.end = code
        } else {
            segments.push({start: code, end: code, startGlyph: glyph})
        }
    }

    segments.push({start: 0xffff, end: 0xffff, startGlyph: 0})

    const count = segments.length
    const size = 16 + count * 8
    const table = Buffer.alloc(size)

    table.writeUInt16BE(4, 0)
    table.writeUInt16BE(size, 2)
    table.writeUInt16BE(0, 4)
    table.writeUInt16BE(count * 2, 6)

    const searchRange = 2 * 2 ** Math.floor(Math.log2(count))
    table.writeUInt16BE(searchRange, 8)
    table.writeUInt16BE(Math.log2(searchRange / 2), 10)
    table.writeUInt16BE(count * 2 - searchRange, 12)

    const endBase = 14
    const startBase = endBase + count * 2 + 2
    const deltaBase = startBase + count * 2
    const rangeBase = deltaBase + count * 2

    segments.forEach((segment, index) => {
        table.writeUInt16BE(segment.end, endBase + index * 2)
        table.writeUInt16BE(segment.start, startBase + index * 2)

        const delta = segment.start === 0xffff ? 1 : (segment.startGlyph - segment.start) & 0xffff
        table.writeUInt16BE(delta, deltaBase + index * 2)
        table.writeUInt16BE(0, rangeBase + index * 2)
    })

    // Оборачиваем в заголовок cmap с одной подтаблицей для Windows Unicode
    const header = Buffer.alloc(12)
    header.writeUInt16BE(0, 0)
    header.writeUInt16BE(1, 2)
    header.writeUInt16BE(3, 4)
    header.writeUInt16BE(1, 6)
    header.writeUInt32BE(12, 8)

    return Buffer.concat([header, table])
}

const align4 = (buffer) => buffer.length % 4 === 0
    ? buffer
    : Buffer.concat([buffer, Buffer.alloc(4 - buffer.length % 4)])

function checksum(buffer) {
    const padded = align4(buffer)
    let sum = 0
    for (let i = 0; i < padded.length; i += 4) sum = (sum + padded.readUInt32BE(i)) >>> 0
    return sum
}

/** Складывает таблицы в файл TrueType. */
function buildFont(tables) {
    const tags = Object.keys(tables).sort()
    const count = tags.length

    const searchRange = 16 * 2 ** Math.floor(Math.log2(count))
    const header = Buffer.alloc(12 + count * 16)

    header.writeUInt32BE(0x00010000, 0)
    header.writeUInt16BE(count, 4)
    header.writeUInt16BE(searchRange, 6)
    header.writeUInt16BE(Math.log2(searchRange / 16), 8)
    header.writeUInt16BE(count * 16 - searchRange, 10)

    let offset = header.length
    const body = []

    tags.forEach((tag, index) => {
        const data = tables[tag]
        const entry = 12 + index * 16

        header.write(tag.padEnd(4), entry, 4, 'ascii')
        header.writeUInt32BE(checksum(data), entry + 4)
        header.writeUInt32BE(offset, entry + 8)
        header.writeUInt32BE(data.length, entry + 12)

        const padded = align4(data)
        body.push(padded)
        offset += padded.length
    })

    const font = Buffer.concat([header, ...body])

    // checkSumAdjustment в head считается по всему файлу с обнулённым полем
    const headEntry = tags.indexOf('head')
    if (headEntry !== -1) {
        const headOffset = font.readUInt32BE(12 + headEntry * 16 + 8)
        font.writeUInt32BE(0, headOffset + 8)
        font.writeUInt32BE((0xb1b0afba - checksum(font)) >>> 0, headOffset + 8)
    }

    return font
}

function main() {
    const gameRoot = resolve(process.argv[2] ?? '../Mindustry')
    const target = process.argv[3] ?? 'editor/assets/ui.woff2'
    const source = join(gameRoot, 'core/assets/fonts/font.woff')

    let buffer
    try {
        buffer = readFileSync(source)
    } catch {
        console.error(`Не найден ${source}`)
        console.error('Как развернуть исходники — см. CLAUDE.md')
        process.exit(1)
    }

    const tables = readWoff(buffer)
    const numGlyphs = tables.maxp.readUInt16BE(4)
    const longLoca = tables.head.readInt16BE(50) === 1
    const loca = readLoca(tables.loca, numGlyphs, longLoca)
    const cmap = readCmap(tables.cmap)

    // Какие символы оставляем
    const wanted = new Set()
    for (const [from, to] of RANGES) {
        for (let code = from; code <= to; code++) {
            if (cmap.has(code)) wanted.add(code)
        }
    }

    // Нулевой глиф обязателен, дальше добавляем нужные и части составных
    const keep = new Set([0])
    const queue = []

    for (const code of wanted) queue.push(cmap.get(code))

    while (queue.length > 0) {
        const glyph = queue.pop()
        if (keep.has(glyph) || glyph >= numGlyphs) continue

        keep.add(glyph)
        for (const part of componentsOf(tables.glyf, loca[glyph], loca[glyph + 1])) {
            if (!keep.has(part)) queue.push(part)
        }
    }

    const ordered = [...keep].sort((a, b) => a - b)
    const remap = new Map(ordered.map((glyph, index) => [glyph, index]))

    // Новые glyf и loca
    const pieces = []
    const offsets = [0]
    let position = 0

    for (const glyph of ordered) {
        const data = remapComposite(tables.glyf.subarray(loca[glyph], loca[glyph + 1]), remap)
        const padded = data.length % 2 === 0 ? data : Buffer.concat([data, Buffer.alloc(1)])

        pieces.push(padded)
        position += padded.length
        offsets.push(position)
    }

    const glyf = Buffer.concat(pieces)
    const useLong = position > 0x1fffe

    const newLoca = Buffer.alloc((offsets.length) * (useLong ? 4 : 2))
    offsets.forEach((value, index) => {
        if (useLong) newLoca.writeUInt32BE(value, index * 4)
        else newLoca.writeUInt16BE(value / 2, index * 2)
    })

    // Новая hmtx: у каждого оставленного глифа своя пара «ширина, левый вынос»
    const oldMetrics = tables.hhea.readUInt16BE(34)
    const hmtx = Buffer.alloc(ordered.length * 4)

    ordered.forEach((glyph, index) => {
        const metric = Math.min(glyph, oldMetrics - 1)
        const advance = tables.hmtx.readUInt16BE(metric * 4)
        const bearing = glyph < oldMetrics
            ? tables.hmtx.readInt16BE(glyph * 4 + 2)
            : tables.hmtx.readInt16BE(oldMetrics * 4 + (glyph - oldMetrics) * 2)

        hmtx.writeUInt16BE(advance, index * 4)
        hmtx.writeInt16BE(bearing, index * 4 + 2)
    })

    const charToNewGlyph = new Map()
    for (const code of wanted) {
        const mapped = remap.get(cmap.get(code))
        if (mapped !== undefined) charToNewGlyph.set(code, mapped)
    }

    const head = Buffer.from(tables.head)
    head.writeInt16BE(useLong ? 1 : 0, 50)

    const maxp = Buffer.from(tables.maxp)
    maxp.writeUInt16BE(ordered.length, 4)

    const hhea = Buffer.from(tables.hhea)
    hhea.writeUInt16BE(ordered.length, 34)

    /*
     * post версии 3.0 — это заглушка без имён глифов: имена нужны только редакторам шрифтов.
     * Выбросить саму таблицу нельзя, она обязательная, и браузер отвергнет шрифт без неё.
     */
    const post = Buffer.alloc(32)
    post.writeUInt32BE(0x00030000, 0)

    // Разметку и подсказки выбрасываем, обязательные таблицы оставляем
    const result = {
        head, hhea, maxp, hmtx, post,
        loca: newLoca,
        glyf,
        cmap: buildCmap(charToNewGlyph),
        name: tables.name
    }

    for (const tag of ['OS/2', 'cvt ', 'fpgm', 'prep', 'gasp']) {
        if (tables[tag] !== undefined) result[tag] = tables[tag]
    }

    // На страницу шрифт уходит в WOFF2: brotli сжимает его вдвое
    const font = buildFont(result)
    const packed = target.endsWith('.woff2') ? encodeWoff2(font) : font
    writeFileSync(target, packed)

    const before = (buffer.length / 1024 / 1024).toFixed(1)
    const after = (packed.length / 1024).toFixed(0)

    console.log(`${target} — из ${source}`)
    console.log(`  глифов ${ordered.length} из ${numGlyphs}, символов ${charToNewGlyph.size}`)
    console.log(`  было ${before} МБ, стало ${after} КБ`)
}

main()
