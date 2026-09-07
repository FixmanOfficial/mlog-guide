/**
 * Разбирает девятипатчи интерфейса в `core/data/nine-patches.json`.
 *
 * Из спрайта достаются четыре числа и два цвета: сторона, толщина рамки, срез угла, цвет рамки
 * и цвет заливки с прозрачностью. По ним верстается всё, что в игре нарисовано девятипатчем —
 * кнопки, панели, рамка строки инструкции.
 *
 * Раньше эти числа снимались глазами по картинке в консоли. Так и выяснилось, что кнопка
 * не прямоугольная: у неё срезаны углы. Лучше пусть считает машина.
 *
 *   node tools/gen-nine.mjs <путь-к-Mindustry>
 */

import {readFileSync, writeFileSync} from 'node:fs'
import {join, resolve} from 'node:path'

import {decodePng} from './png.mjs'

/** Спрайты, по которым сверстан интерфейс. */
const WANTED = [
    'button', 'pane', 'pane-solid', 'white-pane',

    // Панель строительства: `Tex.pane2` под сеткой блоков, `Tex.buttonEdge2` под
    // заголовком, `buttonSelect` — рамка выбранного блока (`Styles.selecti`),
    // `flat-down-base` — фон нажатой и выбранной кнопки (`Styles.flatDown`)
    'pane-2', 'button-edge-2', 'button-select', 'flat-down-base'
]

const hex = (channel) => channel.toString(16).padStart(2, '0')

function analyse(image) {
    const at = (x, y) => {
        const i = (y * image.width + x) * 4
        return [image.pixels[i], image.pixels[i + 1], image.pixels[i + 2], image.pixels[i + 3]]
    }

    const colour = (pixel) => `#${hex(pixel[0])}${hex(pixel[1])}${hex(pixel[2])}`

    // Крайние строка и столбец — разметка девятипатча, сам рисунок начинается со следующих
    const left = 1
    const right = image.width - 2
    const middle = Math.floor(image.height / 2)

    const frame = at(left, middle)
    const fill = at(Math.floor(image.width / 2), middle)

    // Толщина рамки: сколько подряд пикселей того же цвета от края к середине
    let border = 0
    while (border < image.width && at(left + border, middle).join() === frame.join()) border++

    // Срез угла: в самой верхней строке рисунка левый край отступает вправо ровно на срез
    const opaqueAt = (y) => {
        for (let x = left; x <= right; x++) if (at(x, y)[3] !== 0) return x
        return -1
    }

    let top = 1
    while (top < image.height - 1 && opaqueAt(top) === -1) top++

    const cut = Math.max(0, opaqueAt(top) - left)

    return {
        size: [image.width, image.height],
        border,
        cut,
        frame: colour(frame),
        frameAlpha: Number((frame[3] / 255).toFixed(3)),
        fill: colour(fill),
        fillAlpha: Number((fill[3] / 255).toFixed(3))
    }
}

function main() {
    const gameRoot = resolve(process.argv[2] ?? '../Mindustry')
    const dir = join(gameRoot, 'core/assets-raw/sprites/ui')

    const patches = {}

    for (const name of WANTED) {
        let image
        try {
            image = decodePng(readFileSync(join(dir, `${name}.9.png`)))
        } catch {
            console.error(`Пропущен ${name}: спрайт не найден в ${dir}`)
            continue
        }

        patches[name] = analyse(image)
    }

    writeFileSync('core/data/nine-patches.json', JSON.stringify({
        gameVersion: 'v159.7',
        source: 'core/assets-raw/sprites/ui',
        note: 'Файл сгенерирован, править вручную нельзя. border — толщина рамки в пикселях, '
            + 'cut — насколько срезан угол, fillAlpha — прозрачность заливки.',
        patches
    }, null, 2) + '\n')

    console.log(`core/data/nine-patches.json: ${Object.keys(patches).length} девятипатчей`)
    for (const [name, patch] of Object.entries(patches)) {
        console.log(
            `  ${name.padEnd(11)} рамка ${patch.border} ${patch.frame}, срез ${patch.cut}, `
            + `заливка ${patch.fill} на ${patch.fillAlpha}`
        )
    }
}

main()
