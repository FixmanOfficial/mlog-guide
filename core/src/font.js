/**
 * Шрифт логического дисплея.
 *
 * `draw print` раскладывает текст по метрикам `Fonts.logic` — шрифта `fonts/logic.ttf`,
 * который игра растеризует размером 16 (`ui/Fonts.java:92-98`). Разбор файла показал, что
 * шрифт моноширинный: в `hmtx` всего две записи, и все глифы получают одинаковый шаг.
 *
 *   unitsPerEm 2048, шаг глифа 896 единиц  ->  896 * 16 / 2048 = 7 пикселей
 *   ascender 1216, descender -448, lineGap 0  ->  1664 * 16 / 2048 = 13 пикселей
 *
 * Оба числа целые, поэтому приведение к int в игре ничего не отбрасывает и раскладка
 * воспроизводится точно, без растеризации шрифта на нашей стороне.
 *
 * Рендеру сайта шрифт всё же понадобится — но только чтобы рисовать отдельные символы
 * в готовых координатах, а не считать раскладку.
 */

/** (int)data.spaceXadvance при размере 16. */
export const ADVANCE = 7

/** (int)data.lineHeight при размере 16. */
export const LINE_HEIGHT = 13

/**
 * Набор символов, который игра генерирует для этого шрифта. Скопирован из ui/Fonts.java:97.
 * Пробела здесь нет намеренно — в игре его тоже нет.
 */
export const CHARACTERS =
    '\0ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz1234567890' +
    '"!`?\'.,;:()[]{}<>|/@\\^$€-%+=#_&~*'

const GLYPHS = new Set(CHARACTERS)

/**
 * Есть ли у символа глиф. Всё, чего нет в наборе, просто не рисуется — включая пробел
 * и вообще всю кириллицу. Шаг курсора при этом делается всё равно.
 */
export const hasGlyph = (character) => GLYPHS.has(character)

/** Align из arc: константы разрядов. */
export const Align = {
    center: 1,
    top: 1 << 1,
    bottom: 1 << 2,
    left: 1 << 3,
    right: 1 << 4
}

/** Имена выравниваний, которые игра кладёт в константы. LStatement.nameToAlign */
export const ALIGN_NAMES = {
    center: Align.center,
    top: Align.top,
    bottom: Align.bottom,
    left: Align.left,
    right: Align.right,
    topLeft: Align.top | Align.left,
    topRight: Align.top | Align.right,
    bottomLeft: Align.bottom | Align.left,
    bottomRight: Align.bottom | Align.right
}

/**
 * Раскладка текста для `draw print`. Возвращает по одной команде на символ, у которого
 * есть глиф; координаты уже посчитаны, рендеру остаётся нарисовать символ в точке.
 *
 * Перенос ветки commandPrint из LExecutor.DrawI.
 */
export function layoutPrint(text, originX, originY, align) {
    // Ширина считается в символах: шрифт моноширинный, глиф тут ни при чём
    let maxWidth = 0
    let lineWidth = 0
    let lines = 1

    /*
     * Обход по 16-битным кодам, как `charAt` в Java, а не по кодовым точкам: пара
     * суррогатов, собранная двумя `printchar`, — это два символа, и шага тоже два.
     */
    for (let i = 0; i < text.length; i++) {
        const character = text[i]

        if (character === '\n') {
            maxWidth = Math.max(maxWidth, lineWidth)
            lineWidth = 0
            lines++
        } else {
            lineWidth++
        }
    }

    maxWidth = Math.max(maxWidth, lineWidth)

    const width = maxWidth * ADVANCE
    const height = lines * LINE_HEIGHT

    const isLeft = (align & Align.left) !== 0
    const isRight = (align & Align.right) !== 0
    const isBottom = (align & Align.bottom) !== 0
    const isTop = (align & Align.top) !== 0

    const ha = ((isLeft ? -1 : 0) + 1 + (isRight ? 1 : 0)) / 2
    const va = ((isBottom ? -1 : 0) + 1 + (isTop ? 1 : 0)) / 2

    const xOffset = -Math.trunc(width * ha)
    const yOffset = -Math.trunc(height * va) + (lines - 1) * LINE_HEIGHT

    const commands = []
    let x = originX
    let y = originY

    for (let i = 0; i < text.length; i++) {
        const character = text[i]

        if (character === '\n') {
            y -= LINE_HEIGHT
            x = originX
            continue
        }

        if (hasGlyph(character)) {
            commands.push({type: 'print', x: x + xOffset, y: y + yOffset, char: character})
        }

        // Курсор двигается даже там, где глифа нет
        x += ADVANCE
    }

    return commands
}
