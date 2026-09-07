/**
 * Разбор цветной разметки. Проверяется не «красиво ли», а то, что делает `GlyphLayout`:
 * стек цветов, экранирование скобки и молчаливый отказ на неизвестном имени.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import {parseMarkup, stripMarkup, MARKUP_COLORS} from '../src/markup.js'

const texts = (parts) => parts.map(part => part.text)
const colors = (parts) => parts.map(part => part.color)

test('имена цветов берутся из таблицы игры', () => {
    const parts = parseMarkup('[accent]Получите: [][lightgray]30')

    assert.deepEqual(texts(parts), ['Получите: ', '30'])
    assert.deepEqual(colors(parts), ['#ffd37f', '#bfbfbf'])

    // Пять имён игра добавляет уже поверх arc — они тоже должны быть
    assert.equal(MARKUP_COLORS.stat !== undefined, true)
    assert.equal(MARKUP_COLORS.negstat !== undefined, true)
})

test('«[]» снимает верхний цвет, а не сбрасывает всё', () => {
    const parts = parseMarkup('[red]красный [white]белый[] снова красный[] без цвета')

    assert.deepEqual(colors(parts), ['#e55454', '#ffffff', '#e55454', null])
})

test('шестнадцатеричный цвет читается прямо из тега', () => {
    assert.deepEqual(colors(parseMarkup('[#ff0000]красный')), ['#ff0000'])

    // Восемь цифр — цвет с прозрачностью; прозрачность мы отбрасываем, цвет остаётся
    assert.deepEqual(colors(parseMarkup('[#ff000080]полупрозрачный')), ['#ff0000'])
})

test('неизвестное имя и незакрытая скобка печатаются как есть', () => {
    assert.equal(stripMarkup('[нетакого]текст'), '[нетакого]текст')
    assert.equal(stripMarkup('текст [accent'), 'текст [accent')
})

test('«[[» — это одна скобка', () => {
    assert.equal(stripMarkup('[[accent]'), '[accent]')
})

test('пустая строка не даёт кусков, а строка без разметки — один', () => {
    assert.deepEqual(parseMarkup(''), [])
    assert.deepEqual(parseMarkup('просто текст'), [{text: 'просто текст', color: null}])
})
