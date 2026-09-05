/**
 * Перевод координат мира в пиксели холста. Ошибиться здесь легко: у мира ось Y смотрит вверх,
 * у холста вниз, а размеры игра считает в мировых единицах, которых восемь на тайл.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import {World} from '@mlog/core/src/world.js'
import {WorldView, TILE_UNITS, SPRITE_SCALE} from '../src/world.js'

/** Холст-заглушка: виду от него нужен только контекст и стили. */
const fakeCanvas = () => ({
    style: {},
    getContext: () => ({imageSmoothingEnabled: true})
})

const view = (world, tile = 32) => new WorldView(fakeCanvas(), {world, tile})

test('здание рисуется по центру своего тайла, а ось Y переворачивается', () => {
    const world = new World({width: 10, height: 10})
    const building = world.add('memory-cell', {x: 0, y: 0})

    // Нижний левый угол мира — нижний левый угол холста
    assert.deepEqual(view(world).place(building), [16, 320 - 16])
})

test('клик по холсту попадает в тот же тайл', () => {
    const world = new World({width: 10, height: 10})
    const map = view(world)

    assert.deepEqual(map.at(0, 0), {x: 0, y: 9})
    assert.deepEqual(map.at(319, 319), {x: 9, y: 0})
})

test('на мировую единицу приходится восьмая часть тайла', () => {
    const world = new World({width: 4, height: 4})

    assert.equal(view(world, 32).unit, 32 / TILE_UNITS)
})

test('картинка дисплея меньше самого блока', () => {
    // displaySize / 4 мировых единиц против size * 8 у блока: рамка остаётся видна
    const world = new World({width: 10, height: 10})
    const display = world.add('logic-display', {x: 5, y: 5})

    const screen = display.spec.displaySize / SPRITE_SCALE
    assert.equal(screen, 20)
    assert.ok(screen < display.size * TILE_UNITS)
})
