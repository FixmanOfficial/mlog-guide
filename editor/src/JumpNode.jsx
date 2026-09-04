/**
 * Узел перехода — треугольник из спрайта `logic-node.png`.
 *
 * Одна и та же картинка стоит в двух местах: кнопкой на строке с переходом (`JumpButton`
 * наследует `ImageButton` и берёт `Tex.logicNode`) и наконечником у цели, где она рисуется
 * зеркально — `draw(x + s*0.75, y - s/2, -s, s)` с отрицательной шириной.
 *
 * Разбор спрайта: 32×32, рисунок занимает столбцы 13–29 и строки 4–27, то есть треугольник
 * с плоским основанием слева и остриём справа. При размере 30 это 15 на 21.5 пикселя.
 */

/** Пропорции из спрайта, приведённые к размеру 30. */
export const NODE = {width: 15, height: 21.5}

export function JumpNode({size = NODE.width, flipped = false, color = '#ffffff', outline = '#3f3f3f'}) {
    const height = size * (NODE.height / NODE.width)

    // Остриё смотрит вправо, а у наконечника цели — влево, поэтому зеркалим
    const points = flipped
        ? `${size},${height / 2} 0,0 0,${height}`
        : `0,0 ${size},${height / 2} 0,${height}`

    return (
        <svg class="node" width={size} height={height} viewBox={`0 0 ${size} ${height}`}>
            <polygon points={points} fill={color} stroke={outline} stroke-width="2" stroke-linejoin="miter" />
        </svg>
    )
}
