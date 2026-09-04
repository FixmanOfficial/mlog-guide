/**
 * Узел перехода — форма из спрайта `logic-node.png`.
 *
 * Одна и та же картинка стоит в двух местах: кнопкой на строке с переходом (`JumpButton`
 * наследует `ImageButton` и берёт `Tex.logicNode`) и наконечником у цели, где она рисуется
 * зеркально — `draw(x + s*0.75, y - s/2, -s, s)` с отрицательной шириной.
 *
 * Разбор спрайта по пикселям: это НЕ треугольник. Слева прямоугольное основание шириной 6
 * и высотой 24 (столбцы 13–18, строки 4–27), и уже к нему приставлен треугольник шириной 10
 * с остриём посередине высоты. Вместе — 16 на 24 в спрайте 32×32.
 *
 * При размере отрисовки 30 это даёт 15 на 22.5, из которых 5.625 приходится на основание.
 */

const SPRITE = {size: 32, left: 13, right: 29, top: 4, bottom: 28, base: 19}

/** Пропорции спрайта, приведённые к размеру отрисовки 30. */
const scale = 30 / SPRITE.size

export const NODE = {
    width: (SPRITE.right - SPRITE.left) * scale,
    height: (SPRITE.bottom - SPRITE.top) * scale,
    base: (SPRITE.base - SPRITE.left) * scale
}

/**
 * Точки формы. Начало координат — левый верхний угол; при `flipped` остриё смотрит влево,
 * как у наконечника возле цели.
 */
export function nodePoints(width = NODE.width, height = NODE.height, base = NODE.base, flipped = false) {
    const middle = height / 2

    if (flipped) {
        return [
            [width, 0], [width - base, 0], [0, middle], [width - base, height], [width, height]
        ]
    }

    return [
        [0, 0], [base, 0], [width, middle], [base, height], [0, height]
    ]
}

export function JumpNode({flipped = false, color = '#ffffff', outline = '#3f3f3f'}) {
    const points = nodePoints(NODE.width, NODE.height, NODE.base, flipped)

    return (
        <svg
            class="node"
            width={NODE.width}
            height={NODE.height}
            viewBox={`0 0 ${NODE.width} ${NODE.height}`}
        >
            <polygon
                points={points.map(([x, y]) => `${x},${y}`).join(' ')}
                fill={color}
                stroke={outline}
                stroke-width="2"
                stroke-linejoin="miter"
            />
        </svg>
    )
}
