/**
 * Кривые анимации. Значения сверены с `arc/math/Interp.java`: те же формулы, посчитанные вручную.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import {linear, smooth, smoother, pow2, pow3Out, pow3In, sineOut, cssEasing} from '../src/interp.js'

const close = (actual, expected, message) =>
    assert.ok(Math.abs(actual - expected) < 1e-6, `${message}: ${actual} вместо ${expected}`)

test('кривые начинаются в нуле и заканчиваются единицей', () => {
    for (const curve of [linear, smooth, smoother, pow2, pow3Out, pow3In, sineOut]) {
        close(curve(0), 0, 'начало')
        close(curve(1), 1, 'конец')
    }
})

test('pow3Out: быстро, потом медленно', () => {
    // Math.pow(a - 1, 3) * 1 + 1, степень нечётная
    close(pow3Out(0.5), 1 - 0.125, 'середина')
    close(pow3Out(0.25), 1 + Math.pow(-0.75, 3), 'четверть')

    // К середине пути пройдено больше половины — в этом весь смысл кривой
    assert.ok(pow3Out(0.5) > 0.8)
})

test('pow2 симметрична относительно середины', () => {
    close(pow2(0.5), 0.5, 'середина')
    close(pow2(0.25), Math.pow(0.5, 2) / 2, 'четверть')
})

test('smooth и smoother — те самые сглаживания', () => {
    close(smooth(0.5), 0.5, 'smoothstep в середине')
    close(smoother(0.5), 0.5, 'кривая Перлина в середине')
    close(smoother(0.25), Math.pow(0.25, 3) * (0.25 * (0.25 * 6 - 15) + 10), 'четверть')
})

test('перевод в linear() даёт список опорных точек', () => {
    const easing = cssEasing(linear, 4)

    assert.equal(easing, 'linear(0 0%, 0.25 25%, 0.5 50%, 0.75 75%, 1 100%)')
})
