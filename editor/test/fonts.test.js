/**
 * Шрифты в WOFF2: файлы целые и разбираются обратно.
 *
 * Собирает их `tools/gen-font.mjs` и `tools/gen-webfonts.mjs`. Браузер битый шрифт молча
 * отбрасывает и рисует запасным — заметить это глазом трудно, поэтому формат проверяется здесь.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import {readFileSync} from 'node:fs'
import {brotliDecompressSync} from 'node:zlib'

const FONTS = [
    ['../assets/ui.woff2', ['cmap', 'glyf', 'head', 'hmtx', 'loca']],
    ['../assets/icon.woff2', ['cmap', 'glyf', 'post']],
    ['../assets/mono.woff2', ['cmap', 'GSUB']],
    ['../../render/assets/logic.woff2', ['cmap', 'glyf']]
]

/** UIntBase128 из спецификации WOFF2. */
function base128(buffer, at) {
    let value = 0

    for (let i = 0; i < 5; i++) {
        const byte = buffer[at + i]
        value = value * 128 + (byte & 0x7f)
        if ((byte & 0x80) === 0) return [value, at + i + 1]
    }

    throw new Error('слишком длинное число')
}

const KNOWN = ['cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm',
    'glyf', 'loca', 'prep', 'CFF ', 'VORG', 'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT',
    'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB']

test('шрифты лежат в WOFF2 и распаковываются в свои таблицы', () => {
    for (const [path, expected] of FONTS) {
        const file = readFileSync(new URL(path, import.meta.url))

        assert.equal(file.toString('ascii', 0, 4), 'wOF2', path)
        assert.equal(file.readUInt32BE(8), file.length, `${path}: длина в заголовке`)
        assert.equal(file.length % 4, 0, `${path}: выравнивание`)

        const count = file.readUInt16BE(12)
        let at = 48
        const tables = []

        for (let i = 0; i < count; i++) {
            const flags = file[at++]
            const index = flags & 0x3f
            let tag = KNOWN[index]

            if (index === 63) {
                tag = file.toString('ascii', at, at + 4)
                at += 4
            }

            // Преобразований нет: у glyf и loca это версия 3, у остальных — 0
            const version = flags >> 6
            assert.equal(version, tag === 'glyf' || tag === 'loca' ? 3 : 0, `${path}: ${tag}`)

            const [length, next] = base128(file, at)
            at = next
            tables.push({tag, length})
        }

        const compressed = file.readUInt32BE(20)
        const stream = brotliDecompressSync(file.subarray(at, at + compressed))

        assert.equal(stream.length, tables.reduce((sum, table) => sum + table.length, 0), path)

        const tags = tables.map(table => table.tag)
        for (const tag of expected) assert.ok(tags.includes(tag), `${path}: нет ${tag}`)

        // `loca` сразу за `glyf` — так её ищет распаковщик
        if (tags.includes('loca')) assert.equal(tags.indexOf('loca'), tags.indexOf('glyf') + 1)
    }
})
