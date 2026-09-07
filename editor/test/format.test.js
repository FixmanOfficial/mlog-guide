/**
 * Сокращение чисел в панели ресурсов. Пороги в игре неровные, и проверяются именно они.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import {formatAmount} from '../src/format.js'
import {stripMarkup} from '../src/markup.js'

const plain = (number) => stripMarkup(formatAmount(number))

test('до тысячи число показывается как есть', () => {
    assert.equal(plain(0), '0')
    assert.equal(plain(999), '999')
})

test('тысячи — с одним знаком, десятки тысяч — уже целыми', () => {
    assert.equal(plain(1500), '1.5к')
    assert.equal(plain(9999), '10.0к')
    assert.equal(plain(39000), '39к')
})

test('миллионы и миллиарды со своими суффиксами', () => {
    assert.equal(plain(2_500_000), '2.5М')
    assert.equal(plain(3_000_000_000), '3.0В')
})

test('суффикс приходит серым — разметкой, а не текстом', () => {
    assert.equal(formatAmount(39000), '39[gray]к[]')
})
