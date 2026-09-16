/**
 * Атлас в WebP без потерь.
 *
 * PNG из `png.mjs` сжимает только zlib, а WebP без потерь для тех же пикселей вдвое меньше:
 * четыре атласа весили 2.1 МБ, стали 1.1. Своего кодировщика WebP у ноды нет, поэтому
 * здесь `sharp` — единственная зависимость генераторов, в сайт он не попадает.
 *
 * Цвет полностью прозрачных пикселей кодировщику разрешено не хранить: браузер при загрузке
 * картинки всё равно умножает цвет на прозрачность, и у таких пикселей его не остаётся.
 */

import sharp from 'sharp'

export function encodeWebp(width, height, pixels) {
    const clean = Buffer.from(pixels)

    // Обнуляем сами, не полагаясь на настройки кодировщика
    for (let at = 0; at < clean.length; at += 4) {
        if (clean[at + 3] === 0) clean[at] = clean[at + 1] = clean[at + 2] = 0
    }

    return sharp(clean, {raw: {width, height, channels: 4}})
        // Без потерь `quality` у libwebp — это усилие сжатия, а не качество картинки
        .webp({lossless: true, quality: 100, effort: 6})
        .toBuffer()
}
