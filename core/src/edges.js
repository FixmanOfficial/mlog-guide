/**
 * Клетки вокруг блока — порядок, в котором игра обходит соседей.
 *
 * Порядок здесь не украшение: по нему здание раздаёт предметы. `dump` и `offload` идут
 * по соседям от `cdump` по кругу, и от того, кто в этом круге первый, зависит, в какой
 * конвейер уедет руда. Считать его «слева направо» нельзя — игра сортирует точки по углу.
 *
 * `Edges.getEdges`: для блока стороной `size` берётся рамка на клетку шире, точки
 * складываются четвёрками (низ, верх, лево, право) и сортируются по `Mathf.angle`, то есть
 * по углу от оси X против часовой стрелки.
 */

/** `Mathf.angle`: угол в градусах от 0 до 360, ось Y вверх. */
function angle(x, y) {
    const result = Math.atan2(y, x) * 180 / Math.PI
    return result < 0 ? result + 360 : result
}

const cache = new Map()

/** Точки вокруг блока стороной `size`, в порядке игры. Edges.java:22-40 */
export function edgeOffsets(size) {
    const cached = cache.get(size)
    if (cached !== undefined) return cached

    const index = size - 1
    const bottom = -Math.trunc(index / 2) - 1
    const top = Math.trunc(index / 2 + 0.5) + 1

    const points = []

    for (let j = 0; j < index + 1; j++) {
        points.push({x: bottom + 1 + j, y: bottom})
        points.push({x: bottom + 1 + j, y: top})
        points.push({x: bottom, y: bottom + j + 1})
        points.push({x: top, y: bottom + j + 1})
    }

    points.sort((first, second) => angle(first.x, first.y) - angle(second.x, second.y))

    cache.set(size, points)
    return points
}

/**
 * Клетка блока, обращённая к соседу. `Edges.getFacingEdge`.
 *
 * У блока размером в одну клетку это он сам, у большого — ближайшая к соседу клетка его следа.
 * Без этого конвейер не понимает, с какой стороны в него въезжает предмет: центр бура два
 * на два соседним конвейеру не приходится вовсе.
 */
export function facingEdge(building, toX, toY) {
    const size = building.size

    if (size <= 1) return {x: building.x, y: building.y}

    const low = -Math.trunc((size - 1) / 2)
    const high = Math.trunc(size / 2)
    const clamp = (value) => Math.max(low, Math.min(high, value))

    return {
        x: building.x + clamp(toX - building.x),
        y: building.y + clamp(toY - building.y)
    }
}

