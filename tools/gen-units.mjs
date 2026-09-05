/**
 * Собирает спрайты юнитов в атлас `render/assets/units.png` и указатель
 * `core/data/unit-sprites.json`.
 *
 * Отдельно от блоков потому, что юниты не квадратные: у скипетра 170 на 140, у фортресса
 * 100 на 80. Уложить их в общую сетку нельзя, а привести к квадрату — значит потерять точки.
 *
 * Кроме основного спрайта берётся `<имя>-cell`: это «ячейка», которую игра рисует поверх
 * корпуса цветом команды (`UnitType.drawCell`). Без неё юнит выходит серым и безымянным —
 * принадлежность команде в Mindustry видна именно по ней.
 *
 * Ног, гусениц и огня двигателей здесь нет: они рисуются отдельными спрайтами с анимацией
 * по фазе шага. Записано в `docs/parity.md`.
 *
 *   node tools/gen-units.mjs <путь-к-Mindustry>
 */

import {existsSync, readdirSync, readFileSync, writeFileSync} from 'node:fs'
import {join, resolve} from 'node:path'

import {decodePng, encodePng} from './png.mjs'
import {UNIT_SPECS} from '../core/src/unit.js'

/** Ширина атласа. Самый широкий спрайт — токсопид, 400 точек. */
const WIDTH = 1024

function main() {
    const gameRoot = resolve(process.argv[2] ?? '../Mindustry')
    const root = join(gameRoot, 'core/assets-raw/sprites/units')

    try {
        readdirSync(root)
    } catch {
        console.error(`Не найден ${root}`)
        console.error('Каталог assets-raw в разреженный чекаут не входит, добавьте его:')
        console.error('  git -C Mindustry sparse-checkout add core/assets-raw/sprites/units')
        process.exit(1)
    }

    const found = []
    const missing = []

    for (const [name, spec] of Object.entries(UNIT_SPECS)) {
        // Внутренние юниты в мире не появляются: это оболочки блоков вроде ядерного реактора
        if (spec.internal) continue

        const path = join(root, `${name}.png`)

        if (!existsSync(path)) {
            missing.push(name)
            continue
        }

        found.push({name, image: decodePng(readFileSync(path))})

        const cell = join(root, `${name}-cell.png`)
        if (existsSync(cell)) found.push({name: `${name}-cell`, image: decodePng(readFileSync(cell))})
    }

    if (found.length === 0) throw new Error('не найдено ни одного спрайта юнита')

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

    writeFileSync('render/assets/units.png', encodePng(WIDTH, height, pixels))

    const sprites = {}
    for (const {name, image, x: ox, y: oy} of placed) {
        sprites[name] = {x: ox, y: oy, width: image.width, height: image.height}
    }

    writeFileSync('core/data/unit-sprites.json', JSON.stringify({
        gameVersion: 'v159.7',
        source: 'core/assets-raw/sprites/units',
        note: 'Файл сгенерирован, править вручную нельзя. Спрайты лежат в своём разрешении: '
            + 'вчетверо крупнее мировых единиц, как Draw.scl в игре. Записи вида «имя-cell» — '
            + 'накладка, которую игра красит цветом команды.',
        atlas: 'render/assets/units.png',
        width: WIDTH,
        height,
        sprites
    }, null, 2) + '\n')

    const bodies = Object.keys(sprites).filter(name => !name.endsWith('-cell')).length
    console.log(`render/assets/units.png: ${WIDTH} на ${height}, ${bodies} юнитов`)

    // Пропущены ракеты: у них спрайты лежат не здесь, а логике они и не доступны
    if (missing.length > 0) console.log(`без спрайта: ${missing.join(', ')}`)
}

main()
