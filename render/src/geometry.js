/**
 * Геометрия команд дисплея.
 *
 * Здесь только чистые функции: во что превращается команда `draw`, прежде чем попасть на холст.
 * Всё снято с arc — `Lines` и `Fill`, — потому что дисплей рисует именно ими, а не абстрактными
 * «линиями». Разница видна: рамка `lineRect` уходит внутрь прямоугольника, у линии квадратные
 * торцы с вылетом, а обводка многоугольника расширяется на стыках.
 *
 * Функции не знают ни про canvas, ни про браузер, поэтому проверяются в ноде.
 */

/** Матрица 2×3 в порядке canvas: [a, b, c, d, e, f]. */
export const identity = () => [1, 0, 0, 1, 0, 0]

/** Произведение матриц: сначала вторая, потом первая. */
export function multiply(m, n) {
    return [
        m[0] * n[0] + m[2] * n[1],
        m[1] * n[0] + m[3] * n[1],
        m[0] * n[2] + m[2] * n[3],
        m[1] * n[2] + m[3] * n[3],
        m[0] * n[4] + m[2] * n[5] + m[4],
        m[1] * n[4] + m[3] * n[5] + m[5]
    ]
}

/**
 * Mat.translate, Mat.scale, Mat.rotate из arc — все три домножают справа, как glTranslate.
 * Поэтому `draw translate` после `draw rotate` сдвигает уже в повёрнутых осях.
 */
export const translate = (m, x, y) => multiply(m, [1, 0, 0, 1, x, y])
export const scale = (m, x, y) => multiply(m, [x, 0, 0, y, 0, 0])

export function rotate(m, degrees) {
    if (degrees === 0) return m.slice()

    const radians = degrees * Math.PI / 180
    const cos = Math.cos(radians)
    const sin = Math.sin(radians)

    return multiply(m, [cos, sin, -sin, cos, 0, 0])
}

/**
 * Цвет команды `color`. Игра собирает ABGR и переинтерпретирует биты как float,
 * а `Color.toFloatBits` перед этим гасит бит 24 маской `0xfeffffff` — младший бит альфы.
 * Поэтому непрозрачное на дисплее это 254, а не 255. Заодно каналы больше 255 перетекают
 * в соседние, как и в игре.
 */
export function packedColor(r, g, b, a) {
    const value = (((a << 24) | (b << 16) | (g << 8) | r) & 0xfeffffff) >>> 0

    return {
        r: value & 0xff,
        g: (value >>> 8) & 0xff,
        b: (value >>> 16) & 0xff,
        a: (value >>> 24) & 0xff
    }
}

/**
 * Четырёхугольник линии. `Lines.line` при `cap = true` растягивает линию на половину толщины
 * в каждую сторону — торцы получаются квадратными и вылезают за концы.
 *
 * Нулевая длина даёт деление на ноль и в игре не рисует ничего.
 */
export function lineQuad(x1, y1, x2, y2, stroke) {
    const length = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
    if (length === 0) return null

    const half = stroke / 2
    const dx = (x2 - x1) / length * half
    const dy = (y2 - y1) / length * half

    return [
        [x1 - dx - dy, y1 - dy + dx],
        [x1 - dx + dy, y1 - dy - dx],
        [x2 + dx + dy, y2 + dy - dx],
        [x2 + dx - dy, y2 + dy + dx]
    ]
}

/**
 * Четыре заливки рамки. `Lines.rect` кладёт их **внутрь** прямоугольника, а на углах они
 * накладываются друг на друга — при полупрозрачном цвете углы выходят плотнее. Это видно
 * в игре, поэтому рисуем так же, четырьмя отдельными заливками.
 */
export function rectBorders(x, y, width, height, stroke) {
    return [
        [x, y, width, stroke],
        [x, y + height, width, -stroke],
        [x + width, y, -stroke, height],
        [x, y, stroke, height]
    ]
}

/** Вершины правильного многоугольника: `Angles.trns` от центра. */
export function polyPoints(x, y, sides, radius, rotation) {
    const space = 360 / sides
    const points = []

    for (let i = 0; i < sides; i++) {
        const angle = (space * i + rotation) * Math.PI / 180
        points.push([x + radius * Math.cos(angle), y + radius * Math.sin(angle)])
    }

    return points
}

/**
 * Кольцо обводки многоугольника. `Lines.poly` ведёт полосу по обе стороны от радиуса,
 * а на стыке расширяет её: `stroke / 2 / cos(space / 2)` — иначе на углах остались бы щели.
 *
 * Возвращает два кольца вершин, внешнее и внутреннее: дырку в холсте делает правило
 * чётности, а не вычитание.
 */
export function polyRing(x, y, sides, radius, rotation, stroke) {
    const space = 360 / sides
    const half = stroke / 2 / Math.cos(space / 2 * Math.PI / 180)

    return {
        outer: polyPoints(x, y, sides, radius + half, rotation),
        inner: polyPoints(x, y, sides, radius - half, rotation)
    }
}

/**
 * Дуга кольца. `Lines.poly(x, y, sides, radius, from, to)` делит промежуток углов на `sides`
 * шагов и кладёт на каждый четырёхугольник; расширение на стыке то же, что в `polyRing`.
 *
 * Возвращает наружный и внутренний обводы. Полный круг ими тоже описывается: обход наружу
 * и обратно внутрь даёт кольцо с дыркой по правилу ненулевого числа оборотов.
 */
export function polyArc(x, y, sides, radius, from, to, stroke) {
    const space = (to - from) / sides
    const half = stroke / 2 / Math.cos(space / 2 * Math.PI / 180)

    const outer = []
    const inner = []

    for (let i = 0; i <= sides; i++) {
        const angle = (space * i + from) * Math.PI / 180
        const [cos, sinus] = [Math.cos(angle), Math.sin(angle)]

        outer.push([x + (radius + half) * cos, y + (radius + half) * sinus])
        inner.push([x + (radius - half) * cos, y + (radius - half) * sinus])
    }

    return {outer, inner}
}

/**
 * Клин `Fill.arc`: центр и точки по дуге. Число точек берётся от доли круга, а не от полного
 * многоугольника, — потому у половины круга вдвое меньше сторон.
 */
export function arcSlice(x, y, radius, fraction, rotation, sides) {
    const max = Math.max(1, Math.ceil(sides * fraction))
    const points = [[x, y]]

    for (let i = 0; i <= max; i++) {
        const angle = (i / max * fraction * 360 + rotation) * Math.PI / 180
        points.push([x + radius * Math.cos(angle), y + radius * Math.sin(angle)])
    }

    return points
}
