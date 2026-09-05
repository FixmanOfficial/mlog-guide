/**
 * Собирает спрайты блоков мира в атлас `render/assets/blocks.png` и указатель
 * `core/data/block-sprites.json`.
 *
 * Зачем отдельно от `gen-sprites.mjs`: тот делает иконки для меню выбора и приводит всё к 32
 * пикселям, а на карте блок занимает `size` тайлов и спрайт у него `size * 32` — у логического
 * процессора 64, у большого дисплея 192. Если рисовать картой уменьшенные иконки, блок
 * расплывается: половина точек потеряна ещё в атласе.
 *
 * Список блоков берётся из модели мира: рисуем ровно то, что умеем моделировать.
 *
 *   node tools/gen-blocks.mjs <путь-к-Mindustry>
 */

import {readdirSync, readFileSync, writeFileSync, statSync} from 'node:fs'
import {join, resolve} from 'node:path'

import {decodePng, encodePng} from './png.mjs'
import {BLOCK_SPECS} from '../core/src/world.js'

/** Пиксель на тайл: спрайты игры вчетверо крупнее мировых единиц, а тайл это 8 единиц. */
const PER_TILE = 32

/** Ширина атласа. Самый большой спрайт — большой дисплей, 192. */
const WIDTH = 256

/** Ищет файл спрайта в дереве, не зная заранее подкаталога. */
function findSprite(root, name) {
    const stack = [root]

    while (stack.length > 0) {
        const dir = stack.pop()

        for (const entry of readdirSync(dir)) {
            const path = join(dir, entry)

            if (statSync(path).isDirectory()) stack.push(path)
            else if (entry === `${name}.png`) return path
        }
    }

    return null
}

function main() {
    const gameRoot = resolve(process.argv[2] ?? '../Mindustry')
    const root = join(gameRoot, 'core/assets-raw/sprites/blocks')

    try {
        readdirSync(root)
    } catch {
        console.error(`Не найден ${root}`)
        console.error('Каталог assets-raw в разреженный чекаут не входит, добавьте его:')
        console.error('  git -C Mindustry sparse-checkout add core/assets-raw/sprites/blocks')
        process.exit(1)
    }

    const found = []

    for (const [type, spec] of Object.entries(BLOCK_SPECS)) {
        const path = findSprite(root, type)

        if (path === null) {
            console.error(`Пропущен ${type}: спрайт не найден`)
            continue
        }

        const image = decodePng(readFileSync(path))
        const expected = spec.size * PER_TILE

        if (image.width !== expected || image.height !== expected) {
            console.error(`Пропущен ${type}: ${image.width}x${image.height}, а блок ${spec.size} на ${spec.size}`)
            continue
        }

        found.push({type, image})
    }

    // Полки: сначала самые высокие, каждая полка высотой со свой первый спрайт
    found.sort((a, b) => b.image.height - a.image.height)

    const placed = []
    let x = 0
    let y = 0
    let shelf = 0

    for (const entry of found) {
        if (x + entry.image.width > WIDTH) {
            x = 0
            y += shelf
            shelf = 0
        }

        placed.push({...entry, x, y})
        x += entry.image.width
        shelf = Math.max(shelf, entry.image.height)
    }

    const height = y + shelf
    const pixels = Buffer.alloc(WIDTH * height * 4)

    for (const {image, x: ox, y: oy} of placed) {
        for (let row = 0; row < image.height; row++) {
            const from = row * image.width * 4
            const to = ((oy + row) * WIDTH + ox) * 4
            pixels.set(image.pixels.subarray(from, from + image.width * 4), to)
        }
    }

    writeFileSync('render/assets/blocks.png', encodePng(WIDTH, height, pixels))

    const sprites = {}
    for (const {type, image, x: ox, y: oy} of placed) {
        sprites[type] = {x: ox, y: oy, size: image.width}
    }

    writeFileSync('core/data/block-sprites.json', JSON.stringify({
        gameVersion: 'v159.7',
        source: 'core/assets-raw/sprites/blocks',
        note: 'Файл сгенерирован, править вручную нельзя. Спрайты лежат в своём разрешении: '
            + 'сторона блока в тайлах, умноженная на 32.',
        atlas: 'render/assets/blocks.png',
        width: WIDTH,
        height,
        sprites
    }, null, 2) + '\n')

    console.log(`render/assets/blocks.png: ${placed.length} блоков, ${WIDTH}x${height}`)
}

main()
