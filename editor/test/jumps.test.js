/**
 * Раскладка стрелок переходов. Проверяется то, ради чего она вообще существует:
 * вложенные переходы должны оказаться на разных дорожках, а соседние — переиспользовать одну.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import {
    assignLanes, curvePoints, gutterWidth, laneOffset,
    EMPTY_GUTTER, LANE_BASE, LANE_STEP, STROKE
} from '../src/jumps.js'

const lanes = (jumps) => assignLanes(jumps).map(jump => jump.lane)

test('одинокий переход занимает первую дорожку', () => {
    assert.deepEqual(lanes([{from: 5, to: 0}]), [0])
})

test('вложенные переходы разводятся по разным дорожкам', () => {
    // Внешний охватывает внутренний, значит должен идти дальше от кода
    const result = assignLanes([{from: 9, to: 0}, {from: 6, to: 3}])
    const outer = result.find(jump => jump.from === 9)
    const inner = result.find(jump => jump.from === 6)

    assert.ok(outer.lane > inner.lane)
})

test('непересекающиеся переходы делят одну дорожку', () => {
    // Первый заканчивается раньше, чем начинается второй, места хватает обоим
    assert.deepEqual(lanes([{from: 2, to: 0}, {from: 6, to: 4}]), [0, 0])
})

test('три вложенных перехода занимают три дорожки', () => {
    const result = assignLanes([
        {from: 11, to: 0},
        {from: 9, to: 2},
        {from: 7, to: 4}
    ])

    assert.deepEqual(result.map(jump => jump.lane).sort(), [0, 1, 2])
})

test('переходы вперёд и назад разводятся независимо', () => {
    // Один идёт вниз, другой вверх: они не мешают друг другу и оба встают на нулевую
    const result = assignLanes([{from: 0, to: 5}, {from: 9, to: 6}])

    assert.deepEqual(result.map(jump => jump.lane), [0, 0])
})

test('переход в самого себя и переход в никуда пропускаются', () => {
    const result = assignLanes([{from: 3, to: 3}, {from: 4, to: -1}, {from: 5, to: 0}])

    assert.equal(result.length, 1)
    assert.equal(result[0].from, 5)
})

test('отступ дорожки растёт с шагом из игры', () => {
    assert.equal(laneOffset(0), LANE_BASE.wide)
    assert.equal(laneOffset(2), LANE_BASE.wide + LANE_STEP.wide * 2)
    assert.equal(laneOffset(0, true), LANE_BASE.narrow)
})

test('поле справа отмеряется по самой дальней дорожке', () => {
    const jumps = assignLanes([{from: 6, to: 0}, {from: 4, to: 2}])
    const widest = Math.max(...jumps.map(jump => laneOffset(jump.lane)))

    // Полотно стрелок и поле под него — одно и то же число: иначе дальняя стрелка обрежется
    assert.equal(gutterWidth(jumps), widest + STROKE * 2)
    assert.ok(gutterWidth(jumps) > gutterWidth([{lane: 0}]))
    assert.equal(gutterWidth([{lane: 0}], true), LANE_BASE.narrow + STROKE * 2)
})

test('без переходов поле справа не нужно', () => {
    assert.equal(gutterWidth([]), EMPTY_GUTTER)
})

test('длинный переход рисуется трапецией из четырёх точек', () => {
    const points = curvePoints(0, 0, 0, 400, 0)

    assert.equal(points.length, 4)
    // Боковые стороны уходят на отступ дорожки и идут вертикально
    assert.equal(points[1][0], LANE_BASE.wide)
    assert.equal(points[2][0], LANE_BASE.wide)
})

test('короткий переход сводится к треугольнику', () => {
    // Высота дорожки больше расстояния между строками: трапеция вывернулась бы наизнанку
    const points = curvePoints(0, 0, 0, 10, 0)

    assert.equal(points.length, 3)
})

test('ломаная начинается и заканчивается там, где просили', () => {
    const points = curvePoints(5, 10, 7, 300, 1)

    assert.deepEqual(points[0], [5, 10])
    assert.deepEqual(points.at(-1), [7, 300])
})
