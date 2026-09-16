/**
 * Укладка спрайтов в атлас полками.
 *
 * Общая для всех трёх атласов сайта: блоки, юниты, местность. Полками, а не плотной укладкой,
 * потому что спрайты одного вида почти всегда одного размера — потери на пустое место
 * получаются в единицы процентов, а PNG их всё равно сжимает почти в ноль.
 */


/**
 * Прозрачная полоса вокруг каждого спрайта.
 *
 * Нужна тем, кто рисует атлас не попиксельно: иконка в меню масштабируется дробно, и при
 * дробном масштабе выборка задевает соседний столбец пикселей — на краю иконки появлялась
 * полоска чужого спрайта. Указатель при этом показывает на сам спрайт, а не на полосу,
 * поэтому для рендера ничего не меняется.
 */
const GUTTER = 1

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
        const boxWidth = entry.image.width + GUTTER * 2
        const boxHeight = entry.image.height + GUTTER * 2

        if (boxWidth > width) throw new Error(`${entry.name} шире атласа`)

        if (x + boxWidth > width) {
            x = 0
            y += shelf
            shelf = 0
        }

        placed.push({...entry, x: x + GUTTER, y: y + GUTTER})
        x += boxWidth
        shelf = Math.max(shelf, boxHeight)
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

    return {pixels, width, height, sprites}
}
