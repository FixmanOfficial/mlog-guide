/**
 * Упаковка шрифта в WOFF2.
 *
 * WOFF2 — это таблицы TrueType, сжатые одним потоком brotli. Спецификация разрешает ещё
 * и перекладывать `glyf`, `loca` и `hmtx` в более сжимаемый вид, но это необязательно:
 * у каждой таблицы есть «нулевое» преобразование, и тогда она хранится как есть. Так и
 * делаем — выигрыш даёт в основном brotli, а кода нужно в разы меньше.
 *
 * Спецификация: https://www.w3.org/TR/WOFF2/
 *
 * Разбор WOFF первой версии здесь же: шрифты игры бывают в нём, а WOFF2 собирается
 * из обычного набора таблиц.
 */

import {brotliCompressSync, constants, inflateSync} from 'node:zlib'

/**
 * Таблицы, у которых в WOFF2 есть короткий номер вместо имени. Порядок — из спецификации,
 * раздел 5.1; номер таблицы — её место в этом списке.
 */
const KNOWN = [
    'cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca',
    'prep', 'CFF ', 'VORG', 'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea',
    'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC', 'JSTF', 'MATH', 'CBDT', 'CBLC', 'COLR', 'CPAL',
    'SVG ', 'sbix', 'acnt', 'avar', 'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar',
    'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat',
    'Gloc', 'Feat', 'Sill'
]

/**
 * У `glyf` и `loca` «без преобразования» — это версия 3, у остальных — версия 0.
 * Спецификация, раздел 5.1, поле flags.
 */
const NULL_TRANSFORM = {glyf: 3, loca: 3}

/** Таблицы шрифта: из TrueType напрямую, из WOFF первой версии — распаковав. */
export function readTables(buffer) {
    const woff = buffer.toString('ascii', 0, 4) === 'wOFF'
    const count = buffer.readUInt16BE(woff ? 12 : 4)
    const flavor = buffer.readUInt32BE(woff ? 4 : 0)
    const tables = []

    for (let i = 0; i < count; i++) {
        const at = woff ? 44 + i * 20 : 12 + i * 16
        const tag = buffer.toString('ascii', at, at + 4)

        if (woff) {
            const offset = buffer.readUInt32BE(at + 4)
            const stored = buffer.readUInt32BE(at + 8)
            const length = buffer.readUInt32BE(at + 12)
            const data = buffer.subarray(offset, offset + stored)

            tables.push({tag, data: stored < length ? inflateSync(data) : Buffer.from(data)})
        } else {
            const offset = buffer.readUInt32BE(at + 8)
            const length = buffer.readUInt32BE(at + 12)

            tables.push({tag, data: Buffer.from(buffer.subarray(offset, offset + length))})
        }
    }

    return {flavor, tables}
}

/** UIntBase128: по семь бит на байт, старшие вперёд, у всех байтов кроме последнего взведён старший бит. */
function base128(value) {
    const bytes = [value & 0x7f]

    for (value >>>= 7; value > 0; value >>>= 7) bytes.unshift((value & 0x7f) | 0x80)

    return Buffer.from(bytes)
}

const pad4 = (length) => (length + 3) & ~3

/** Шрифт TrueType или WOFF — в WOFF2. */
export function encodeWoff2(buffer) {
    const {flavor, tables} = readTables(buffer)

    // `loca` обязана идти сразу за `glyf`: так её ищет распаковщик
    tables.sort((a, b) => a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0)
    const glyf = tables.findIndex(table => table.tag === 'glyf')
    const loca = tables.findIndex(table => table.tag === 'loca')
    if (glyf >= 0 && loca >= 0) tables.splice(glyf + 1, 0, ...tables.splice(loca, 1))

    const directory = tables.map(({tag, data}) => {
        const index = KNOWN.indexOf(tag)
        const flags = (NULL_TRANSFORM[tag] ?? 0) << 6 | (index < 0 ? 63 : index)
        const parts = [Buffer.from([flags])]

        if (index < 0) parts.push(Buffer.from(tag, 'ascii'))
        parts.push(base128(data.length))

        return Buffer.concat(parts)
    })

    const stream = Buffer.concat(tables.map(table => table.data))
    const compressed = brotliCompressSync(stream, {
        params: {
            [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY,
            [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_FONT,
            [constants.BROTLI_PARAM_SIZE_HINT]: stream.length
        }
    })

    // Размер шрифта после распаковки: заголовок, оглавление и таблицы, выровненные по четыре байта
    const sfntSize = 12 + 16 * tables.length + tables.reduce((sum, table) => sum + pad4(table.data.length), 0)

    const directoryBytes = Buffer.concat(directory)
    const length = pad4(48 + directoryBytes.length + compressed.length)

    const header = Buffer.alloc(48)
    header.write('wOF2', 0, 'ascii')
    header.writeUInt32BE(flavor, 4)
    header.writeUInt32BE(length, 8)
    header.writeUInt16BE(tables.length, 12)
    header.writeUInt32BE(sfntSize, 16)
    header.writeUInt32BE(compressed.length, 20)
    header.writeUInt16BE(1, 24)

    const out = Buffer.alloc(length)
    header.copy(out, 0)
    directoryBytes.copy(out, 48)
    compressed.copy(out, 48 + directoryBytes.length)

    return out
}
