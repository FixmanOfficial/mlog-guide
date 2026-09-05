/**
 * Чтение и запись PNG без зависимостей.
 *
 * Нужно генераторам: разобрать спрайты игры, уменьшить их и сложить в один атлас.
 * Поддерживается ровно то, что встречается в ассетах Mindustry: восемь бит на канал,
 * без чересстрочности. Всё остальное честно роняет разбор, а не рисует мусор.
 */

import {inflateSync, deflateSync} from 'node:zlib'

const CHANNELS = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}

/** Разбирает PNG в объект с шириной, высотой и полосой RGBA. */
export function decodePng(buffer) {
    if (buffer.readUInt32BE(0) !== 0x89504e47) throw new Error('это не PNG')

    let position = 8
    let width = 0
    let height = 0
    let depth = 0
    let colorType = 0
    let palette = null
    let alphaTable = null
    const data = []

    while (position < buffer.length) {
        const length = buffer.readUInt32BE(position)
        const type = buffer.toString('ascii', position + 4, position + 8)
        const chunk = buffer.subarray(position + 8, position + 8 + length)

        if (type === 'IHDR') {
            width = chunk.readUInt32BE(0)
            height = chunk.readUInt32BE(4)
            depth = chunk.readUInt8(8)
            colorType = chunk.readUInt8(9)
            if (chunk.readUInt8(12) !== 0) throw new Error('чересстрочные PNG не поддерживаются')
            if (depth !== 8) throw new Error(`не восемь бит на канал: ${depth}`)
        } else if (type === 'PLTE') palette = chunk
        else if (type === 'tRNS') alphaTable = chunk
        else if (type === 'IDAT') data.push(chunk)
        else if (type === 'IEND') break

        position += 12 + length
    }

    const channels = CHANNELS[colorType]
    const raw = unfilter(inflateSync(Buffer.concat(data)), width, height, channels)

    return {width, height, pixels: toRgba(raw, width, height, colorType, channels, palette, alphaTable)}
}

/** Снимает построчные фильтры PNG. */
function unfilter(raw, width, height, channels) {
    const stride = width * channels
    const out = Buffer.alloc(height * stride)
    let offset = 0

    for (let y = 0; y < height; y++) {
        const filter = raw[offset++]

        for (let x = 0; x < stride; x++) {
            const value = raw[offset + x]
            const left = x >= channels ? out[y * stride + x - channels] : 0
            const up = y > 0 ? out[(y - 1) * stride + x] : 0
            const corner = x >= channels && y > 0 ? out[(y - 1) * stride + x - channels] : 0

            let result
            if (filter === 0) result = value
            else if (filter === 1) result = value + left
            else if (filter === 2) result = value + up
            else if (filter === 3) result = value + ((left + up) >> 1)
            else {
                // Предсказатель Paeth: берётся ближайшее из трёх соседних значений
                const guess = left + up - corner
                const dl = Math.abs(guess - left)
                const du = Math.abs(guess - up)
                const dc = Math.abs(guess - corner)
                result = value + (dl <= du && dl <= dc ? left : du <= dc ? up : corner)
            }

            out[y * stride + x] = result & 0xff
        }

        offset += stride
    }

    return out
}

/** Приводит любой поддержанный вид к RGBA. */
function toRgba(raw, width, height, colorType, channels, palette, alphaTable) {
    const out = Buffer.alloc(width * height * 4)

    for (let i = 0; i < width * height; i++) {
        const from = i * channels
        const to = i * 4

        if (colorType === 6) {
            raw.copy(out, to, from, from + 4)
        } else if (colorType === 2) {
            raw.copy(out, to, from, from + 3)
            out[to + 3] = 255
        } else if (colorType === 3) {
            const index = raw[from]
            out[to] = palette[index * 3]
            out[to + 1] = palette[index * 3 + 1]
            out[to + 2] = palette[index * 3 + 2]
            out[to + 3] = alphaTable === null ? 255 : alphaTable[index] ?? 255
        } else if (colorType === 0) {
            out[to] = out[to + 1] = out[to + 2] = raw[from]
            out[to + 3] = 255
        } else if (colorType === 4) {
            out[to] = out[to + 1] = out[to + 2] = raw[from]
            out[to + 3] = raw[from + 1]
        }
    }

    return out
}

/**
 * Уменьшает изображение усреднением по прямоугольнику.
 * Цвет усредняется с весом альфы, иначе прозрачные пиксели затемняют края.
 */
export function resize(image, size) {
    const out = Buffer.alloc(size * size * 4)
    const scaleX = image.width / size
    const scaleY = image.height / size

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const fromX = Math.floor(x * scaleX)
            const toX = Math.max(fromX + 1, Math.floor((x + 1) * scaleX))
            const fromY = Math.floor(y * scaleY)
            const toY = Math.max(fromY + 1, Math.floor((y + 1) * scaleY))

            let r = 0, g = 0, b = 0, a = 0, weight = 0

            for (let sy = fromY; sy < toY && sy < image.height; sy++) {
                for (let sx = fromX; sx < toX && sx < image.width; sx++) {
                    const at = (sy * image.width + sx) * 4
                    const alpha = image.pixels[at + 3]

                    r += image.pixels[at] * alpha
                    g += image.pixels[at + 1] * alpha
                    b += image.pixels[at + 2] * alpha
                    a += alpha
                    weight++
                }
            }

            const at = (y * size + x) * 4
            out[at] = a === 0 ? 0 : Math.round(r / a)
            out[at + 1] = a === 0 ? 0 : Math.round(g / a)
            out[at + 2] = a === 0 ? 0 : Math.round(b / a)
            out[at + 3] = weight === 0 ? 0 : Math.round(a / weight)
        }
    }

    return {width: size, height: size, pixels: out}
}

/** Собирает PNG из полосы RGBA. */
export function encodePng(width, height, pixels) {
    const stride = width * 4
    const raw = Buffer.alloc(height * (stride + 1))

    for (let y = 0; y < height; y++) {
        // Фильтр 0: пишем как есть, сжатие возьмёт своё
        raw[y * (stride + 1)] = 0
        pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
    }

    const header = Buffer.alloc(13)
    header.writeUInt32BE(width, 0)
    header.writeUInt32BE(height, 4)
    header.writeUInt8(8, 8)
    header.writeUInt8(6, 9)

    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', header),
        chunk('IDAT', deflateSync(raw, {level: 9})),
        chunk('IEND', Buffer.alloc(0))
    ])
}

function chunk(type, data) {
    const out = Buffer.alloc(12 + data.length)
    out.writeUInt32BE(data.length, 0)
    out.write(type, 4, 4, 'ascii')
    data.copy(out, 8)
    out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length)
    return out
}

const CRC_TABLE = Array.from({length: 256}, (_, index) => {
    let value = index
    for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    return value >>> 0
})

function crc32(buffer) {
    let crc = 0xffffffff
    for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
    return (crc ^ 0xffffffff) >>> 0
}
