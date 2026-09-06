/**
 * Собирает спрайты юнитов в атлас `render/assets/units.png` и указатель
 * `core/data/unit-sprites.json`.
 *
 * Источник — упакованный атлас игры из jar, а не исходные картинки. Разница не косметическая:
 * упаковщик запекает юнитам обводку (`Pixmaps.outline`, радиус 3, цвет `Pal.darkerMetal`),
 * и в исходнике её нет. У кинжала рисунка 40 на 24 точки, в атласе — 48 на 32.
 *
 * Берётся корпус и накладка `-cell`, которую игра красит цветом команды (`UnitType.drawCell`).
 * Ног, гусениц и огня двигателей нет: они рисуются отдельными спрайтами по фазе шага.
 *
 *   node tools/gen-units.mjs <путь-к-Mindustry.jar>
 */

import {writeFileSync} from 'node:fs'

import {openAtlas} from './atlas.mjs'
import {pack} from './pack.mjs'
import {UNIT_SPECS} from '../core/src/unit.js'

/** Ширина атласа. Самый широкий спрайт — токсопид, 400 точек. */
const WIDTH = 1024

function main() {
    const atlas = openAtlas(process.argv[2])

    const found = []
    const missing = []

    for (const [name, spec] of Object.entries(UNIT_SPECS)) {
        // Внутренние юниты в мире не появляются: это оболочки блоков вроде ядерного реактора
        if (spec.internal) continue

        const body = atlas.cut(name)

        if (body === null) {
            missing.push(name)
            continue
        }

        found.push({name, image: body})

        const cell = atlas.cut(`${name}-cell`)
        if (cell !== null) found.push({name: `${name}-cell`, image: cell})
    }

    if (found.length === 0) throw new Error('в атласе не нашлось ни одного юнита')

    const {png, width, height, sprites} = pack(found, WIDTH)
    writeFileSync('render/assets/units.png', png)

    writeFileSync('core/data/unit-sprites.json', JSON.stringify({
        gameVersion: 'v159.7',
        source: 'sprites/sprites.aatls из Mindustry.jar',
        note: 'Файл сгенерирован, править вручную нельзя. Спрайты сняты из упакованного атласа '
            + 'игры, то есть уже с запечённой обводкой. Записи вида «имя-cell» — накладка, '
            + 'которую игра красит цветом команды.',
        atlas: 'render/assets/units.png',
        width,
        height,
        sprites
    }, null, 2) + '\n')

    const bodies = Object.keys(sprites).filter(name => !name.endsWith('-cell')).length
    console.log(`render/assets/units.png: ${width} на ${height}, ${bodies} юнитов`)

    // Ракеты лежат в атласе под другими именами, и логике они недоступны
    if (missing.length > 0) console.log(`без спрайта: ${missing.join(', ')}`)
}

main()
