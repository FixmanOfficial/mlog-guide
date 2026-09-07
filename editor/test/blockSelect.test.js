/**
 * Набор блока с клавиатуры. Проверяется не удобство, а те самые правила из `gridUpdate`:
 * пауза сбрасывает набор, третья цифра делает десятки, стрелки заворачиваются через край.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import {selectByNumber, selectByArrow, COMBO_MS} from '../src/blockSelect.js'

const categories = ['turret', 'production', 'distribution']
const start = {category: 'distribution', index: null, seq: 0, ended: true, at: 0}

test('первая цифра выбирает категорию, вторая — блок', () => {
    const first = selectByNumber(start, 0, {now: 1000, categories, count: 20})
    assert.equal(first.category, 'turret')
    assert.equal(first.index, null)

    const second = selectByNumber(first, 4, {now: 1100, categories, count: 20})
    assert.equal(second.index, 4)
    assert.equal(second.category, 'turret')
})

test('после паузы цифра снова считается категорией', () => {
    const first = selectByNumber(start, 0, {now: 1000, categories, count: 20})
    const late = selectByNumber(first, 2, {now: 1000 + COMBO_MS + 1, categories, count: 20})

    assert.equal(late.category, 'distribution')
    assert.equal(late.index, null, 'набор начался заново, блок не выбран')
})

test('третья цифра превращает набранное в десятки', () => {
    const category = selectByNumber(start, 2, {now: 1000, categories, count: 30})
    const tens = selectByNumber(category, 0, {now: 1050, categories, count: 30})
    const units = selectByNumber(tens, 4, {now: 1100, categories, count: 30})

    // «3,1,5» — это пятнадцатый блок: единица стала десятком
    assert.equal(units.index, 14)
    assert.equal(units.ended, true)
})

test('«X,1,0» выбирает тот же блок, что «X,0»', () => {
    const category = selectByNumber(start, 2, {now: 1000, categories, count: 30})

    const short = selectByNumber(category, 9, {now: 1050, categories, count: 30})
    const long = selectByNumber(selectByNumber(category, 0, {now: 1050, categories, count: 30}),
        9, {now: 1100, categories, count: 30})

    assert.equal(short.index, 9)
    assert.equal(long.index, 9)
})

test('стрелки ходят по сетке и заворачиваются через край', () => {
    const options = {count: 10, columns: 4}

    assert.equal(selectByArrow(0, 'left', options), 9)
    assert.equal(selectByArrow(9, 'right', options), 0)
    assert.equal(selectByArrow(5, 'down', options), 9)
    assert.equal(selectByArrow(9, 'down', options), 1)
    assert.equal(selectByArrow(5, 'up', options), 1)
})
