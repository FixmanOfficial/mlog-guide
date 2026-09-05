#!/usr/bin/env node
/**
 * Генератор атласа иконок контента.
 *
 * Меню выбора у `sensor` и `lookup` в игре показывает предметы, жидкости, блоки и юнитов
 * картинками по 40 пикселей, по шесть в ряд (`LStatements.SensorStatement.build`). Значит нужны
 * сами картинки — а их в игре сотни отдельных файлов, и по одному их на страницу не отдашь.
 *
 * Здесь они уменьшаются до 32 пикселей и складываются в один атлас: одна картинка и один JSON
 * с номерами клеток. У жидкостей своего спрайта нет — игра рисует их цветом, и мы так же.
 *
 * Использование:
 *   node tools/gen-sprites.mjs <путь-к-Mindustry>
 */

import {readFileSync, writeFileSync, readdirSync, statSync, mkdirSync} from 'node:fs'
import {join, resolve} from 'node:path'

import {decodePng, resize, encodePng} from './png.mjs'

const GAME_VERSION = 'v159.7'
const CELL = 32
const COLUMNS = 20

/** Собирает список всех png в дереве: имя без расширения к полному пути. */
function collect(root) {
    const found = new Map()

    const walk = (directory) => {
        for (const entry of readdirSync(directory)) {
            const path = join(directory, entry)

            if (statSync(path).isDirectory()) walk(path)
            else if (entry.endsWith('.png') && !found.has(entry.slice(0, -4))) {
                found.set(entry.slice(0, -4), path)
            }
        }
    }

    try {
        walk(root)
    } catch {
        return found
    }

    return found
}

/** Цвета жидкостей из объявления: new Liquid("имя", Color.valueOf("hex")). */
function liquidColors(gameRoot) {
    const path = join(gameRoot, 'core/src/mindustry/content/Liquids.java')
    const colors = new Map()

    try {
        const text = readFileSync(path, 'utf8')
        // Часть жидкостей объявлена подклассами: neoplasm это CellLiquid
        for (const match of text.matchAll(/new \w*Liquid\("([^"]+)",\s*Color\.valueOf\("([0-9a-fA-F]{6,8})"\)/g)) {
            colors.set(match[1], match[2])
        }
    } catch { /* без файла просто не будет цветов */ }

    return colors
}

/** Плоская клетка цвета жидкости: в игре её иконка тоже генерируется, а не рисуется художником. */
function swatch(hex) {
    const pixels = Buffer.alloc(CELL * CELL * 4)
    const r = parseInt(hex.slice(0, 2), 16)
    const g = parseInt(hex.slice(2, 4), 16)
    const b = parseInt(hex.slice(4, 6), 16)

    const middle = (CELL - 1) / 2
    const radius = CELL / 2 - 1

    for (let y = 0; y < CELL; y++) {
        for (let x = 0; x < CELL; x++) {
            const at = (y * CELL + x) * 4
            const inside = Math.hypot(x - middle, y - middle) <= radius

            pixels[at] = r
            pixels[at + 1] = g
            pixels[at + 2] = b
            pixels[at + 3] = inside ? 255 : 0
        }
    }

    return {width: CELL, height: CELL, pixels}
}

/**
 * Ищет картинку для контента. У предметов имя с приставкой item-, у блоков и юнитов — как есть,
 * но у многих блоков спрайт разбит на варианты: у конвейеров это <имя>-0-0, у стен <имя>1.
 * Игра склеивает их при упаковке атласа; нам для иконки хватит первого.
 */
function findSprite(sources, type, name) {
    if (type === 'item') return sources.get(`item-${name}`)

    return sources.get(name)
        ?? sources.get(`${name}1`)
        ?? sources.get(`${name}-0`)
        ?? sources.get(`${name}-0-0`)
        ?? sources.get(`${name}-full`)
        ?? sources.get(`${name}-icon`)
}

function main() {
    const gameRoot = resolve(process.argv[2] ?? '../Mindustry')

    let ids
    try {
        ids = JSON.parse(readFileSync('core/data/logic-ids.json', 'utf8'))
    } catch {
        console.error('Не найден core/data/logic-ids.json — сначала запустите tools/gen-content.mjs')
        process.exit(1)
    }

    const sprites = join(gameRoot, 'core/assets-raw/sprites')
    const sources = {
        item: collect(join(sprites, 'items')),
        block: collect(join(sprites, 'blocks')),
        unit: collect(join(sprites, 'units'))
    }

    const colors = liquidColors(gameRoot)

    // Собираем клетки: сначала кто нашёлся, потом считаем размер атласа
    const cells = []
    const index = {}
    const missing = []

    for (const type of ['item', 'liquid', 'block', 'unit']) {
        index[type] = {}

        for (const name of ids.types[type] ?? []) {
            let image = null

            if (type === 'liquid') {
                const hex = colors.get(name)
                if (hex !== undefined) image = swatch(hex)
            } else {
                // У предметов имя файла с приставкой, у блоков и юнитов — как есть
                const path = findSprite(sources[type], type, name)
                if (path !== undefined) {
                    try {
                        image = resize(decodePng(readFileSync(path)), CELL)
                    } catch { /* битый или незнакомый png пропускаем */ }
                }
            }

            if (image === null) {
                missing.push(`${type}/${name}`)
                continue
            }

            index[type][name] = cells.length
            cells.push(image)
        }
    }

    const rows = Math.ceil(cells.length / COLUMNS)
    const width = COLUMNS * CELL
    const height = rows * CELL
    const atlas = Buffer.alloc(width * height * 4)

    cells.forEach((image, position) => {
        const originX = (position % COLUMNS) * CELL
        const originY = Math.floor(position / COLUMNS) * CELL

        for (let y = 0; y < CELL; y++) {
            const from = y * CELL * 4
            const to = ((originY + y) * width + originX) * 4
            image.pixels.copy(atlas, to, from, from + CELL * 4)
        }
    })

    mkdirSync('editor/assets', {recursive: true})
    const png = encodePng(width, height, atlas)
    writeFileSync('editor/assets/content.png', png)

    writeFileSync('core/data/sprites.json', JSON.stringify({
        gameVersion: GAME_VERSION,
        source: 'core/assets-raw/sprites',
        note: 'Файл сгенерирован. Номер клетки в атласе editor/assets/content.png; ' +
            `клетка ${CELL} на ${CELL}, в ряду ${COLUMNS}. Иконки жидкостей нарисованы по цвету, ` +
            'как это делает и сама игра.',
        cell: CELL,
        columns: COLUMNS,
        count: cells.length,
        index
    }, null, 2) + '\n')

    console.log(`editor/assets/content.png — ${width}x${height}, ${(png.length / 1024).toFixed(0)} КБ`)
    console.log(`core/data/sprites.json — ${cells.length} иконок`)

    for (const type of Object.keys(index)) {
        const total = (ids.types[type] ?? []).length
        console.log(`  ${type.padEnd(6)} ${Object.keys(index[type]).length}/${total}`)
    }

    if (missing.length > 0) {
        console.log(`  без картинки: ${missing.length}`)
        console.log(`  ${missing.slice(0, 10).join(', ')}${missing.length > 10 ? ' …' : ''}`)
    }
}

main()
