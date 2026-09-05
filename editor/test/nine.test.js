/**
 * Девятипатчи: числа для вёрстки берутся из спрайтов, а не из головы.
 *
 * Разбирает их `tools/gen-nine.mjs`. Здесь проверяется то, на что опирается CSS: толщина
 * рамки, срез угла у кнопки и прозрачность заливки у панели.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import pal from '@mlog/core/data/pal.json' with {type: 'json'}

import {PATCHES, variables} from '../src/nine.js'

test('кнопка — восьмиугольник с рамкой в четыре пикселя', () => {
    // button.9.png: углы срезаны по диагонали, рамка цветом Pal.gray, внутри чёрный
    assert.equal(PATCHES.button.border, 4)
    assert.ok(PATCHES.button.cut > 0, 'у кнопки срезаны углы')
    assert.equal(PATCHES.button.frame, pal.colors.gray)
    assert.equal(PATCHES.button.fill, '#000000')
    assert.equal(PATCHES.button.fillAlpha, 1)
})

test('панель прозрачна на сорок процентов, а сплошная — нет', () => {
    assert.equal(PATCHES.pane.fillAlpha, 0.6)
    assert.equal(PATCHES['pane-solid'].fillAlpha, 1)
    assert.equal(PATCHES.pane.border, 4)
})

test('рамка строки инструкции белая и в пять пикселей', () => {
    // white-pane красится цветом категории, поэтому в спрайте она белая, а внутри пусто
    assert.equal(PATCHES['white-pane'].border, 5)
    assert.equal(PATCHES['white-pane'].frame, '#ffffff')
    assert.equal(PATCHES['white-pane'].fillAlpha, 0)
})

test('переменные CSS собираются с единицами и прозрачностью', () => {
    const vars = variables('pane')

    assert.equal(vars['--pane-border'], '4px')
    assert.equal(vars['--pane-frame'], pal.colors.gray)
    assert.equal(vars['--pane-fill'], 'rgb(0 0 0 / 0.6)')
})
