/**
 * Цвета редактора обязаны совпадать с палитрой игры — не «на глаз», а по имени.
 *
 * Палитру снимает `tools/gen-pal.mjs` из `graphics/Pal.java`. Отличить `#454545` от `#4d4d4d`
 * глазом нельзя, поэтому единственный способ не разъехаться — сверять с таблицей.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import pal from '@mlog/core/data/pal.json' with {type: 'json'}

import {CATEGORY_COLORS, JUMP_COLOR, JUMP_HOVER_COLOR} from '../src/theme.js'
import {TYPE_COLORS, dim, typeName, valueText} from '../src/variables.js'
import {World} from '@mlog/core/src/world.js'
import {createContent} from '@mlog/core/src/content.js'
import logicIds from '@mlog/core/data/logic-ids.json' with {type: 'json'}

const colour = (name) => pal.colors[name]

test('цвет категории — это соответствующий цвет из Pal', () => {
    // LCategory: у каждой категории свой цвет, у неизвестной — darkishGray
    assert.equal(CATEGORY_COLORS.io, colour('logicIo'))
    assert.equal(CATEGORY_COLORS.block, colour('logicBlocks'))
    assert.equal(CATEGORY_COLORS.operation, colour('logicOperations'))
    assert.equal(CATEGORY_COLORS.control, colour('logicControl'))
    assert.equal(CATEGORY_COLORS.unit, colour('logicUnits'))
    assert.equal(CATEGORY_COLORS.world, colour('logicWorld'))
    assert.equal(CATEGORY_COLORS.unknown, colour('darkishGray'))
})

test('стрелка перехода белая, а под курсором — Pal.place', () => {
    // LCanvas.JumpButton: hoverColor = Pal.place, обычный цвет белый
    assert.equal(JUMP_COLOR, '#ffffff')
    assert.equal(JUMP_HOVER_COLOR, colour('place'))
})

test('в палитре есть всё, на что мы ссылаемся по имени', () => {
    const used = [
        'accent', 'gray', 'darkishGray', 'place', 'remove', 'ammo', 'darkerMetal',
        'logicIo', 'logicBlocks', 'logicOperations', 'logicControl', 'logicUnits', 'logicWorld'
    ]

    for (const name of used) {
        assert.match(colour(name) ?? '', /^#[0-9a-f]{6}$/, `цвет ${name}`)
    }
})

test('цвет типа переменной берётся из палитры по имени', () => {
    // LogicDialog.typeColor: число это Pal.place, строка Pal.ammo, контент logicOperations,
    // здание logicBlocks, юнит и команда logicUnits, перечисление logicIo
    assert.equal(TYPE_COLORS.number, colour('place'))
    assert.equal(TYPE_COLORS.string, colour('ammo'))
    assert.equal(TYPE_COLORS.content, colour('logicOperations'))
    assert.equal(TYPE_COLORS.building, colour('logicBlocks'))
    assert.equal(TYPE_COLORS.unit, colour('logicUnits'))
    assert.equal(TYPE_COLORS.team, colour('logicUnits'))
    assert.equal(TYPE_COLORS.enum, colour('logicIo'))

    // Color.darkGray из arc, а не цвет игры
    assert.equal(TYPE_COLORS.null, '#3f3f3f')
})

test('полоска перед ячейкой вдвое темнее, с усечением как в arc', () => {
    // Pal.gray это #454545, то есть 69; 69 / 255 * 0.5 * 255 усекается до 34
    assert.equal(dim(colour('gray')), '#222222')
})

test('значение печатается целым, пока отличается от целого меньше чем на 1e-5', () => {
    assert.equal(valueText({isobj: false, numval: 3.000001}), '3')
    assert.equal(valueText({isobj: false, numval: 3.5}), '3.5')
    assert.equal(valueText({isobj: true, objval: null}), 'null')
    assert.equal(typeName({isobj: true, objval: null}), 'null')
    assert.equal(typeName({isobj: false, numval: 1}), 'number')
})

test('юнит в таблице — юнит, а не здание', () => {
    // У юнита тоже есть ссылка на мир, поэтому проверка по полям путала его со зданием
    const world = new World({content: null})
    const unit = world.spawn('poly', {x: 3, y: 3})
    const building = world.add('router', {x: 5, y: 5})

    assert.equal(typeName({isobj: true, objval: unit}), 'unit')
    assert.equal(typeName({isobj: true, objval: building}), 'building')
})

test('команда в таблице — команда', () => {
    const content = createContent(logicIds)
    const sharded = content.globals.get('@sharded')

    assert.equal(typeName(sharded), 'team')
    assert.equal(valueText(sharded), 'sharded')
})

test('юнит и здание в таблице печатаются типом, как в игре', () => {
    /*
     * `LogicDialog` показывает значение через `PrintI.toString`, а тот у юнита берёт
     * `unit.type.name`, у здания — `build.block.name`. Раньше юнит выходил «object»,
     * а здание — именем связи, которого в игре у здания нет вовсе.
     */
    const world = new World({width: 8, height: 8})
    const container = world.add('container', {x: 3, y: 3})
    const unit = world.spawn('poly', {x: 5, y: 5})

    assert.equal(valueText({isobj: true, objval: unit}), 'poly')
    assert.equal(typeName({isobj: true, objval: unit}), 'unit')

    assert.equal(valueText({isobj: true, objval: container}), 'container')
    assert.equal(typeName({isobj: true, objval: container}), 'building')
})
