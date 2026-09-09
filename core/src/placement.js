/**
 * Постановка блоков протяжкой — то, чем в игре строят на самом деле.
 *
 * Одиночный щелчок ставит один блок, но так почти никто не делает: конвейер тянут, зажав
 * кнопку, и он сам разворачивается по ходу линии. Здесь перенесены `Placement.normalizeLine`
 * и `InputHandler.iterateLine` — вместе они дают линию клеток и поворот для каждой.
 *
 * Правил в этих сорока строках больше, чем кажется:
 *
 *  - линия идёт по той оси, вдоль которой протянули дальше, а не по диагонали;
 *  - поворот каждого блока — направление на следующий, у последнего берётся направление
 *    от предыдущего (только у конвейеров и труб) или общий поворот линии;
 *  - блоки крупнее клетки не наезжают друг на друга: следующая точка пропускается, пока
 *    её след перекрывается с уже поставленным;
 *  - у турелей и буров поворот линии не трогается вовсе — `ignoreLineRotation`.
 *
 * Модуль чистый: ни холста, ни событий, ни мира. Поэтому его можно прогнать в тесте и не
 * гадать, отчего конвейер лёг не туда.
 */

import {BLOCK_SPECS} from './world.js'

/** Направление от клетки к соседней: 0 вправо, 1 вверх, 2 влево, 3 вниз. `Tile.relativeTo` */
function relativeTo(fromX, fromY, toX, toY) {
    if (fromX === toX && fromY === toY - 1) return 1
    if (fromX === toX && fromY === toY + 1) return 3
    if (fromX === toX - 1 && fromY === toY) return 0
    if (fromX === toX + 1 && fromY === toY) return 2

    return -1
}

/** Угол в градусах от 0 до 360, как `Angles.angle`. */
function angleOf(dx, dy) {
    const result = Math.atan2(dy, dx) * 180 / Math.PI
    return result < 0 ? result + 360 : result
}

/**
 * Клетки линии. `Placement.normalizeLine`: линия идёт по той оси, вдоль которой протянули
 * дальше, и никогда не наискось.
 */
export function normalizeLine(startX, startY, endX, endY) {
    const points = []

    if (Math.abs(startX - endX) > Math.abs(startY - endY)) {
        const step = Math.sign(endX - startX)
        for (let i = 0; i <= Math.abs(startX - endX); i++) points.push({x: startX + i * step, y: startY})
    } else {
        const step = Math.sign(endY - startY)
        for (let i = 0; i <= Math.abs(startY - endY); i++) points.push({x: startX, y: startY + i * step})
    }

    return points
}

/**
 * План постройки: клетки и поворот для каждой.
 *
 * @param type     что ставим
 * @param start    клетка, где нажали
 * @param end      клетка под курсором сейчас
 * @param rotation поворот, выбранный колесом; он же общий для линии
 * @returns массив `{type, x, y, rotation}` в порядке постановки
 */
export function linePlans(type, start, end, rotation = 0) {
    const spec = BLOCK_SPECS[type]
    if (spec === undefined) return []

    const points = normalizeLine(start.x, start.y, end.x, end.y)

    /*
     * Общий поворот линии: направление от начала к концу, округлённое до четверти оборота.
     * Когда линия ещё не растянута, берётся тот, что выбрал игрок.
     */
    const straight = start.x === end.x && start.y === end.y
    const base = straight
        ? rotation
        : Math.trunc((angleOf(end.x - start.x, end.y - start.y) + 45) / 90) % 4

    const plans = []
    let last = null

    for (let i = 0; i < points.length; i++) {
        const point = points[i]

        // След блока не должен наезжать на предыдущий: линия из буров идёт через клетку
        if (last !== null && Math.abs(point.x - last.x) < spec.size && Math.abs(point.y - last.y) < spec.size) {
            continue
        }

        const next = i === points.length - 1 ? null : points[i + 1]
        let turn = base

        if (spec.ignoreLineRotation === true) {
            turn = rotation
        } else if (next !== null) {
            turn = relativeTo(point.x, point.y, next.x, next.y)
        } else if (spec.conveyorPlacement === true && i > 0) {
            const previous = points[i - 1]
            turn = relativeTo(previous.x, previous.y, point.x, point.y)
        }

        plans.push({type, x: point.x, y: point.y, rotation: spec.rotate === true ? turn : 0})
        last = point
    }

    return plans
}

/**
 * Прямоугольник сноса: в игре разбор протяжкой выделяет область, а не линию.
 * `InputHandler.drawBreakSelection`
 */
export function breakArea(start, end) {
    return {
        x: Math.min(start.x, end.x),
        y: Math.min(start.y, end.y),
        width: Math.abs(start.x - end.x) + 1,
        height: Math.abs(start.y - end.y) + 1
    }
}
