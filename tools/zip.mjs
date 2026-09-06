/**
 * Чтение zip без зависимостей — ровно столько, сколько нужно, чтобы достать из jar игры
 * атлас и его страницы.
 *
 * Jar это обычный zip. Читаем центральный каталог с конца файла, разжимаем нужные записи
 * и на этом всё: ни шифрования, ни zip64, ни потоков — если встретится, честно падаем.
 */

import {readFileSync} from 'node:fs'
import {inflateRawSync} from 'node:zlib'

const END_SIGNATURE = 0x06054b50
const ENTRY_SIGNATURE = 0x02014b50

/** Опись записей архива: имя, способ сжатия и где лежат данные. */
export function readEntries(path) {
    const buffer = readFileSync(path)

    // Хвост каталога ищется с конца: за ним может быть комментарий до 64 КБ
    let end = buffer.length - 22
    while (end >= 0 && buffer.readUInt32LE(end) !== END_SIGNATURE) end--
    if (end < 0) throw new Error(`${path}: не похоже на zip`)

    const count = buffer.readUInt16LE(end + 10)
    let position = buffer.readUInt32LE(end + 16)

    const entries = new Map()

    for (let i = 0; i < count; i++) {
        if (buffer.readUInt32LE(position) !== ENTRY_SIGNATURE) throw new Error('битый каталог zip')

        const method = buffer.readUInt16LE(position + 10)
        const compressed = buffer.readUInt32LE(position + 20)
        const size = buffer.readUInt32LE(position + 24)
        const nameLength = buffer.readUInt16LE(position + 28)
        const extraLength = buffer.readUInt16LE(position + 30)
        const commentLength = buffer.readUInt16LE(position + 32)
        const offset = buffer.readUInt32LE(position + 42)

        const name = buffer.toString('utf8', position + 46, position + 46 + nameLength)
        entries.set(name, {method, compressed, size, offset})

        position += 46 + nameLength + extraLength + commentLength
    }

    return {buffer, entries}
}

/** Содержимое одной записи. */
export function readFile({buffer, entries}, name) {
    const entry = entries.get(name)
    if (entry === undefined) return null

    // У локального заголовка своя длина имени и поля extra — читаем её, а не из каталога
    const nameLength = buffer.readUInt16LE(entry.offset + 26)
    const extraLength = buffer.readUInt16LE(entry.offset + 28)
    const start = entry.offset + 30 + nameLength + extraLength

    const data = buffer.subarray(start, start + entry.compressed)

    if (entry.method === 0) return Buffer.from(data)
    if (entry.method === 8) return inflateRawSync(data)

    throw new Error(`${name}: неизвестный способ сжатия ${entry.method}`)
}
