/**
 * Дисплей: то, что вид делает с командами, без настоящего холста.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import {DisplayView} from '../src/display.js'

/** Холст-заглушка: помнит, какими цветами заливали. */
function fakeCanvas() {
    const fills = []
    const context = {
        fillStyle: '',
        setTransform() {},
        fillRect() { fills.push(this.fillStyle) },
        beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {},
        save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, fillText() {}, drawImage() {}
    }

    return {canvas: {width: 0, height: 0, getContext: () => context}, fills}
}

test('draw clear зажимает каналы, а не берёт остаток', () => {
    // Core.graphics.clear(x / 255f, ...) → glClearColor зажимает долю в [0, 1]
    const {canvas, fills} = fakeCanvas()
    const view = new DisplayView(canvas, {size: 80})

    view.run({type: 'clear', x: 300, y: -5, p1: 128})
    assert.equal(fills.at(-1), 'rgb(255 0 128)')
})
