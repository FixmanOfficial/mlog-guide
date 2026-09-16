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
 *  - у турелей и буров поворот линии не трогается вовсе — `ignoreLineRotation`;
 *  - линия, доведённая до конвейера или трубы, не разворачивает их: последний блок берёт
 *    поворот того, во что упёрся.
 *
 * Ни холста, ни событий здесь нет — только мир, и тот необязателен. Поэтому линию можно
 * прогнать в тесте и не гадать, отчего конвейер лёг не туда.
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

/**
 * Звено цепи в этой клетке, если оно там есть. `ChainedBuilding` — это конвейеры и трубы:
 * то, что выстраивается в линию и передаёт содержимое следующему.
 */
function chainedAt(world, x, y) {
    const building = world?.at(x, y)
    return building !== undefined && building?.spec.chained === true ? building : null
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
 * Клетки прямоугольника. `Placement.normalizeRectangle`: у блоков с `allowRectanglePlacement`
 * (стены и им подобные) протяжка заполняет область, а не линию, с шагом в размер блока.
 */
export function normalizeRectangle(startX, startY, endX, endY, size) {
    const points = []
    const width = Math.abs(endX - startX)
    const height = Math.abs(endY - startY)

    for (let y = 0; y <= height; y += size) {
        for (let x = 0; x <= width; x += size) {
            points.push({x: startX + x * Math.sign(endX - startX), y: startY + y * Math.sign(endY - startY)})
        }
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
 * @param world    мир, если он есть: по нему линия узнаёт, во что упёрлась
 * @returns массив `{type, x, y, rotation}` в порядке постановки
 */
export function linePlans(type, start, end, rotation = 0, world = null) {
    const spec = BLOCK_SPECS[type]
    if (spec === undefined) return []

    const points = spec.allowRectanglePlacement === true
        ? normalizeRectangle(start.x, start.y, end.x, end.y, spec.size)
        : normalizeLine(start.x, start.y, end.x, end.y)

    /*
     * Линия упёрлась в чужой конвейер или трубу — последний блок берёт их поворот, а не
     * разворачивает их по ходу протяжки. Правило отменяется, когда предпоследняя клетка
     * тоже звено цепи: тогда линия идёт вдоль неё, а не втыкается в неё.
     */
    let endRotation = -1
    const met = chainedAt(world, end.x, end.y)

    if (points.length > 1 && met !== null
        && chainedAt(world, points[points.length - 2].x, points[points.length - 2].y) === null) {
        endRotation = met.rotation
    }

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

    /*
     * Поворот держится между клетками: у игры это поле переиспользуемого `PlaceLine`, и когда
     * следующая клетка не соседняя (новый ряд прямоугольника), он просто не меняется.
     */
    let held = base

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
        } else if (endRotation !== -1) {
            turn = endRotation
        } else if (spec.conveyorPlacement === true && i > 0) {
            const previous = points[i - 1]
            turn = relativeTo(previous.x, previous.y, point.x, point.y)
        }

        // `if(result != -1) line.rotation = result`
        if (turn !== -1) held = turn

        plans.push({type, x: point.x, y: point.y, rotation: spec.rotate === true ? held : 0})
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
