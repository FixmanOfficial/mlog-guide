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
import {UNIT_SPECS, unconv, LogicAI} from '../src/unit.js'
import {Diagnostic} from '../src/errors.js'
import {damage as explode} from '../src/damage.js'
import {LABEL_OUTLINE} from '../src/markers.js'
import {packColorHex, unpackColorBits} from '../src/arc.js'

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

test('ulocate находит ближайшую руду, а режим spawn даёт диагностику', () => {
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

    // Точек появления волн в песочнице нет, и сборщик говорит об этом вслух
    const {processor: other} = setup('ulocate spawn core true @copper x y found b')
    const complaint = other.diagnostics.find(item => item.code === Diagnostic.NOT_IMPLEMENTED)
    assert.equal(complaint?.instruction, 'ulocate spawn')
})

test('ulocate building ищет по метке блока и различает свои и чужие', () => {
    const {world, processor} = setup([
        'ubind @poly',
        'ulocate building turret true @copper x y found цель'
    ].join('\n'))

    world.spawn('poly', {x: 10, y: 10})

    // Своя турель ближе, но ищем вражескую: `enemy` = true
    world.place('duo', 12, 10)
    const enemy = world.place('duo', 18, 10, {team: 2})

    processor.run(2)

    assert.equal(processor.num('found'), 1)
    assert.equal(processor.get('цель').obj(), enemy)

    // Блок с чётной стороной стоит углом на тайле, и центр приходится на половинку
    assert.equal(processor.num('x'), enemy.x + enemy.offset)
})

test('ulocate building со своей стороны берёт только свои здания', () => {
    const {world, processor} = setup([
        'ubind @poly',
        'ulocate building turret false @copper x y found цель'
    ].join('\n'))

    world.spawn('poly', {x: 10, y: 10})
    const own = world.place('duo', 14, 10)
    world.place('duo', 16, 10, {team: 2})

    processor.run(2)
    assert.equal(processor.get('цель').obj(), own)
})

test('ulocate damaged находит подбитое здание своей команды', () => {
    const {world, processor} = setup([
        'ubind @poly',
        'ulocate damaged core true @copper x y found цель'
    ].join('\n'))

    world.spawn('poly', {x: 10, y: 10})
    world.place('duo', 12, 10)
    const hurt = world.place('duo', 16, 10)

    processor.run(2)
    assert.equal(processor.num('found'), 0, 'целое здание подбитым не считается')

    hurt.health = hurt.maxHealth / 2
    world.steps(45)
    processor.run(2)

    assert.equal(processor.num('found'), 1)
    assert.equal(processor.get('цель').obj(), hurt)
})

test('ulocate держит ответ до конца окна и берёт юнита под управление', () => {
    const {world, processor} = setup([
        'ubind @poly',
        'ulocate building turret true @copper x y found цель'
    ].join('\n'))

    const poly = world.spawn('poly', {x: 10, y: 10})
    const first = world.place('duo', 18, 10, {team: 2})

    world.steps(3)
    processor.run(2)
    assert.equal(processor.get('цель').obj(), first)

    // Контроллер заводится, как от команды: LExecutor.UnitLocateI зовёт checkLogicAI
    assert.ok(poly.controller instanceof LogicAI)

    // Пока окно контроллера не кончилось, ответ остаётся прежним
    const near = world.place('duo', 12, 10, {team: 2})
    processor.run(2)
    assert.equal(processor.get('цель').obj(), first)

    // Окно живёт 40 тиков, и после него инструкция ищет заново
    world.steps(45)
    processor.run(2)
    assert.equal(processor.get('цель').obj(), near)
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

test('setblock усекает дробные координаты, а не округляет их', () => {
    const world = new World({width: 20, height: 20, content, floor: 'stone'})
    const building = world.add('world-processor', {x: 1, y: 1})

    /*
     * До v160.2 координаты проходили через `Mathf.round`, и блок с 8.6 вставал на девятый
     * тайл. В v160.2 остался `numi()` — приведение к int, то есть усечение к нулю.
     * LExecutor.SetBlockI, v160.2
     */
    const processor = new Processor([
        'setblock block @router 8.6 8.6 @sharded 0',
        'setblock floor @sand-floor 3.9 2.2 @sharded 0'
    ].join('\n'), {world, content, globals: content.globals, building, team: 1, ipt: 4})

    building.processor = processor
    world.addProcessor(processor)
    processor.run(4)

    assert.equal(world.at(9, 9) ?? null, null)
    assert.equal(world.at(8, 8)?.type, 'router')

    assert.equal(world.floorAt(4, 2), 'stone')
    assert.equal(world.floorAt(3, 2), 'sand-floor')
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

test('правила игры доходят до юнитов: урон, добыча и трение', () => {
    /*
     * `Rules.unitHealth` не поднимает здоровье, а делит урон; `unitMineSpeed` умножает
     * скорость добычи; `dragMultiplier` идёт в трение. Раньше `setrule` эти числа только
     * записывал, и урок про правила нечего было бы показать.
     *
     * Первые два множителя принадлежат команде, а не миру: `Rules.teams`.
     */
    const world = new World({width: 20, height: 20, content})
    const dagger = world.spawn('dagger', {x: 5, y: 5})

    const before = dagger.health
    dagger.damage(20)
    const plain = before - dagger.health

    world.rules.setTeamRule(dagger.team, 'unitHealth', 2)

    const middle = dagger.health
    dagger.damage(20)
    const halved = middle - dagger.health

    assert.ok(Math.abs(halved - plain / 2) < 0.001,
        `при unitHealth 2 тот же удар снимает вдвое меньше: ${plain} против ${halved}`)

    // Добыча: правило умножает скорость, а не сокращает срок
    const world2 = new World({width: 20, height: 20, content})
    world2.setOverlay(5, 5, 'ore-copper')
    world2.rules.setTeamRule(1, 'unitMineSpeed', 4)

    const mono = world2.spawn('mono', {x: 5, y: 5})
    mono.mineTile = {x: 5, y: 5}
    world2.steps(30)

    assert.ok(mono.itemAmount > 0, 'с четырёхкратной добычей руда идёт уже через полсекунды')

    // Трение: правило множит его вместе с полом и эффектами
    const world3 = new World({width: 20, height: 20, content})
    world3.rules.set('dragMultiplier', 3)

    const flare = world3.spawn('flare', {x: 5, y: 5})
    world3.steps(1)

    assert.ok(Math.abs(flare.drag - flare.spec.drag * 3) < 0.0001, flare.drag)
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

test('bullet пускает пулю патроном турели, а обычному процессору не даётся', () => {
    /*
     * `SpawnBulletI`: тип пули берётся у того, кто её обычно пускает. У турели с предметными
     * патронами это `ammoTypes.get(item)` — графит у дуо бьёт на 18.
     */
    const world = new World({width: 24, height: 12, content})
    const privileged = world.add('world-processor', {x: 1, y: 1})
    const target = world.spawn('dagger', {x: 12, y: 6, team: 2})

    const processor = new Processor([
        'bullet пуля @duo @graphite 4 6 0 @sharded null -1 1 1 0 0',
        'stop'
    ].join('\n'), {world, content, globals: content.globals, building: privileged, team: 1, ipt: 8})

    privileged.processor = processor
    world.addProcessor(processor)
    processor.run(4)

    assert.equal(world.bullets.length, 1)

    const before = target.health
    world.steps(200)

    assert.ok(target.health < before, 'пуля долетела и ударила')

    // Обычному процессору инструкция не даётся, как и прочие мировые
    const plain = world.add('micro-processor', {x: 4, y: 4})
    const simple = new Processor([
        'bullet пуля @duo @graphite 4 6 0 @sharded null -1 1 1 0 0',
        'stop'
    ].join('\n'), {world, content, globals: content.globals, building: plain, team: 1})

    plain.processor = simple
    world.addProcessor(simple)
    simple.run(4)

    assert.equal(world.bullets.length, 0)
    assert.equal(simple.get('пуля').obj(), null)
})

test('погода включается и выключается, и обычному процессору она не даётся', () => {
    /*
     * `SetWeatherI` привилегированная, `SenseWeatherI` — нет: видеть погоду может любой
     * процессор, а менять — только мировой.
     */
    const world = new World({width: 12, height: 12, content})
    const privileged = world.add('world-processor', {x: 1, y: 1})

    const worldProcessor = new Processor([
        'weathersense @rain до',
        'weatherset @rain true',
        'weathersense @rain после',
        'weathersense @snowing снег',
        'stop'
    ].join('\n'), {world, content, globals: content.globals, building: privileged, team: 1, ipt: 8})

    privileged.processor = worldProcessor
    world.addProcessor(worldProcessor)
    worldProcessor.run(6)

    assert.equal(worldProcessor.num('до'), 0)
    assert.equal(worldProcessor.num('после'), 1)
    assert.equal(worldProcessor.num('снег'), 0)
    assert.ok(world.weather.has('rain'))

    // Обычному процессору погода не даётся вовсе: обе инструкции привилегированные
    const plain = world.add('micro-processor', {x: 4, y: 4})
    const simple = new Processor([
        'weathersense @rain видно',
        'weatherset @rain false',
        'weathersense @rain всёещё',
        'stop'
    ].join('\n'), {world, content, globals: content.globals, building: plain, team: 1})

    plain.processor = simple
    world.addProcessor(simple)
    simple.run(6)

    assert.equal(simple.get('видно').obj(), null, 'ответа обычный процессор не получает')
    assert.ok(world.weather.has('rain'), 'и выключить погоду он не может')

    // Сброс мира гасит погоду вместе с остальным состоянием
    world.reset()
    assert.equal(world.weather.size, 0)
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

test('query складывает найденное в @queries, а read достаёт по номеру', () => {
    const world = new World({width: 30, height: 30, content})
    const building = world.add('world-processor', {x: 1, y: 1})

    const processor = new Processor([
        'query circle unit @sharded 10 10 5 0',
        'read первый @queries 0',
        'read второй @queries 1',
        'read мимо @queries 9'
    ].join('\n'), {world, content, globals: content.globals, building, team: 1, ipt: 8})

    building.processor = processor
    world.addProcessor(processor)

    const near = world.spawn('poly', {x: 10, y: 10})
    const alsoNear = world.spawn('poly', {x: 12, y: 10})
    world.spawn('poly', {x: 25, y: 25})
    world.spawn('poly', {x: 11, y: 11, team: 2})

    processor.run(4)

    // Радиус в тайлах, чужая команда не в счёт
    assert.equal(processor.get('первый').obj()?.id, near.id)
    assert.equal(processor.get('второй').obj()?.id, alsoNear.id)
    assert.equal(processor.get('мимо').obj(), null)
})

test('query прямоугольником берёт здания любой команды, когда команда не задана', () => {
    const world = new World({width: 30, height: 30, content})
    const building = world.add('world-processor', {x: 1, y: 1})

    const processor = new Processor([
        'query rect building null 10 10 6 6',
        'read первый @queries 0',
        'read второй @queries 1'
    ].join('\n'), {world, content, globals: content.globals, building, team: 1, ipt: 8})

    building.processor = processor
    world.addProcessor(processor)

    const mine = world.add('container', {x: 10, y: 10})
    const enemy = world.add('container', {x: 12, y: 11, team: 2})
    world.add('container', {x: 25, y: 25})

    processor.run(3)

    assert.equal(processor.get('первый').obj(), mine)
    assert.equal(processor.get('второй').obj(), enemy)
})

test('message отдаёт текст миру, а занятому экрану отвечает отказом', () => {
    const world = new World({width: 10, height: 10, content})
    const building = world.add('world-processor', {x: 1, y: 1})

    const processor = new Processor([
        'print "готово"',
        'message announce 3 успех'
    ].join('\n'), {world, content, globals: content.globals, building, team: 1, ipt: 8})

    building.processor = processor
    world.addProcessor(processor)
    processor.run(2)

    assert.equal(world.message.text, 'готово')
    assert.equal(world.message.type, 'announce')
    assert.equal(processor.num('успех'), 1)
    assert.equal(processor.textBuffer, '')

    // Пока прежнее объявление висит, новое не проходит, и буфер остаётся при программе
    processor.reset()
    processor.run(2)

    assert.equal(processor.num('успех'), 0)
    assert.equal(processor.textBuffer, 'готово')

    // Через три секунды место освобождается
    world.tick += 3 * 60
    processor.run(2)
    assert.equal(processor.num('успех'), 1)
})

test('@wait в поле ответа задерживает message, а своя переменная — нет', () => {
    /*
     * FlushMessageI: приёмник по умолчанию — `@wait`, и занятый экран тогда не отдаёт ноль,
     * а откатывает счётчик и уступает тик. Так инструкция вела себя до появления поля.
     */
    const world = new World({width: 10, height: 10, content})
    const building = world.add('world-processor', {x: 1, y: 1})

    const processor = new Processor([
        'print "первое"',
        'message announce 3 @wait',
        'set дошли 1'
    ].join('\n'), {world, content, globals: content.globals, building, team: 1, ipt: 8})

    building.processor = processor
    world.addProcessor(processor)
    processor.run(3)

    assert.equal(world.message.text, 'первое')
    assert.equal(processor.num('дошли'), 1)

    // Экран занят: программа встаёт на этой строке, а не бежит дальше с нулём
    processor.reset()
    processor.run(3)

    assert.equal(processor.num('дошли'), 0, 'после занятого экрана строка не пройдена')
    assert.equal(processor.textBuffer, 'первое', 'буфер остался при программе')

    // Место освободилось — программа идёт дальше сама
    world.tick += 3 * 60
    processor.run(3)
    assert.equal(processor.num('дошли'), 1)
})

test('message mission пишет задачу в правила и никого не ждёт', () => {
    const world = new World({width: 10, height: 10, content})
    const building = world.add('world-processor', {x: 1, y: 1})

    const processor = new Processor([
        'print "добудь меди"',
        'message mission 1 успех'
    ].join('\n'), {world, content, globals: content.globals, building, team: 1, ipt: 8})

    building.processor = processor
    world.addProcessor(processor)
    processor.run(2)

    assert.equal(world.rules.get('mission'), 'добудь меди')
    assert.equal(world.message, null)
})

test('броня вычитается, но десятая часть урона проходит всегда', () => {
    const world = new World({width: 10, height: 10, content})
    const scepter = world.spawn('scepter', {x: 5, y: 5})

    const before = scepter.health
    scepter.damage(10)

    // У скипетра броня 10: обычным вычитанием вышел бы ноль, но проходит 0.1 от урона
    assert.equal(before - scepter.health, 1)
})

test('взрыв убивает юнитов и сносит здания, а мёртвые уходят из мира', () => {
    const world = new World({width: 30, height: 30, content})
    const building = world.add('world-processor', {x: 1, y: 1})

    const processor = new Processor(
        'explosion @crux 10 10 3 1000 true true true false',
        {world, content, globals: content.globals, building, team: 1, ipt: 8})

    building.processor = processor
    world.addProcessor(processor)

    const near = world.spawn('dagger', {x: 10, y: 10})
    const far = world.spawn('dagger', {x: 25, y: 25})
    const container = world.add('container', {x: 11, y: 10})

    processor.run(1)

    assert.equal(near.dead, true, 'ближний выжил')
    assert.equal(world.units.includes(near), false, 'мёртвый остался в мире')
    assert.equal(far.dead, false, 'дальнему досталось')

    assert.equal(container.health <= 0, true)
    assert.equal(world.buildings.includes(container), false)
})

test('взрыв щадит свою команду и не трогает воздух, когда его не просили', () => {
    const world = new World({width: 30, height: 30, content})
    const building = world.add('world-processor', {x: 1, y: 1})

    const processor = new Processor(
        'explosion @sharded 10 10 3 1000 false true false false',
        {world, content, globals: content.globals, building, team: 1, ipt: 8})

    building.processor = processor
    world.addProcessor(processor)

    const mine = world.spawn('dagger', {x: 10, y: 10})
    const flying = world.spawn('flare', {x: 10, y: 10, team: 2})
    const enemy = world.spawn('dagger', {x: 10, y: 10, team: 2})

    processor.run(1)

    assert.equal(mine.dead, false, 'досталось своим')
    assert.equal(flying.dead, false, 'воздух не просили')
    assert.equal(enemy.dead, true)
})

test('стена прикрывает то, что за ней: взрыв идёт лучами', () => {
    const world = new World({width: 40, height: 40, content})

    // Плотный ряд стен между взрывом и дальним зданием
    for (let y = 8; y <= 12; y++) world.add('titanium-wall', {x: 12, y})

    const behind = world.add('container', {x: 14, y: 10})
    const damage = 300

    explode(world, {team: 2, x: 10 * 8, y: 10 * 8, radius: 6 * 8, amount: damage})

    // Стене досталось, а тому, что за ней, — уже нет: луч погас
    assert.ok(world.at(12, 10).health < world.at(12, 10).maxHealth, 'стена цела')
    assert.equal(behind.health, behind.maxHealth, 'за стеной не должно достаться')
})

test('эффект состояния держится по времени и правит скорость', () => {
    const world = new World({width: 20, height: 20, content})
    const building = world.add('world-processor', {x: 1, y: 1})

    // `stop` после наложения: иначе процессор вешал бы эффект заново каждый круг
    const processor = new Processor([
        'fetch unit цель @sharded 0 @dagger',
        // С v160 эффект пишется константой контента, а не именем: `@status-freezing`
        'status false @status-freezing цель 2',
        'stop'
    ].join('\n'), {world, content, globals: content.globals, building, team: 1, ipt: 8})

    building.processor = processor
    world.addProcessor(processor)

    const dagger = world.spawn('dagger', {x: 5, y: 5})
    const normal = dagger.speed()

    processor.run(3)
    world.step()

    // freezing: скорость 0.6 от обычной
    assert.ok(Math.abs(dagger.speed() - normal * 0.6) < 1e-6, `скорость ${dagger.speed()}`)
    assert.equal(dagger.hasEffect('freezing'), true)

    // Две секунды прошли — эффект спал
    world.steps(2 * 60)
    assert.equal(dagger.hasEffect('freezing'), false)
    assert.equal(dagger.speed(), normal)
})

test('горение отнимает здоровье каждый тик, а overdrive лечит', () => {
    const world = new World({width: 20, height: 20, content})

    const burning = world.spawn('dagger', {x: 5, y: 5})
    const healing = world.spawn('dagger', {x: 7, y: 7})

    burning.apply('burning', 60)
    healing.health = 100
    healing.apply('overdrive', 60)

    world.steps(60)

    // damage у горения 0.167 в тик; за секунду выходит около десяти
    assert.ok(burning.health < burning.maxHealth - 9, `здоровье ${burning.health}`)
    assert.ok(healing.health > 100, 'overdrive не лечит')
})

test('status clear снимает эффект, а повторное наложение продлевает', () => {
    const world = new World({width: 20, height: 20, content})
    const dagger = world.spawn('dagger', {x: 5, y: 5})

    dagger.apply('wet', 100)
    world.steps(50)

    // Осталось меньше, но новое наложение берёт большее из двух, а не складывает
    dagger.apply('wet', 80)
    assert.equal(dagger.statuses.get('wet'), 80)

    dagger.unapply('wet')
    assert.equal(dagger.hasEffect('wet'), false)
})

test('makemarker заводит метку, setmarker её правит, а чужое свойство не трогает', () => {
    const world = new World({width: 20, height: 20, content})
    const building = world.add('world-processor', {x: 1, y: 1})

    const processor = new Processor([
        'makemarker shape 1 10 12 true',
        'setmarker radius 1 4 0 0',
        'setmarker color 1 %ff0000 0 0',
        'makemarker text 2 5 5 true',
        'setmarker radius 2 9 0 0',
        'print "подпись"',
        'setmarker flushText 2 0 0 0'
    ].join('\n'), {world, content, globals: content.globals, building, team: 1, ipt: 8})

    building.processor = processor
    world.addProcessor(processor)
    processor.run(7)

    const shape = world.markers.get(1)
    assert.equal(shape.type, 'shape')

    // Координаты приходят в тайлах и хранятся в мировых единицах
    assert.deepEqual([shape.props.x, shape.props.y], [80, 96])
    assert.equal(shape.props.radius, 4)
    assert.equal(shape.props.color, '#ff0000')

    // У подписи радиуса нет вовсе: свойство чужое, и `control` его не понимает
    const text = world.markers.get(2)
    assert.equal(text.props.radius, undefined)
    assert.equal(text.props.text, 'подпись')
    assert.equal(processor.textBuffer, '', 'flushText не вычерпал буфер')
})

test('пустая переменная в setmarker означает «не трогай»', () => {
    const world = new World({width: 20, height: 20, content})
    const building = world.add('world-processor', {x: 1, y: 1})

    const processor = new Processor([
        'makemarker point 1 10 10 true',
        'setmarker pos 1 15 пусто 0'
    ].join('\n'), {world, content, globals: content.globals, building, team: 1, ipt: 8})

    building.processor = processor
    world.addProcessor(processor)
    processor.run(2)

    const marker = world.markers.get(1)

    // Задали только x, y осталось прежним
    assert.equal(marker.props.x, 15 * 8)
    assert.equal(marker.props.y, 10 * 8)
})

test('makemarker без replace не перезаписывает занятый номер, setmarker remove убирает', () => {
    const world = new World({width: 20, height: 20, content})
    const building = world.add('world-processor', {x: 1, y: 1})

    const processor = new Processor([
        'makemarker point 1 10 10 true',
        'makemarker shape 1 3 3 false',
        'setmarker remove 5 0 0 0'
    ].join('\n'), {world, content, globals: content.globals, building, team: 1, ipt: 8})

    building.processor = processor
    world.addProcessor(processor)
    processor.run(3)

    assert.equal(world.markers.get(1).type, 'point', 'метку перезаписали без спроса')
    assert.equal(world.markers.size, 1)

    processor.reset()
    world.markers.remove(1)
    assert.equal(world.markers.get(1), null)
})

test('метки линии двигаются по номеру точки', () => {
    const world = new World({width: 20, height: 20, content})
    const building = world.add('world-processor', {x: 1, y: 1})

    const processor = new Processor([
        'makemarker line 1 2 2 true',
        'setmarker posi 1 1 9 9'
    ].join('\n'), {world, content, globals: content.globals, building, team: 1, ipt: 8})

    building.processor = processor
    world.addProcessor(processor)
    processor.run(2)

    const line = world.markers.get(1)
    assert.deepEqual([line.props.x, line.props.y], [16, 16])
    assert.deepEqual([line.props.endX, line.props.endY], [72, 72])
})

test('у shape заняты все три параметра: стороны, заливка, обводка', () => {
    const world = new World({width: 20, height: 20, content})
    const building = world.add('world-processor', {x: 1, y: 1})

    const processor = new Processor([
        'makemarker shape 1 5 5 true',
        'setmarker shape 1 6 1 0',
        'setmarker arc 1 90 270'
    ].join('\n'), {world, content, globals: content.globals, building, team: 1, ipt: 8})

    building.processor = processor
    world.addProcessor(processor)
    processor.run(3)

    const shape = world.markers.get(1)

    assert.equal(shape.props.sides, 6)
    assert.equal(shape.props.fill, true)
    assert.equal(shape.props.outline, false, 'третий параметр shape гасит обводку')
    assert.deepEqual([shape.props.startAngle, shape.props.endAngle], [90, 270])
})

test('у линии два цвета: color красит оба конца, colori — по одному', () => {
    const world = new World({width: 20, height: 20, content})
    const building = world.add('world-processor', {x: 1, y: 1})

    const processor = new Processor([
        'makemarker line 1 1 1 true',
        'setmarker color 1 %00ff00 0 0',
        'setmarker colori 1 1 %0000ff'
    ].join('\n'), {world, content, globals: content.globals, building, team: 1, ipt: 8})

    building.processor = processor
    world.addProcessor(processor)
    processor.run(3)

    const line = world.markers.get(1)

    assert.equal(line.props.color1, '#00ff00')
    assert.equal(line.props.color2, '#0000ff')
})

test('подпись собирает флаги подложки и обводки в одно число', () => {
    const world = new World({width: 20, height: 20, content})
    const building = world.add('world-processor', {x: 1, y: 1})

    const processor = new Processor([
        'makemarker text 1 5 5 true',
        'setmarker labelFlags 1 0 1'
    ].join('\n'), {world, content, globals: content.globals, building, team: 1, ipt: 8})

    building.processor = processor
    world.addProcessor(processor)
    processor.run(2)

    // Подложку сняли первым параметром, обводку оставили вторым
    assert.equal(world.markers.get(1).props.flags, LABEL_OUTLINE)
})

test('цвет разбирается и с решёткой, и без неё', () => {
    // Раньше `packColorHex` резал первый символ, и без решётки терялась первая цифра
    assert.equal(unpackColorBits(packColorHex('#84f491'))[0], unpackColorBits(packColorHex('84f491'))[0])
    assert.equal(Math.round(unpackColorBits(packColorHex('84f491'))[0] * 255), 0x84)
})

test('множители правил принадлежат команде, а не миру', () => {
    /*
     * `SetRuleI` берёт команду из третьего поля (`p1.team()`) и, если там не команда,
     * не делает ровно ничего. В редакторе игры поле подписано «of», и по умолчанию
     * там стоит `@sharded` — ноль там означал бы заброшенных.
     */
    const world = new World({width: 20, height: 20, content})
    const building = world.add('world-processor', {x: 1, y: 1})

    const mine = world.spawn('mono', {x: 5, y: 5, team: 1})
    const enemy = world.spawn('mono', {x: 7, y: 5, team: 2})

    const processor = new Processor([
        'setrule unitHealth 4 @sharded 0 0 0',
        'setrule unitMineSpeed 8 0 0 0 0'
    ].join('\n'), {world, content, globals: content.globals, team: 1, building, privileged: true})

    building.processor = processor
    world.addProcessor(processor)
    world.steps(2)

    // Своим досталось, чужим нет
    assert.equal(world.rules.teamRule(1, 'unitHealth'), 4)
    assert.equal(world.rules.teamRule(2, 'unitHealth'), 1)

    // А добыча ушла заброшенным: ноль — это команда 0, а не «поле не заполнено»
    assert.equal(world.rules.teamRule(0, 'unitMineSpeed'), 8)
    assert.equal(world.rules.teamRule(1, 'unitMineSpeed'), 1)

    const before = mine.health
    mine.damage(40)
    assert.equal(before - mine.health, 10, 'своему юниту урон поделился на четыре')

    const was = enemy.health
    enemy.damage(40)
    assert.equal(was - enemy.health, 40, 'чужому — нет')
})

/** Процессор, стоящий в мире: обычный или мировой, своей команды. */
function place(world, type, code, {x = 1, y = 1, team = 1, links = []} = {}) {
    const building = world.add(type, {x, y, team})
    const processor = new Processor(code, {
        world, content, globals: content.globals, building,
        team, ipt: building.spec.ipt, links
    })

    building.processor = processor
    world.addProcessor(processor)
    return processor
}

test('uradar держит цель у каждого юнита своей, а не одну на инструкцию', () => {
    // RadarI: у юнита кеш лежит в контроллере, `ai.execCache.put(this, best)`
    const {world, processor} = setup([
        'ubind @poly',
        'uradar enemy any any distance 0 1 result'
    ].join('\n'))

    world.spawn('poly', {x: 10, y: 10})
    world.spawn('poly', {x: 30, y: 30})
    const nearFirst = world.spawn('dagger', {x: 11, y: 10, team: 2})
    world.spawn('dagger', {x: 31, y: 30, team: 2})

    // Первый поли, второй поли, и снова первый — уже из кеша своего окна
    processor.run(6)
    assert.equal(processor.get('result').obj()?.id, nearFirst.id)
})

test('radar пересчитывает цель, как только сменился источник', () => {
    // RadarI: `timer.get(30f) || lastSourceBuild != base`
    const world = new World({width: 60, height: 20, content, floor: 'stone'})
    const left = world.add('logic-processor', {x: 5, y: 5})
    const right = world.add('logic-processor', {x: 50, y: 5})
    const processor = place(world, 'logic-processor', 'radar enemy any any distance src 1 result',
        {x: 28, y: 5})

    world.spawn('dagger', {x: 6, y: 5, team: 2})
    const nearRight = world.spawn('dagger', {x: 51, y: 5, team: 2})

    processor.get('src').setobj(left)
    processor.run(1)

    // Тот же тик, другой источник: цель уже его, а не левого
    processor.get('src').setobj(right)
    processor.run(1)
    assert.equal(processor.get('result').obj()?.id, nearRight.id)
})

test('мировой процессор ищет радаром и от чужого здания', () => {
    // RadarI: `exec.privileged || r.team() == exec.team`
    const world = new World({width: 40, height: 20, content, floor: 'stone'})
    const enemy = world.add('logic-processor', {x: 20, y: 5, team: 2})
    const target = world.spawn('dagger', {x: 21, y: 5, team: 1})

    const code = 'radar enemy any any distance src 1 result'
    const privileged = place(world, 'world-processor', code, {x: 1, y: 1})
    const plain = place(world, 'logic-processor', code, {x: 3, y: 1})

    privileged.get('src').setobj(enemy)
    plain.get('src').setobj(enemy)
    privileged.run(1)
    plain.run(1)

    assert.equal(privileged.get('result').obj()?.id, target.id)
    assert.equal(plain.get('result').obj(), null)
})

test('ячейка памяти отвечает только своей команде и мировому процессору', () => {
    // MemoryBuild.readable/writable: `exec.privileged || (team == exec.team && !block.privileged)`
    const world = new World({width: 20, height: 20, content, floor: 'stone'})
    const foreign = world.add('memory-cell', {x: 8, y: 8, team: 2})
    foreign.write(0, 5)

    const code = 'read got cell 0\nwrite 9 cell 1'
    const plain = place(world, 'logic-processor', code, {x: 1, y: 1})
    const privileged = place(world, 'world-processor', code.replace('got', 'seen'), {x: 3, y: 1})

    plain.get('cell').setobj(foreign)
    plain.run(2)
    assert.equal(plain.get('got').obj(), null, 'чужая ячейка прочиталась')
    assert.equal(foreign.read(1), 0, 'в чужую ячейку записалось')

    privileged.get('cell').setobj(foreign)
    privileged.run(2)
    assert.equal(privileged.num('seen'), 5)
    assert.equal(foreign.read(1), 9)

    // Мировую ячейку обычный процессор тоже не видит
    const worldCell = world.add('world-cell', {x: 12, y: 12, team: 1})
    worldCell.write(0, 7)
    const again = place(world, 'logic-processor', 'read got cell 0', {x: 5, y: 1})
    again.get('cell').setobj(worldCell)
    again.run(1)
    assert.equal(again.get('got').obj(), null)
})

test('строка адресом ячейки читает первое место', () => {
    // MemoryBuild.read: `position.numi()`, а у непустого объекта это единица
    const world = new World({width: 20, height: 20, content, floor: 'stone'})
    const cell = world.add('memory-cell', {x: 8, y: 8})
    cell.write(1, 42)

    const processor = place(world, 'logic-processor', 'read got cell1 "abc"\nwrite 3 cell1 "x"', {links: [cell]})
    processor.run(2)

    assert.equal(processor.num('got'), 42)
    assert.equal(cell.read(1), 3)
})

test('setprop @team берёт номер команды по модулю 256', () => {
    // Team.get((int)value): `all[((byte)id) & 0xff]`
    const world = new World({width: 20, height: 20, content, floor: 'stone'})
    const router = world.add('router', {x: 8, y: 8})
    const unit = world.spawn('dagger', {x: 5, y: 5})

    const processor = place(world, 'world-processor', 'setprop @team b 258\nsetprop @team u -1')
    processor.get('b').setobj(router)
    processor.get('u').setobj(unit)
    processor.run(2)

    assert.equal(router.team, 2)
    assert.equal(unit.team, 255)
})
