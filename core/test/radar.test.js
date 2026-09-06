/**
 * Поиск целей и работа с предметами: `radar`, `uradar`, `ulocate`, добыча и передача.
 *
 * Всё это в игре завязано на кеш и таймеры — цель радара обновляется не каждый тик,
 * а передача предметов ждёт полторы секунды. Без этих задержек программы вели бы себя
 * заметно иначе, поэтому они проверяются здесь наравне с самим поиском.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

import {World} from '../src/world.js'
import {Processor} from '../src/vm.js'
import {createContent} from '../src/content.js'
import {UNIT_SPECS, unconv} from '../src/unit.js'
import {Diagnostic} from '../src/errors.js'

const logicIds = JSON.parse(readFileSync(new URL('../data/logic-ids.json', import.meta.url), 'utf8'))
const content = createContent(logicIds)

/**
 * Мир с процессором посреди поля. Процессор — он же источник для `radar`: в игре он `Ranged`,
 * и `@this` радару годится.
 *
 * `links` ставит здания и подключает их: без связи имя вроде `container1` останется обычной
 * переменной, ровно как в игре.
 */
function setup(code, {width = 40, height = 40, floor = 'stone', links = []} = {}) {
    const world = new World({width, height, content, floor})
    const linked = links.map(({type, x, y}) => world.add(type, {x, y}))
    const building = world.add('logic-processor', {x: 10, y: 10})

    const processor = new Processor(code, {
        world, content, globals: content.globals, building,
        team: 1, ipt: building.spec.ipt, links: linked
    })

    building.processor = processor
    world.addProcessor(processor)
    return {world, processor, building, linked}
}

test('radar находит ближайшего врага в дальности связи', () => {
    const {world, processor} = setup('radar enemy any any distance @this 1 result')

    const near = world.spawn('dagger', {x: 12, y: 10, team: 2})
    world.spawn('dagger', {x: 18, y: 10, team: 2})

    processor.run(1)
    assert.equal(processor.get('result').obj()?.id, near.id)
})

test('radar не видит своих, когда просят врага, и наоборот', () => {
    const {world, processor} = setup('radar enemy any any distance @this 1 result')
    world.spawn('dagger', {x: 12, y: 10, team: 1})

    processor.run(1)
    assert.equal(processor.get('result').obj(), null)
})

test('порядок сортировки переворачивает выбор', () => {
    const {world, processor} = setup('radar enemy any any distance @this 0 result')

    world.spawn('dagger', {x: 12, y: 10, team: 2})
    const far = world.spawn('dagger', {x: 18, y: 10, team: 2})

    processor.run(1)
    assert.equal(processor.get('result').obj()?.id, far.id, 'при нулевом порядке дальний ближе')
})

test('radar отбирает по трём условиям сразу', () => {
    const {world, processor} = setup('radar enemy ground any distance @this 1 result')

    world.spawn('flare', {x: 11, y: 10, team: 2})
    const ground = world.spawn('dagger', {x: 14, y: 10, team: 2})

    processor.run(1)
    assert.equal(processor.get('result').obj()?.id, ground.id, 'летающий прошёл фильтр земли')
})

test('radar держит найденное 30 тиков, а не ищет каждый раз', () => {
    const {world, processor} = setup('radar enemy any any distance @this 1 result')
    const first = world.spawn('dagger', {x: 12, y: 10, team: 2})

    processor.run(1)
    assert.equal(processor.get('result').obj()?.id, first.id)

    // Ближе появился другой, но радар про него пока не знает
    const closer = world.spawn('dagger', {x: 10, y: 11, team: 2})
    world.steps(5)
    assert.equal(processor.get('result').obj()?.id, first.id)

    world.steps(30)
    assert.equal(processor.get('result').obj()?.id, closer.id)
})

test('radar не берёт цель дальше дальности связи', () => {
    // У логического процессора это 176 мировых единиц, то есть 22 тайла
    const {world, processor} = setup('radar enemy any any distance @this 1 result')
    world.spawn('dagger', {x: 35, y: 10, team: 2})

    processor.run(1)
    assert.equal(processor.get('result').obj(), null)
})

test('uradar смотрит с юнита и не находит сам себя', () => {
    const {world, processor} = setup([
        'ubind @poly',
        'uradar enemy any any distance 0 1 result'
    ].join('\n'))

    const mine = world.spawn('poly', {x: 10, y: 10})
    const enemy = world.spawn('dagger', {x: 12, y: 10, team: 2})

    processor.run(2)
    assert.notEqual(processor.get('result').obj()?.id, mine.id)
    assert.equal(processor.get('result').obj()?.id, enemy.id)
})

test('ulocate находит ближайшую руду, а прочие режимы дают диагностику', () => {
    const {world, processor} = setup([
        'ubind @poly',
        'ulocate ore core true @copper x y found building'
    ].join('\n'))

    world.spawn('poly', {x: 10, y: 10})
    world.setOverlay(14, 10, 'ore-copper')
    world.setOverlay(20, 20, 'ore-copper')

    processor.run(2)

    assert.equal(processor.num('found'), 1)
    assert.equal(processor.num('x'), 14)
    assert.equal(processor.num('y'), 10)

    const {processor: other} = setup('ulocate building core true @copper x y found b')
    const complaint = other.diagnostics.find(item => item.code === Diagnostic.NOT_IMPLEMENTED)
    assert.equal(complaint?.instruction, 'ulocate building')
})

test('юнит добывает руду по твёрдости и не быстрее срока', () => {
    const {world, processor} = setup([
        'ubind @poly',
        'ucontrol mine 12 10 0 0 0'
    ].join('\n'))

    const poly = world.spawn('poly', {x: 12, y: 10})
    world.setOverlay(12, 10, 'ore-copper')

    world.steps(4)
    assert.deepEqual([poly.mineTile.x, poly.mineTile.y], [12, 10])

    // 50 тиков плюс твёрдость меди (1) на 15, делённые на скорость добычи поли
    const needed = (50 + 15) / UNIT_SPECS.poly.mineSpeed
    world.steps(Math.floor(needed) - 6)
    assert.equal(poly.itemAmount, 0, 'выдал руду раньше срока')

    world.steps(8)
    assert.equal(poly.itemAmount, 1)
    assert.equal(poly.item, 'copper')
})

test('кинжал не добывает вовсе, а титан не по зубам поли', () => {
    const world = new World({width: 20, height: 20, content})

    const dagger = world.spawn('dagger', {x: 5, y: 5})
    const poly = world.spawn('poly', {x: 5, y: 5})

    world.setOverlay(5, 5, 'ore-titanium')

    // mineTier у кинжала -1: он не шахтёр вовсе
    assert.equal(dagger.canMine('copper'), false)

    // У поли уровень 2, у титана твёрдость 3
    assert.equal(poly.canMine('copper'), true)
    assert.equal(poly.canMine('titanium'), false)
    assert.equal(poly.validMine({x: 5, y: 5}), false)
})

test('ucontrol itemDrop кладёт груз в здание и ждёт полторы секунды', () => {
    const {world, linked} = setup([
        'ubind @poly',
        'ucontrol itemDrop container1 10 0 0 0'
    ].join('\n'), {links: [{type: 'container', x: 10, y: 12}]})

    const [container] = linked
    const poly = world.spawn('poly', {x: 10, y: 12})
    poly.addItem('copper', 10)

    world.steps(4)

    assert.equal(container.items.get('copper'), 10)
    assert.equal(poly.itemAmount, 0)

    // Повтор до истечения задержки ничего не делает
    poly.addItem('copper', 5)
    world.steps(30)
    assert.equal(container.items.get('copper'), 10)

    world.steps(70)
    assert.equal(container.items.get('copper'), 15)
})

test('ucontrol itemTake берёт из здания не больше, чем влезает', () => {
    const {world, linked} = setup([
        'ubind @poly',
        'ucontrol itemTake container1 @copper 999 0 0'
    ].join('\n'), {links: [{type: 'container', x: 10, y: 12}]})

    const [container] = linked
    const poly = world.spawn('poly', {x: 10, y: 12})
    container.handleStack('copper', 200)

    world.steps(4)

    // Вместимость поли — 30, больше он не унесёт
    assert.equal(poly.itemAmount, UNIT_SPECS.poly.itemCapacity)
    assert.equal(container.items.get('copper'), 200 - UNIT_SPECS.poly.itemCapacity)
})

test('передача не работает через всю карту', () => {
    const {world, linked} = setup([
        'ubind @poly',
        'ucontrol itemDrop container1 10 0 0 0'
    ].join('\n'))

    const container = world.add('container', {x: 30, y: 30})
    const poly = world.spawn('poly', {x: 10, y: 10})
    poly.addItem('copper', 10)

    world.steps(10)
    assert.equal(container.items.get('copper'), undefined)
})

test('sensor читает предметы здания по имени контента', () => {
    const {processor, linked} = setup(
        'sensor медь container1 @copper\nsensor всего container1 @totalItems',
        {links: [{type: 'container', x: 10, y: 12}]})

    const [container] = linked
    container.handleStack('copper', 7)
    container.handleStack('lead', 3)

    processor.run(2)

    assert.equal(processor.num('медь'), 7)
    assert.equal(processor.num('всего'), 10)
})

test('sensor работает на самом типе, а не только на его воплощении', () => {
    const {processor} = setup([
        'sensor hp @dagger @health',
        'sensor size @dagger @size',
        'sensor cap @container @itemCapacity',
        'sensor id @copper @id'
    ].join('\n'))

    processor.run(4)

    assert.equal(processor.num('hp'), UNIT_SPECS.dagger.health)
    assert.equal(processor.num('size'), UNIT_SPECS.dagger.hitSize / 8)
    assert.equal(processor.num('cap'), 300)
    assert.equal(processor.num('id'), content.types.item.findIndex(item => item.name === 'copper'))
})

test('@color отдаёт упакованный цвет, и unpackcolor разбирает его обратно', () => {
    const {world, processor} = setup([
        'ubind @poly',
        'sensor цвет @unit @color',
        'unpackcolor r g b a цвет',
        'sensor медь @copper @color',
        'unpackcolor mr mg mb ma медь'
    ].join('\n'))

    world.spawn('poly', {x: 10, y: 10})
    processor.run(5)

    // Команда sharded это #ffd37f, и прозрачность у цвета команды всегда полная
    assert.equal(Math.round(processor.num('r') * 255), 0xff)
    assert.equal(Math.round(processor.num('g') * 255), 0xd3)
    assert.equal(Math.round(processor.num('b') * 255), 0x7f)
    assert.equal(processor.num('a'), 1)

    // У предмета цвет свой: медь это #d99d73
    assert.equal(Math.round(processor.num('mr') * 255), 0xd9)
    assert.equal(Math.round(processor.num('mg') * 255), 0x9d)
    assert.equal(Math.round(processor.num('mb') * 255), 0x73)
})

test('@color здания — цвет его команды, а не блока', () => {
    const {processor, linked} = setup(['sensor цвет container1 @color', 'unpackcolor r g b a цвет'].join('\n'),
        {links: [{type: 'container', x: 10, y: 12}]})

    linked[0].team = 2

    processor.run(2)

    // crux это #f25555
    assert.equal(Math.round(processor.num('r') * 255), 0xf2)
    assert.equal(Math.round(processor.num('g') * 255), 0x55)
})

test('процессор мира ставит блоки, красит пол и сыплет руду', () => {
    const world = new World({width: 20, height: 20, content, floor: 'stone'})
    const building = world.add('world-processor', {x: 1, y: 1})

    const processor = new Processor([
        'setblock floor @sand-floor 5 5 @sharded 0',
        'setblock ore @ore-copper 5 5 @sharded 0',
        'setblock block @router 8 8 @sharded 0',
        'getblock floor пол 5 5',
        'getblock ore руда 5 5',
        'getblock block блок 8 8'
    ].join('\n'), {world, content, globals: content.globals, building, team: 1, ipt: 8})

    building.processor = processor
    world.addProcessor(processor)
    processor.run(6)

    assert.equal(world.floorAt(5, 5), 'sand-floor')
    assert.equal(world.overlayAt(5, 5), 'ore-copper')
    assert.equal(world.at(8, 8)?.type, 'router')

    assert.equal(processor.get('пол').obj().name, 'sand-floor')
    assert.equal(processor.get('руда').obj().name, 'ore-copper')
    assert.equal(processor.get('блок').obj().name, 'router')
})

test('обычному процессору инструкции мира не подчиняются', () => {
    const world = new World({width: 20, height: 20, content, floor: 'stone'})
    const building = world.add('micro-processor', {x: 1, y: 1})

    const processor = new Processor('setblock block @router 8 8 @sharded 0', {
        world, content, globals: content.globals, building, team: 1, ipt: 2
    })

    building.processor = processor
    world.addProcessor(processor)
    processor.run(2)

    // В игре каждая инструкция мира начинается с проверки privileged
    assert.equal(world.at(8, 8), undefined)
})

test('флаги целей поднимаются и читаются', () => {
    const world = new World({width: 10, height: 10, content})
    const building = world.add('world-processor', {x: 1, y: 1})

    const processor = new Processor([
        'setflag "готово" 1',
        'getflag есть "готово"',
        'getflag нету "другое"'
    ].join('\n'), {world, content, globals: content.globals, building, team: 1, ipt: 8})

    building.processor = processor
    world.addProcessor(processor)
    processor.run(3)

    assert.equal(processor.num('есть'), 1)
    assert.equal(processor.num('нету'), 0)

    // Флаг лежит в правилах мира: оттуда его берут цели карты
    assert.equal(world.rules.flag('готово'), true)
})

test('setrule переводит секунды в тики, а тайлы в мировые единицы', () => {
    const world = new World({width: 10, height: 10, content})
    const building = world.add('world-processor', {x: 1, y: 1})

    const processor = new Processor([
        'setrule waveSpacing 30 0 0 0 0',
        'setrule dropZoneRadius 10 0 0 0 0',
        'setrule waves true 0 0 0 0',
        'setrule unitCap 40 0 0 0 0',
        'setrule mapArea 0 1 2 3 4'
    ].join('\n'), {world, content, globals: content.globals, building, team: 1, ipt: 8})

    building.processor = processor
    world.addProcessor(processor)
    processor.run(5)

    assert.equal(world.rules.get('waveSpacing'), 30 * 60)
    assert.equal(world.rules.get('dropZoneRadius'), 10 * 8)
    assert.equal(world.rules.get('waves'), true)
    assert.equal(world.rules.get('unitCap'), 40)
    assert.deepEqual(world.rules.mapArea, [1, 2, 3, 4])
})

test('spawn создаёт юнита, а setrate меняет скорость процессора', () => {
    const world = new World({width: 20, height: 20, content})
    const building = world.add('world-processor', {x: 1, y: 1})

    const processor = new Processor([
        'spawn @dagger 5 5 90 @sharded новый 0',
        'setrate 25'
    ].join('\n'), {world, content, globals: content.globals, building, team: 1, ipt: 8})

    building.processor = processor
    world.addProcessor(processor)
    processor.run(2)

    assert.equal(world.units.length, 1)
    assert.equal(processor.get('новый').obj()?.type, 'dagger')
    assert.equal(processor.ipt, 25)
})

test('fetch перебирает юнитов и здания команды по порядку появления', () => {
    const world = new World({width: 20, height: 20, content})
    const building = world.add('world-processor', {x: 1, y: 1})

    const processor = new Processor([
        'fetch unitCount сколько @sharded 0 @poly',
        'fetch unit первый @sharded 0 @poly',
        'fetch unit второй @sharded 1 @poly',
        'fetch unit мимо @sharded 5 @poly',
        'fetch buildCount зданий @sharded 0 @container',
        'fetch coreCount ядер @sharded 0 @container'
    ].join('\n'), {world, content, globals: content.globals, building, team: 1, ipt: 8})

    building.processor = processor
    world.addProcessor(processor)

    const first = world.spawn('poly', {x: 3, y: 3})
    const second = world.spawn('poly', {x: 5, y: 5})
    world.spawn('mono', {x: 7, y: 7})
    world.add('container', {x: 9, y: 9})

    processor.run(6)

    // Считается только запрошенный тип: моно в счёт поли не идёт
    assert.equal(processor.num('сколько'), 2)
    assert.equal(processor.get('первый').obj()?.id, first.id)
    assert.equal(processor.get('второй').obj()?.id, second.id)
    assert.equal(processor.get('мимо').obj(), null)

    assert.equal(processor.num('зданий'), 1)
    assert.equal(processor.num('ядер'), 0)
})

test('setprop правит свойства напрямую, мимо всякой физики', () => {
    const world = new World({width: 20, height: 20, content})
    const building = world.add('world-processor', {x: 1, y: 1})
    const container = world.add('container', {x: 9, y: 9})

    const processor = new Processor([
        'fetch unit цель @sharded 0 @poly',
        'setprop @x цель 12',
        'setprop @health цель 50',
        'setprop @flag цель 7',
        'setprop @copper container1 25'
    ].join('\n'), {
        world, content, globals: content.globals, building, team: 1, ipt: 8, links: [container]
    })

    building.processor = processor
    world.addProcessor(processor)

    const poly = world.spawn('poly', {x: 3, y: 3})
    processor.run(5)

    assert.equal(poly.x, 12 * 8, 'координата приходит в тайлах')
    assert.equal(poly.health, 50)
    assert.equal(poly.flag, 7)
    assert.equal(container.items.get('copper'), 25)
})

test('localeprint берёт строку из словаря карты, а без словаря молчит', () => {
    const world = new World({width: 10, height: 10, content})
    const building = world.add('world-processor', {x: 1, y: 1})

    const processor = new Processor([
        'localeprint "привет"',
        'localeprint "нет-такого"'
    ].join('\n'), {world, content, globals: content.globals, building, team: 1, ipt: 8})

    building.processor = processor
    world.addProcessor(processor)

    world.locales.set('привет', 'Здравствуйте')
    processor.run(2)

    assert.equal(processor.textBuffer, 'Здравствуйте')
})
