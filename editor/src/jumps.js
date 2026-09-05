import {METRICS} from './theme.js'

/**
 * Стрелки переходов.
 *
 * Перенос logic/LCanvas.java: JumpCurve.drawCurve и раскладка по дорожкам из DragLayout.
 * Стрелка рисуется трапецией — в исходниках так и написано, `//trapezoidal jumps`. Прежний
 * скруглённый вариант в игре не используется.
 *
 * Главное здесь не линия, а вычисление дорожки. Вложенные переходы разводятся по высоте,
 * чтобы не наезжать друг на друга: внешний переход уходит дальше от кода, внутренний ближе.
 * Без этого схема с несколькими циклами превращается в кашу.
 */

/** Высота первой дорожки и шаг между ними. LCanvas.drawCurve */
export const LANE_BASE = {wide: METRICS.jumpLane, narrow: METRICS.jumpLanePortrait}
export const LANE_STEP = {wide: METRICS.jumpLaneStep, narrow: METRICS.jumpLaneStepPortrait}

/** Толщина линии. LCanvas.drawCurve */
export const STROKE = METRICS.jumpStroke

/**
 * Приводит переходы к виду, с которым работает раскладка.
 * `flipped` означает переход назад по коду — такие разводятся отдельно от переходов вперёд.
 */
function normalize(jumps) {
    return jumps
        .filter(jump => Number.isInteger(jump.to) && jump.to >= 0 && jump.to !== jump.from)
        .map(jump => ({
            ...jump,
            flipped: jump.from >= jump.to,
            begin: Math.min(jump.from, jump.to),
            end: Math.max(jump.from, jump.to)
        }))
}

/**
 * Оставляет по одному представителю на каждый пучок переходов: если несколько стрелок
 * начинаются в одной точке, дорожку считаем только для самой длинной, а остальные её повторят.
 * LCanvas.java:276-290
 */
function representatives(jumps) {
    const before = new Map()
    const after = new Map()

    for (const jump of jumps) {
        if (jump.flipped) {
            const previous = after.get(jump.begin)
            if (previous !== undefined && previous.end >= jump.end) continue
            after.set(jump.begin, jump)
        } else {
            const previous = before.get(jump.end)
            if (previous !== undefined && previous.begin <= jump.begin) continue
            before.set(jump.end, jump)
        }
    }

    return {
        list: [...before.values(), ...after.values()].sort((a, b) => a.begin - b.begin),
        before,
        after
    }
}

/** Первый свободный бит начиная с указанного. Bits.nextClearBit */
function nextClearBit(occupied, from) {
    let bit = Math.max(0, from)
    while (occupied.has(bit)) bit++
    return bit
}

/**
 * Дорожка перехода. Считается рекурсивно: сначала разводятся все переходы, вложенные в текущий,
 * и текущий встаёт над самым высоким из них. LCanvas.getJumpHeight
 */
function laneOf(index, list, occupiers, occupied, done) {
    const jump = list[index]
    if (done.has(jump)) return jump.lane

    const localOccupiers = occupiers.slice()
    const localOccupied = new Set(occupied)

    let max = -1

    for (let i = index + 1; i < list.length; i++) {
        const current = list[i]
        // Интересуют только переходы, целиком вложенные в текущий
        if (current.end > jump.end) continue

        for (let k = localOccupiers.length - 1; k >= 0; k--) {
            if (localOccupiers[k].end > current.begin) continue
            localOccupied.delete(localOccupiers[k].lane)
            localOccupiers.splice(k, 1)
        }

        const lane = laneOf(i, list, localOccupiers, localOccupied, done)
        localOccupiers.push(current)
        localOccupied.add(lane)
        max = Math.max(max, lane)
    }

    jump.lane = nextClearBit(occupied, max + 1)
    done.add(jump)
    return jump.lane
}

/**
 * Раскладывает переходы по дорожкам.
 * @param jumps список `{from, to}` — номера строк, откуда и куда
 * @returns тот же список с добавленным полем `lane`
 */
export function assignLanes(jumps) {
    const normalized = normalize(jumps)
    const {list, before, after} = representatives(normalized)

    const occupiers = []
    const occupied = new Set()
    const done = new Set()

    for (let i = 0; i < list.length; i++) {
        const current = list[i]

        for (let k = occupiers.length - 1; k >= 0; k--) {
            if (occupiers[k].end > current.begin) continue
            occupied.delete(occupiers[k].lane)
            occupiers.splice(k, 1)
        }

        const lane = laneOf(i, list, occupiers, occupied, done)
        occupiers.push(current)
        occupied.add(lane)
    }

    // Остальные переходы повторяют дорожку своего представителя
    for (const jump of normalized) {
        const representative = jump.flipped ? after.get(jump.begin) : before.get(jump.end)
        jump.lane = representative.lane
    }

    return normalized
}

/** Отступ стрелки от кода на этой дорожке. */
export const laneOffset = (lane, narrow = false) =>
    (narrow ? LANE_BASE.narrow : LANE_BASE.wide) + (narrow ? LANE_STEP.narrow : LANE_STEP.wide) * lane

/**
 * Точки ломаной для одной стрелки: от точки выхода до точки входа.
 *
 * Обычный случай — трапеция из четырёх точек. Если её боковые стороны пересекаются
 * (переход слишком короткий для своей высоты), игра сводит её к треугольнику через точку
 * пересечения — иначе линия вывернулась бы наизнанку.
 */
export function curvePoints(x, y, x2, y2, lane, narrow = false) {
    const height = laneOffset(lane, narrow)
    const dy = (y2 === y ? 0 : y2 > y ? 1 : -1) * height * 0.5

    const crossing = intersect(
        x, y, x + height, y + dy,
        x2, y2, x + height, y2 - dy
    )

    if (crossing !== null) {
        return [[x, y], [crossing.x, crossing.y], [x2, y2]]
    }

    return [[x, y], [x + height, y + dy], [x + height, y2 - dy], [x2, y2]]
}

/** Пересечение отрезков, или null. Intersector.intersectSegments */
function intersect(x1, y1, x2, y2, x3, y3, x4, y4) {
    const d = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1)
    if (d === 0) return null

    const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / d
    const ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / d

    if (ua < 0 || ua > 1 || ub < 0 || ub > 1) return null

    return {x: x1 + ua * (x2 - x1), y: y1 + ua * (y2 - y1)}
}
