/**
 * Укладка спрайтов в атлас полками.
 *
 * Общая для всех трёх атласов сайта: блоки, юниты, местность. Полками, а не плотной укладкой,
 * потому что спрайты одного вида почти всегда одного размера — потери на пустое место
 * получаются в единицы процентов, а PNG их всё равно сжимает почти в ноль.
 */

import {encodePng} from './png.mjs'

/**
 * @param entries спрайты в виде `{name, image}`
 * @param width   ширина атласа
 * @returns буфер PNG и указатель `{имя: {x, y, width, height}}`
 */
export function pack(entries, width) {
    // Сначала самые высокие: полка получает высоту своего первого спрайта
    const sorted = [...entries].sort((a, b) => b.image.height - a.image.height)

    const placed = []
    let x = 0
    let y = 0
    let shelf = 0

    for (const entry of sorted) {
        if (entry.image.width > width) throw new Error(`${entry.name} шире атласа`)

        if (x + entry.image.width > width) {
            x = 0
            y += shelf
            shelf = 0
        }

        placed.push({...entry, x, y})
        x += entry.image.width
        shelf = Math.max(shelf, entry.image.height)
    }

    const height = y + shelf
    const pixels = Buffer.alloc(width * height * 4)

    for (const {image, x: left, y: top} of placed) {
        for (let row = 0; row < image.height; row++) {
            const from = row * image.width * 4
            const to = ((top + row) * width + left) * 4
            pixels.set(image.pixels.subarray(from, from + image.width * 4), to)
        }
    }

    const sprites = {}
    for (const {name, image, x: left, y: top} of placed) {
        sprites[name] = {x: left, y: top, width: image.width, height: image.height}
    }

    return {png: encodePng(width, height, pixels), width, height, sprites}
}
