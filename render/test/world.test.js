/**
 * Перевод координат мира в пиксели холста. Ошибиться здесь легко: у мира ось Y смотрит вверх,
 * у холста вниз, а размеры игра считает в мировых единицах, которых восемь на тайл.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import {World} from '@mlog/core/src/world.js'
import {UNIT_SPECS} from '@mlog/core/src/unit.js'
import unitSprites from '@mlog/core/data/unit-sprites.json' with {type: 'json'}
import teams from '@mlog/core/data/teams.json' with {type: 'json'}
import pal from '@mlog/core/data/pal.json' with {type: 'json'}

import {WorldView, TILE_UNITS, SPRITE_SCALE, PAL} from '../src/world.js'
import {BACKGROUND} from '../src/display.js'

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

test('блок с чётной стороной рисуется по углу тайла', () => {
    // Block.offset: центр смещается на половину тайла, иначе блок 2 на 2 не ложится на сетку
    const world = new World({width: 10, height: 10})
    const processor = world.add('logic-processor', {x: 4, y: 4})

    assert.deepEqual(view(world).place(processor), [4 * 32 + 32, 320 - (4 * 32 + 32)])
})

test('цвета вида на мир взяты из палитры игры', () => {
    // Сверка по именам: `Drawf` рисует подложку Pal.gray, рамку связи Pal.place,
    // круг дальности Pal.accent, а фон дисплея — Pal.darkerMetal
    assert.equal(PAL.gray, pal.colors.gray)
    assert.equal(PAL.place, pal.colors.place)
    assert.equal(PAL.accent, pal.colors.accent)
    assert.equal(PAL.remove, pal.colors.remove)
    assert.equal(BACKGROUND, pal.colors.darkerMetal)
})

test('атлас юнитов держит корпус и накладку команды для каждого юнита', () => {
    const bodies = Object.keys(unitSprites.sprites).filter(name => !name.endsWith('-cell'))

    // У каждой накладки есть корпус: без него её не на что класть
    for (const name of Object.keys(unitSprites.sprites)) {
        if (!name.endsWith('-cell')) continue
        assert.ok(unitSprites.sprites[name.slice(0, -5)] !== undefined, `${name} без корпуса`)
    }

    // Размеры не нулевые и не выходят за атлас
    for (const [name, entry] of Object.entries(unitSprites.sprites)) {
        assert.ok(entry.width > 0 && entry.height > 0, name)
        assert.ok(entry.x + entry.width <= unitSprites.width, name)
        assert.ok(entry.y + entry.height <= unitSprites.height, name)
    }

    // Юниты, которых водит песочница, в атласе есть обязательно
    for (const name of ['poly', 'mono', 'dagger', 'flare']) {
        assert.ok(bodies.includes(name), name)
    }
})

test('цвет команды берётся из таблицы, а не из палитры интерфейса', () => {
    const world = new World({width: 10, height: 10})
    const it = new WorldView(fakeCanvas(), {world, tile: 32, teams})

    assert.equal(it.teamColor(1), '#ffd37f', 'sharded')
    assert.equal(it.teamColor(2), '#f25555', 'crux')
    assert.equal(it.teamColor(0), '#4d4e58', 'derelict')
})

test('юнит занимает на холсте столько же, сколько в игре', () => {
    const world = new World({width: 10, height: 10, content: null})
    world.spawn('poly', {x: 1, y: 1})

    const it = new WorldView(fakeCanvas(), {world, tile: 32, unitSprites})
    const sprite = unitSprites.sprites.poly

    // Draw.scl = 1/4: спрайт вчетверо крупнее мировых единиц, а на тайл их восемь.
    // При 32 пикселях на тайл спрайт выходит один в один со своим разрешением
    const expected = sprite.width / SPRITE_SCALE * it.unit
    assert.equal(expected, sprite.width)

    // И размер юнита в игре не равен спрайту: hitSize это коробка попаданий, она меньше
    assert.ok(UNIT_SPECS.poly.hitSize * it.unit < expected)
})
