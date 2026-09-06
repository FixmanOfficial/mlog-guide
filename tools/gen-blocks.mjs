/**
 * Собирает спрайты блоков мира в атлас `render/assets/blocks.png` и указатель
 * `core/data/block-sprites.json`.
 *
 * Источник — упакованный атлас игры: у части блоков спрайт там не тот, что в исходниках,
 * потому что упаковщик собирает его из слоёв. Брать надо то, что игра рисует, а не то,
 * из чего она это собирает.
 *
 * Берутся блоки логики и то, что сцена умеет ставить рядом с ними. Когда появится
 * строительный интерфейс, ограничение снимется: каталог из 258 строимых блоков уже
 * лежит в `block-specs.json`.
 *
 *   node tools/gen-blocks.mjs <путь-к-Mindustry.jar>
 */

import {writeFileSync} from 'node:fs'

import {openAtlas} from './atlas.mjs'
import {pack} from './pack.mjs'
import {BLOCK_SPECS} from '../core/src/world.js'

/** Ширина атласа. Самый большой спрайт — большой дисплей, 192. */
const WIDTH = 512

/** Пиксель на тайл: спрайты игры вчетверо крупнее мировых единиц, а тайл это 8 единиц. */
const PER_TILE = 32

/** Блоки, которые видит сцена. Всё, что кроме логики, добавлено под конкретную сцену. */
const BLOCKS = [
    'micro-processor', 'logic-processor', 'hyper-processor',
    'memory-cell', 'memory-bank',
    'logic-display', 'large-logic-display',
    'message', 'switch', 'door',
    'container'
]

/**
 * Состояния, которые рисуются поверх или вместо основного спрайта: включённый тумблер
 * (`SwitchBlock.draw`) и открытая дверь (`Door.draw`).
 */
const STATES = ['switch-on', 'door-open']

function main() {
    const atlas = openAtlas(process.argv[2])

    const found = []

    for (const name of [...BLOCKS, ...STATES]) {
        const image = atlas.cut(name)

        if (image === null) {
            console.error(`Пропущен ${name}: в атласе нет такого спрайта`)
            continue
        }

        const spec = BLOCK_SPECS[name]
        const expected = (spec?.size ?? 1) * PER_TILE

        // Спрайт блока — сторона в тайлах, умноженная на 32. Состояния сверяются с основным
        if (spec !== undefined && (image.width !== expected || image.height !== expected)) {
            console.error(`Пропущен ${name}: ${image.width}x${image.height}, а блок ${spec.size} на ${spec.size}`)
            continue
        }

        found.push({name, image})
    }

    if (found.length === 0) throw new Error('не нашлось ни одного спрайта блока')

    const {png, width, height, sprites} = pack(found, WIDTH)
    writeFileSync('render/assets/blocks.png', png)

    writeFileSync('core/data/block-sprites.json', JSON.stringify({
        gameVersion: 'v159.7',
        source: 'sprites/sprites.aatls из Mindustry.jar',
        note: 'Файл сгенерирован, править вручную нельзя. Спрайты лежат в своём разрешении: '
            + 'сторона блока в тайлах, умноженная на 32.',
        atlas: 'render/assets/blocks.png',
        width,
        height,
        sprites
    }, null, 2) + '\n')

    console.log(`render/assets/blocks.png: ${width} на ${height}, ${found.length} спрайтов`)
}

main()
