/**
 * Атлас иконок контента: то, чем игра рисует предметы, жидкости, блоки и юнитов в меню
 * и в `draw image`.
 *
 * Источник — упакованный атлас игры, а не исходные картинки, и разница здесь особенно
 * заметна. Иконка в игре это `UnlockableContent.fullIcon`, а он ищется по цепочке имён,
 * первое из которых `<тип>-<имя>-full` — картинка, собранная упаковщиком из слоёв.
 * У дуо это ствол поверх корпуса, у жидкостей вообще нет исходного файла: `liquid-water`
 * рисует сам упаковщик. Мы раньше подставляли вместо них цветные кружки.
 *
 * Сторона иконки ограничена 48 точками. Полное разрешение (у иных блоков это 400) утроило бы
 * атлас ради случая, которого не бывает: на большом дисплее вся сторона — 176 точек, а меню
 * показывает иконки по 40. Пропорции при этом сохраняются: игра рисует иконку как `p2`
 * в ширину и `p2 / ratio` в высоту, и неквадратных среди них три десятка.
 *
 *   node tools/gen-sprites.mjs <путь-к-Mindustry.jar>
 */

import {mkdirSync, readFileSync, writeFileSync} from 'node:fs'

import {openAtlas} from './atlas.mjs'
import {pack} from './pack.mjs'
import {resize} from './png.mjs'

const GAME_VERSION = 'v159.7'

/** Ширина атласа. */
const WIDTH = 1024

/** Предел стороны иконки. */
const LIMIT = 48

/**
 * `UnlockableContent.loadIcon`: имя иконки ищется по цепочке, и первое найденное побеждает.
 * `fullOverride` пропускаем — он задаётся кодом отдельных блоков, а не именем.
 */
const chain = (type, name) => [
    `${type}-${name}-full`,
    `${name}-full`,
    name,
    `${type}-${name}`,
    `${name}1`
]

/** Уменьшает картинку до предела, сохраняя пропорции. */
function fit(image, limit) {
    const side = Math.max(image.width, image.height)
    if (side <= limit) return image

    const scale = limit / side
    return resize(image, Math.round(image.width * scale), Math.round(image.height * scale))
}

function main() {
    const atlas = openAtlas(process.argv[2])

    let ids
    try {
        ids = JSON.parse(readFileSync('core/data/logic-ids.json', 'utf8'))
    } catch {
        console.error('Не найден core/data/logic-ids.json — сначала запустите tools/gen-content.mjs')
        process.exit(1)
    }

    const entries = []
    const found = {}
    const missing = []

    for (const type of ['item', 'liquid', 'block', 'unit']) {
        found[type] = []

        for (const name of ids.types[type] ?? []) {
            const region = chain(type, name).find(item => atlas.has(item))

            if (region === undefined) {
                missing.push(`${type}:${name}`)
                continue
            }

            // Имя ключа своё: у предмета и блока имена совпадают чаще, чем кажется
            const key = `${type}:${name}`
            entries.push({name: key, image: fit(atlas.cut(region), LIMIT)})
            found[type].push(name)
        }
    }

    if (entries.length === 0) throw new Error('в атласе не нашлось иконок контента')

    const {png, width, height, sprites} = pack(entries, WIDTH)

    mkdirSync('editor/assets', {recursive: true})
    writeFileSync('editor/assets/content.png', png)

    // Указатель раскладывается по типам: так его спрашивают и меню, и дисплей
    const index = {}
    for (const type of Object.keys(found)) {
        index[type] = {}
        for (const name of found[type]) index[type][name] = sprites[`${type}:${name}`]
    }

    writeFileSync('core/data/sprites.json', JSON.stringify({
        gameVersion: GAME_VERSION,
        source: 'sprites/sprites.aatls из Mindustry.jar, UnlockableContent.loadIcon',
        note: 'Файл сгенерирован, править вручную нельзя. Иконки сняты готовыми из атласа игры '
            + `и уменьшены до ${LIMIT} точек по большей стороне с сохранением пропорций.`,
        atlas: 'editor/assets/content.png',
        limit: LIMIT,
        width,
        height,
        count: entries.length,
        index
    }, null, 2) + '\n')

    console.log(`editor/assets/content.png: ${width} на ${height}, ${entries.length} иконок`)
    if (missing.length > 0) console.log(`без иконки: ${missing.join(', ')}`)
}

main()
