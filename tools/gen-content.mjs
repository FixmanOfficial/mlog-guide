#!/usr/bin/env node
/**
 * Генератор таблиц контента для lookup и констант @item-*, @block-* и прочих.
 *
 * Логические идентификаторы НЕ выводятся из порядка регистрации контента: игра читает готовое
 * соответствие из ассета logicids.dat, который собирается ImagePacker при сборке игры. Файл
 * фиксирует идентификаторы между версиями, чтобы старые схемы не ломались.
 * См. logic/GlobalVars.java:158-184.
 *
 * Формат logicids.dat — java.io.DataInputStream, для каждого типа из writableLookableContent
 * (block, unit, item, liquid, именно в этом порядке, GlobalVars.java:26):
 *   short amount            — количество записей
 *   amount x readUTF()      — имена по возрастанию логического идентификатора
 *
 * Использование:
 *   node tools/gen-content.mjs [путь-к-исходникам-Mindustry]
 */

import {readFileSync, writeFileSync} from 'node:fs'
import {join, resolve} from 'node:path'
import {GAME_VERSION} from './version.mjs'

// Порядок обязателен: файл читается последовательно, GlobalVars.java:26
const CONTENT_TYPES = ['block', 'unit', 'item', 'liquid']

/** Читает поток в формате java.io.DataInputStream. */
class JavaDataInput {
    constructor(buffer) {
        this.buf = buffer
        this.pos = 0
    }

    get exhausted() {
        return this.pos >= this.buf.length
    }

    readShort() {
        this.require(2)
        const value = this.buf.readInt16BE(this.pos)
        this.pos += 2
        return value
    }

    readUnsignedShort() {
        this.require(2)
        const value = this.buf.readUInt16BE(this.pos)
        this.pos += 2
        return value
    }

    /** DataInput.readUTF: длина в байтах, затем modified UTF-8. */
    readUTF() {
        const length = this.readUnsignedShort()
        this.require(length)
        const bytes = this.buf.subarray(this.pos, this.pos + length)
        this.pos += length
        return decodeModifiedUtf8(bytes)
    }

    require(count) {
        if (this.pos + count > this.buf.length) {
            throw new Error(`неожиданный конец файла на смещении ${this.pos}: нужно ещё ${count} байт`)
        }
    }
}

/**
 * Modified UTF-8 отличается от обычного: null кодируется двумя байтами, а символы вне BMP —
 * суррогатной парой из двух трёхбайтовых последовательностей. Имена контента укладываются в ASCII,
 * но разбор делаем полный, чтобы генератор не развалился на неожиданном символе.
 */
function decodeModifiedUtf8(bytes) {
    let out = ''
    let i = 0

    while (i < bytes.length) {
        const a = bytes[i]

        if (a < 0x80) {
            out += String.fromCharCode(a)
            i += 1
        } else if ((a & 0xe0) === 0xc0) {
            const b = bytes[i + 1]
            out += String.fromCharCode(((a & 0x1f) << 6) | (b & 0x3f))
            i += 2
        } else if ((a & 0xf0) === 0xe0) {
            const b = bytes[i + 1]
            const c = bytes[i + 2]
            out += String.fromCharCode(((a & 0x0f) << 12) | ((b & 0x3f) << 6) | (c & 0x3f))
            i += 3
        } else {
            throw new Error(`недопустимый байт 0x${a.toString(16)} в modified UTF-8 на позиции ${i}`)
        }
    }

    return out
}

function parseLogicIds(buffer) {
    const input = new JavaDataInput(buffer)
    const types = {}

    for (const type of CONTENT_TYPES) {
        const amount = input.readShort()
        if (amount < 0) throw new Error(`отрицательное количество записей для типа ${type}: ${amount}`)

        const names = []
        for (let i = 0; i < amount; i++) names.push(input.readUTF())
        types[type] = names
    }

    // Файл должен быть прочитан целиком: остаток означает, что состав writableLookableContent
    // изменился и разбор идёт не по тому формату.
    if (!input.exhausted) {
        throw new Error(
            `после разбора осталось ${buffer.length - input.pos} байт — вероятно, ` +
            `в новой версии игры изменился состав writableLookableContent`
        )
    }

    return types
}

function main() {
    const gameRoot = resolve(process.argv[2] ?? '../Mindustry')
    const source = join(gameRoot, 'core/assets/logicids.dat')

    let buffer
    try {
        buffer = readFileSync(source)
    } catch (e) {
        console.error(`Не найден ${source}`)
        console.error('Укажите путь к исходникам Mindustry: node tools/gen-content.mjs <путь>')
        console.error('Как развернуть исходники — см. CLAUDE.md')
        process.exit(1)
    }

    const types = parseLogicIds(buffer)

    const output = {
        gameVersion: GAME_VERSION,
        source: 'core/assets/logicids.dat',
        note: 'Индекс в массиве и есть логический идентификатор. Файл сгенерирован, править вручную нельзя.',
        counts: Object.fromEntries(CONTENT_TYPES.map(t => [t, types[t].length])),
        types
    }

    const target = 'core/data/logic-ids.json'
    writeFileSync(target, JSON.stringify(output, null, 2) + '\n')

    console.log(`${target} — из ${source}`)
    for (const type of CONTENT_TYPES) {
        console.log(`  ${type.padEnd(6)} ${String(types[type].length).padStart(4)}  ` +
            `(0: ${types[type][0]}, ${types[type].length - 1}: ${types[type].at(-1)})`)
    }
}

main()
