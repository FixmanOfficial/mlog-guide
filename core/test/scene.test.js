/**
 * Сборка сцены из описания. Проверяется то, ради чего описание и заводилось: карту рисуют
 * строками, блоки ссылаются друг на друга по именам связей, а цели и метки собираются
 * теми же классами, что и в игре.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

import {buildScene} from '../src/scene.js'
import {createContent} from '../src/content.js'

const logicIds = JSON.parse(readFileSync(new URL('../data/logic-ids.json', import.meta.url), 'utf8'))
const content = createContent(logicIds)

const legend = {
    '.': {floor: 'darksand'},
    '#': {floor: 'stone'},
    'o': {floor: 'darksand', ore: 'ore-copper'},
    'W': {floor: 'stone', wall: 'stone-wall'}
}

test('местность читается сверху вниз, как её видно на экране', () => {
    const {world} = buildScene({
        width: 4, height: 3,
        terrain: {legend, rows: ['####', '..o.', 'W...']}
    }, {content})

    // Первая строка описания — верхний ряд карты, то есть y = height - 1
    assert.equal(world.floorAt(0, 2), 'stone')
    assert.equal(world.floorAt(0, 0), 'stone')
    assert.equal(world.wallAt(0, 0), 'stone-wall')

    assert.equal(world.overlayAt(2, 1), 'ore-copper')
    assert.equal(world.floorAt(2, 1), 'darksand')
})

test('блоки получают запас, юниты команду, процессоры — связи по именам', () => {
    const {world, processors} = buildScene({
        width: 10, height: 10,
        blocks: [
            {type: 'core-shard', x: 2, y: 2, items: {copper: 300}},
            {type: 'memory-cell', x: 5, y: 5},
            {type: 'micro-processor', x: 7, y: 7}
        ],
        units: [{type: 'poly', x: 3, y: 3, team: 2}],
        processors: [{at: [7, 7], links: ['cell1'], program: 'set x 1'}]
    }, {content})

    assert.equal(world.core(1).items.get('copper'), 300)
    assert.equal(world.units[0].team, 2)

    assert.equal(processors.length, 1)
    assert.equal(processors[0].building.type, 'micro-processor')
    assert.equal(processors[0].links[0].name, 'cell1')
    assert.equal(processors[0].program, 'set x 1')
})

test('цели собираются по виду, вместе с текстом и метками', () => {
    const {world} = buildScene({
        width: 10, height: 10,
        objectives: [
            {kind: 'unitCount', unit: 'poly', count: 2},
            {
                kind: 'flag', flag: 'склад', text: '[accent]Натаскать',
                markers: [{type: 'shape', pos: [4, 4], radius: 14, shape: 6, color: '#84f491'}]
            }
        ]
    }, {content})

    const [units, flag] = world.objectives.all

    assert.equal(units.kind, 'unitcount')
    assert.equal(flag.kind, 'flag')
    assert.equal(flag.text, '[accent]Натаскать')

    const marker = flag.markers[0]
    assert.deepEqual([marker.props.x, marker.props.y], [32, 32], 'метка ставится в тайлах')
    assert.equal(marker.props.sides, 6)
    assert.equal(marker.props.color, '#84f491')
})

test('ссылка на несуществующую связь — ошибка, а не тихая пустота', () => {
    assert.throws(() => buildScene({
        width: 5, height: 5,
        blocks: [{type: 'micro-processor', x: 1, y: 1}],
        processors: [{at: [1, 1], links: ['cell1']}]
    }, {content}), /Нет блока со связью cell1/)
})

test('местность описывается и картинкой, и прямоугольниками', () => {
    const picture = buildScene({
        width: 6, height: 4,
        terrain: {
            legend: {'.': {floor: 'sand'}, 'о': {floor: 'sand', ore: 'ore-copper'}},
            rows: [
                '......',
                '..оо..',
                '......',
                '......'
            ]
        }
    }, {content}).world

    // Первая строка описания — верхний ряд карты
    assert.equal(picture.overlayAt(2, 2), 'ore-copper')
    assert.equal(picture.overlayAt(2, 0), null)

    const rects = buildScene({
        width: 8, height: 6,
        terrain: [{floor: 'sand', ore: 'ore-copper', rect: [3, 2, 2, 3]}]
    }, {content}).world

    assert.equal(rects.overlayAt(3, 2), 'ore-copper')
    assert.equal(rects.overlayAt(4, 4), 'ore-copper')
    assert.equal(rects.overlayAt(5, 2), null, 'ширина считается от левого края, а не до него')
    assert.equal(rects.overlayAt(3, 5), null)
})

test('словарь карты приходит из описания сцены', () => {
    // `localeprint` читает его же: без словаря инструкция молчит, а не печатает ключ
    const {world} = buildScene({
        width: 6, height: 6,
        locales: {'подсказка': 'Постройте бур'}
    }, {content})

    assert.equal(world.locales.get('подсказка'), 'Постройте бур')
})
