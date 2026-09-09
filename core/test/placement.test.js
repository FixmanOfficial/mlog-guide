/**
 * Постановка протяжкой: линия клеток и поворот каждой.
 *
 * Перенос `Placement.normalizeLine` и `InputHandler.iterateLine`. Проверяется то, что видно
 * игроку: конвейер разворачивается по ходу линии, буры не наезжают друг на друга, а турель
 * поворот линии игнорирует.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import {linePlans, normalizeLine, breakArea} from '../src/placement.js'

test('линия идёт по той оси, вдоль которой протянули дальше', () => {
    // Placement.normalizeLine: наискось линия не идёт никогда
    assert.deepEqual(normalizeLine(2, 2, 6, 3).map(p => [p.x, p.y]),
        [[2, 2], [3, 2], [4, 2], [5, 2], [6, 2]])

    assert.deepEqual(normalizeLine(2, 2, 3, 6).map(p => [p.x, p.y]),
        [[2, 2], [2, 3], [2, 4], [2, 5], [2, 6]])
})

test('конвейер разворачивается по ходу линии', () => {
    const plans = linePlans('conveyor', {x: 2, y: 2}, {x: 5, y: 2}, 1)

    assert.equal(plans.length, 4)
    assert.deepEqual(plans.map(plan => plan.rotation), [0, 0, 0, 0])

    // Тянем вниз — все смотрят вниз, хотя колесом был выбран поворот вверх
    const down = linePlans('conveyor', {x: 2, y: 8}, {x: 2, y: 5}, 1)
    assert.deepEqual(down.map(plan => plan.rotation), [3, 3, 3, 3])
})

test('последний конвейер линии смотрит туда же, куда предыдущий', () => {
    const plans = linePlans('conveyor', {x: 2, y: 2}, {x: 4, y: 2}, 2)

    // `conveyorPlacement`: у последнего нет следующего, и поворот берётся от предыдущего
    assert.equal(plans.at(-1).rotation, 0)
})

test('одиночный щелчок оставляет поворот, выбранный колесом', () => {
    const plans = linePlans('conveyor', {x: 3, y: 3}, {x: 3, y: 3}, 2)

    assert.equal(plans.length, 1)
    assert.equal(plans[0].rotation, 2)
})

test('блоки крупнее клетки встают через свой размер', () => {
    const plans = linePlans('mechanical-drill', {x: 2, y: 2}, {x: 9, y: 2}, 0)

    // Бур два на два: следующая точка пропускается, пока след перекрывается с предыдущим
    assert.deepEqual(plans.map(plan => plan.x), [2, 4, 6, 8])
    assert.ok(plans.every(plan => plan.y === 2))
})

test('турель поворот линии игнорирует', () => {
    // `ignoreLineRotation`: у дуо направление задаёт игрок, а не то, куда тянули
    const plans = linePlans('duo', {x: 2, y: 2}, {x: 5, y: 2}, 1)

    assert.deepEqual(plans.map(plan => plan.rotation), [1, 1, 1, 1])
})

test('неповорачиваемый блок остаётся с нулевым поворотом', () => {
    const plans = linePlans('router', {x: 2, y: 2}, {x: 4, y: 2}, 3)
    assert.deepEqual(plans.map(plan => plan.rotation), [0, 0, 0])
})

test('снос протяжкой выделяет прямоугольник', () => {
    assert.deepEqual(breakArea({x: 5, y: 7}, {x: 2, y: 3}), {x: 2, y: 3, width: 4, height: 5})
})
