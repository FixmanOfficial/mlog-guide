/**
 * Собирает спрайты местности в атлас `render/assets/terrain.png` и указатель
 * `core/data/terrain-sprites.json`: полы, руды и статичные стены.
 *
 * Кроме самих плиток здесь делается то, что в игре делает упаковщик атласа. Края переходов
 * между полами не нарисованы художником — `Floor.createIcons` собирает их на лету: берёт
 * `edge-stencil` (мягкая клякса 96 на 96) и умножает его на первый вариант пола, размноженный
 * плиткой. Получается лист 3 на 3, из которого `Floor.drawEdges` берёт нужную ячейку. Без этого
 * листа границы полов выходят прямыми, как в клетчатой тетради, а в игре они мягкие.
 *
 * Варианты плиток в игре выбираются не случайно, а по позиции тайла: `Mathf.randomSeed`
 * от упакованных координат. Поэтому один и тот же тайл всегда выглядит одинаково, и то же
 * самое делает наш рендер.
 *
 *   node tools/gen-terrain.mjs <путь-к-Mindustry>
 */

import {existsSync, readdirSync, readFileSync, writeFileSync} from 'node:fs'
import {join, resolve} from 'node:path'

import {decodePng, encodePng} from './png.mjs'
import {BLOCK_SPECS} from '../core/src/world.js'

/** Ширина атласа. */
const WIDTH = 1024

/** Vars.tilesize * 4: спрайты вчетверо крупнее мировых единиц. */
const TILE = 32

/** Что рисуется на карте. Деревья и валуны отложены: они украшение, а не поверхность. */
const KINDS = new Set(['floor', 'overlay', 'ore', 'staticWall'])

/** Имена файлов вариантов: либо `имя1`…`имяN`, либо просто `имя`. */
function variantNames(name, variants) {
    if (variants > 0) return Array.from({length: variants}, (_, i) => `${name}${i + 1}`)
    return [name]
}

/**
 * Лист краёв: стенсиль, умноженный на пол. Повторяет `Floor.createIcons` вплоть до того,
 * что пол размножается остатком от деления — стенсиль втрое больше плитки.
 */
function edgeSheet(stencil, floor) {
    const pixels = Buffer.alloc(stencil.width * stencil.height * 4)

    for (let y = 0; y < stencil.height; y++) {
        for (let x = 0; x < stencil.width; x++) {
            const to = (y * stencil.width + x) * 4
            const from = ((y % floor.height) * floor.width + (x % floor.width)) * 4

            // Color.muli: покомпонентное умножение, включая прозрачность
            for (let channel = 0; channel < 4; channel++) {
                pixels[to + channel] = Math.floor(
                    stencil.pixels[to + channel] * floor.pixels[from + channel] / 255)
            }
        }
    }

    return {width: stencil.width, height: stencil.height, pixels}
}

function main() {
    const gameRoot = resolve(process.argv[2] ?? '../Mindustry')
    const root = join(gameRoot, 'core/assets-raw/sprites/blocks/environment')

    try {
        readdirSync(root)
    } catch {
        console.error(`Не найден ${root}`)
        console.error('Каталог assets-raw в разреженный чекаут не входит, добавьте его:')
        console.error('  git -C Mindustry sparse-checkout add core/assets-raw/sprites/blocks/environment')
        process.exit(1)
    }

    const read = (name) => {
        const path = join(root, `${name}.png`)
        return existsSync(path) ? decodePng(readFileSync(path)) : null
    }

    const stencil = read('edge-stencil')
    if (stencil === null) throw new Error('нет edge-stencil.png: без него края переходов не собрать')

    const found = []
    const missing = []

    for (const [name, spec] of Object.entries(BLOCK_SPECS)) {
        if (!KINDS.has(spec.kind)) continue

        const names = variantNames(name, spec.variants ?? 0)
        const images = names.map(read)

        if (images.some(image => image === null)) {
            missing.push(name)
            continue
        }

        images.forEach((image, index) => found.push({name: names[index], image}))

        // Край собирает только пол, и только тот, что сам себе группа смешивания:
        // остальные рисуют край группы. Floor.createIcons
        if (spec.kind === 'floor' && spec.blendGroup === undefined) {
            found.push({name: `${name}-edge`, image: edgeSheet(stencil, images[0])})
        }
    }

    if (found.length === 0) throw new Error('не найдено ни одного спрайта местности')

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

    writeFileSync('render/assets/terrain.png', encodePng(WIDTH, height, pixels))

    const sprites = {}
    for (const {name, image, x: ox, y: oy} of placed) {
        sprites[name] = {x: ox, y: oy, width: image.width, height: image.height}
    }

    writeFileSync('core/data/terrain-sprites.json', JSON.stringify({
        gameVersion: 'v159.7',
        source: 'core/assets-raw/sprites/blocks/environment',
        note: 'Файл сгенерирован, править вручную нельзя. Плитки лежат по 32 пикселя, листы '
            + 'краёв — по 96: три на три плитки, как их режет Floor.load.',
        atlas: 'render/assets/terrain.png',
        tile: TILE,
        width: WIDTH,
        height,
        sprites
    }, null, 2) + '\n')

    const edges = Object.keys(sprites).filter(name => name.endsWith('-edge')).length
    console.log(`render/assets/terrain.png: ${WIDTH} на ${height}, ${placed.length - edges} плиток и ${edges} листов краёв`)

    if (missing.length > 0) console.log(`без спрайта: ${missing.slice(0, 12).join(', ')}${missing.length > 12 ? '…' : ''}`)
}

main()
