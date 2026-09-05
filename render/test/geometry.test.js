/**
 * Геометрия фигур дисплея. Числа сверяются с arc: `Lines` и `Fill`.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import {
    identity, translate, scale, rotate, multiply,
    packedColor, lineQuad, rectBorders, polyPoints, polyRing
} from '../src/geometry.js'

/** Точка после преобразования — чтобы проверять матрицы по действию, а не по числам. */
const apply = (m, [x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]

const close = (actual, expected, message) =>
    assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: ${actual} вместо ${expected}`)

test('преобразования домножаются справа, как в Mat', () => {
    // Сначала поворот, потом сдвиг — сдвиг идёт уже в повёрнутых осях
    const m = translate(rotate(identity(), 90), 10, 0)
    const [x, y] = apply(m, [0, 0])

    close(x, 0, 'x')
    close(y, 10, 'y')
})

test('масштаб применяется к точке, а не к началу координат', () => {
    const [x, y] = apply(scale(identity(), 2, 3), [4, 5])

    close(x, 8, 'x')
    close(y, 15, 'y')
})

test('произведение единичной матрицы ничего не меняет', () => {
    assert.deepEqual(multiply(identity(), identity()), identity())
})

test('цвет теряет младший бит альфы', () => {
    // Color.toFloatBits гасит бит 24 маской 0xfeffffff
    assert.deepEqual(packedColor(255, 128, 0, 255), {r: 255, g: 128, b: 0, a: 254})
    assert.deepEqual(packedColor(0, 0, 0, 128), {r: 0, g: 0, b: 0, a: 128})
})

test('линия вылезает за концы на половину толщины', () => {
    // Lines.line при cap = true: торцы квадратные
    const quad = lineQuad(10, 0, 20, 0, 4)

    assert.deepEqual(quad[0], [8, 2])
    assert.deepEqual(quad[1], [8, -2])
    assert.deepEqual(quad[2], [22, -2])
    assert.deepEqual(quad[3], [22, 2])
})

test('линия нулевой длины не рисуется', () => {
    assert.equal(lineQuad(5, 5, 5, 5, 2), null)
})

test('рамка уходит внутрь прямоугольника', () => {
    // Lines.rect: четыре заливки по сторонам, наружу не выходит ни одна
    const [bottom, top, right, left] = rectBorders(0, 0, 100, 50, 2)

    assert.deepEqual(bottom, [0, 0, 100, 2])
    assert.deepEqual(top, [0, 50, 100, -2])
    assert.deepEqual(right, [100, 0, -2, 50])
    assert.deepEqual(left, [0, 0, 2, 50])
})

test('первая вершина многоугольника лежит по углу поворота', () => {
    const [first] = polyPoints(0, 0, 4, 10, 0)

    close(first[0], 10, 'x')
    close(first[1], 0, 'y')
})

test('обводка многоугольника расширяется на стыке', () => {
    // Lines.poly: половина толщины делится на косинус половины угла между сторонами
    const {outer, inner} = polyRing(0, 0, 4, 10, 0, 2)
    const half = 1 / Math.cos(45 * Math.PI / 180)

    close(outer[0][0], 10 + half, 'внешний радиус')
    close(inner[0][0], 10 - half, 'внутренний радиус')
})
