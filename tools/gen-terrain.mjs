/**
 * Собирает спрайты местности в атлас `render/assets/terrain.png` и указатель
 * `core/data/terrain-sprites.json`: полы, руды и статичные стены.
 *
 * Источник — упакованный атлас игры. Кроме плиток оттуда берутся листы краёв `<имя>-edge`:
 * их не рисовал художник, они собираются при упаковке умножением мягкой кляксы `edge-stencil`
 * на текстуру пола (`Floor.createIcons`). Раньше мы повторяли эту сборку сами; теперь берём
 * готовое — меньше мест, где можно разойтись с игрой.
 *
 * Вариант плитки выбирается не случайно, а `Mathf.randomSeed` от координат тайла, поэтому
 * в указателе лежат все варианты по именам `имя1`, `имя2`, ...
 *
 *   node tools/gen-terrain.mjs <путь-к-Mindustry.jar>
 */

import {writeFileSync} from 'node:fs'

import {openAtlas} from './atlas.mjs'
import {pack} from './pack.mjs'
import {BLOCK_SPECS} from '../core/src/world.js'
import {CONTENT_VERSION} from './version.mjs'
import {encodeWebp} from './webp.mjs'

/** Ширина атласа. */
const WIDTH = 1024

/** Vars.tilesize * 4: спрайты вчетверо крупнее мировых единиц. */
const TILE = 32

/** Что рисуется на карте. Деревья и валуны отложены: они украшение, а не поверхность. */
const KINDS = new Set(['floor', 'overlay', 'ore', 'staticWall'])

async function main() {
    const atlas = openAtlas(process.argv[2])

    const found = []
    const missing = []

    for (const [name, spec] of Object.entries(BLOCK_SPECS)) {
        if (!KINDS.has(spec.kind)) continue

        // Либо пронумерованные варианты, либо один спрайт с именем блока. Floor.load
        const names = spec.variants > 0
            ? Array.from({length: spec.variants}, (_, i) => `${name}${i + 1}`)
            : [name]

        const images = names.map(item => atlas.cut(item))

        if (images.some(image => image === null)) {
            missing.push(name)
            continue
        }

        images.forEach((image, index) => found.push({name: names[index], image}))

        // Край рисует группа смешивания, а не сам пол, поэтому чужой лист не нужен
        if (spec.kind === 'floor' && spec.blendGroup === undefined) {
            const edge = atlas.cut(`${name}-edge`)
            if (edge !== null) found.push({name: `${name}-edge`, image: edge})
        }
    }

    if (found.length === 0) throw new Error('в атласе не нашлось местности')

    const {pixels, width, height, sprites} = pack(found, WIDTH)
    writeFileSync('render/assets/terrain.webp', await encodeWebp(width, height, pixels))

    writeFileSync('core/data/terrain-sprites.json', JSON.stringify({
        gameVersion: CONTENT_VERSION,
        source: 'sprites/sprites.aatls из Mindustry.jar',
        note: 'Файл сгенерирован, править вручную нельзя. Плитки лежат по 32 пикселя, листы '
            + 'краёв — по 96: три на три плитки, как их режет Floor.load.',
        atlas: 'render/assets/terrain.webp',
        tile: TILE,
        width,
        height,
        sprites
    }, null, 2) + '\n')

    const edges = Object.keys(sprites).filter(name => name.endsWith('-edge')).length
    console.log(`render/assets/terrain.webp: ${width} на ${height}, `
        + `${Object.keys(sprites).length - edges} плиток и ${edges} листов краёв`)

    if (missing.length > 0) {
        console.log(`без спрайта: ${missing.slice(0, 12).join(', ')}${missing.length > 12 ? '…' : ''}`)
    }
}

await main()
