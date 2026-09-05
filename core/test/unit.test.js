import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

import {World} from '../src/world.js'
import {Processor} from '../src/vm.js'
import {createContent} from '../src/content.js'
import {Unit, LogicAI, UNIT_SPECS, LOGIC_CONTROL_TIMEOUT, unconv} from '../src/unit.js'
import {Vec2} from '../src/arc.js'
import {Diagnostic} from '../src/errors.js'

const logicIds = JSON.parse(readFileSync(new URL('../data/logic-ids.json', import.meta.url), 'utf8'))
const content = createContent(logicIds)

/** Мир с процессором, которому видны константы контента. */
function setup(code, {team = 1} = {}) {
    const world = new World({content})
    const building = world.add('micro-processor')
    const processor = new Processor(code, {world, content, globals: content.globals, team, building})

    building.processor = processor
    world.addProcessor(processor)
    return {world, processor, building}
}

test('ubind ходит по юнитам своей команды по кругу', () => {
    const {world, processor} = setup('ubind @poly')
    const first = world.spawn('poly', {x: 1, y: 1})
    const second = world.spawn('poly', {x: 2, y: 2})

    processor.run(1)
    assert.equal(processor.get('@unit').obj(), first)

    processor.run(1)
    assert.equal(processor.get('@unit').obj(), second)

    // Счётчик берётся по модулю длины списка, поэтому обход замыкается
    processor.run(1)
    assert.equal(processor.get('@unit').obj(), first)
})

test('ubind без юнитов этого типа обнуляет @unit', () => {
    const {world, processor} = setup('ubind @poly')
    world.spawn('mono', {x: 1, y: 1})

    processor.run(1)
    assert.equal(processor.get('@unit').obj(), null)
})

test('ubind не берёт юнита чужой команды', () => {
    const {world, processor} = setup('ubind @poly')
    world.spawn('poly', {x: 1, y: 1, team: 2})

    processor.run(1)
    assert.equal(processor.get('@unit').obj(), null)
})

test('ucontrol move не двигает юнита, а вешает контроллер и пишет в него цель', () => {
    const {world, processor} = setup('ubind @poly\nucontrol move 10 20 0 0 0')
    const unit = world.spawn('poly', {x: 1, y: 1})

    processor.run(2)

    assert.ok(unit.controller instanceof LogicAI)
    assert.equal(unit.controller.control, 'move')

    // Цель хранится в мировых единицах: тайл умножается на восемь
    assert.equal(unit.controller.moveX, unconv(10))
    assert.equal(unit.controller.moveY, unconv(20))

    // Сам юнит на месте: движение считает он сам, в свой тик
    assert.equal(unit.x, unconv(1))
    assert.equal(unit.vel.x, 0)
})

test('команда доходит до движения через два тика, и это не задержка, а порядок обновления', () => {
    const {world} = setup('ubind @poly\nucontrol move 20 0 0 0 0')
    const unit = world.spawn('poly', {x: 0, y: 0})

    // Накопитель инструкций пополняется после цикла, поэтому в первом тике процессор
    // не выполняет ничего — команда до юнита ещё не дошла
    world.step()
    assert.equal(unit.controller, null)

    // Во втором тике программа отрабатывает, но юниты в Logic.updateEntities обновляются
    // раньше зданий: контроллер повис уже после того, как юнит посчитался
    world.step()
    assert.ok(unit.controller instanceof LogicAI)
    assert.equal(unit.vel.x, 0)

    // В третьем контроллер задаёт скорость, а перенос в VelComp к этому моменту уже прошёл
    world.step()
    // Первый шаг разгона — accel от скорости типа. Точное значение проверяет соседний тест,
    // здесь важно только, что скорость появилась именно в этом тике
    assert.ok(Math.abs(unit.vel.x - UNIT_SPECS.poly.accel * UNIT_SPECS.poly.speed) < 1e-6)
    assert.equal(unit.x, 0)

    world.step()
    assert.ok(unit.x > 0)
})

test('разгон и трение совпадают с формулой игры по шагам', () => {
    const spec = UNIT_SPECS.poly

    // Цель далеко: length упирается в единицу, вектор равен скорости типа
    const target = new Vec2(spec.speed, 0)

    let x = 0
    let vel = 0

    for (let i = 0; i < 20; i++) {
        // VelComp.update: перенос и трение считаются до того, как контроллер решит
        x += vel
        vel *= Math.max(1 - spec.drag, 0)

        // UnitComp.moveAt: шаг скорости ограничен accel * длина вектора
        const step = Math.min(target.x - vel, spec.accel * target.len())
        vel += step
    }

    const model = new Unit(null, 'poly', {x: 0, y: 0})
    model.controller = new LogicAI({})
    model.controller.control = 'move'
    model.controller.moveX = 10000
    model.controller.moveY = 0

    for (let i = 0; i < 20; i++) model.update()

    assert.ok(Math.abs(model.x - x) < 1e-3, `${model.x} против ${x}`)
    assert.ok(Math.abs(model.vel.x - vel) < 1e-4, `${model.vel.x} против ${vel}`)
})

test('у цели скорость гасится, а не обрубается', () => {
    const unit = new Unit(null, 'poly', {x: 0, y: 0})
    unit.controller = new LogicAI({})
    unit.controller.control = 'move'
    unit.controller.moveX = 200
    unit.controller.moveY = 0

    for (let i = 0; i < 400; i++) unit.update()

    // moveTo гасит вектор на последних 30 единицах (smooth), поэтому юнит подходит и стоит
    assert.ok(Math.abs(unit.x - 200) < 1.5, `остановился на ${unit.x}`)
    assert.ok(Math.abs(unit.vel.x) < 0.05, `скорость у цели ${unit.vel.x}`)
})

test('approach выталкивает юнита на заданный радиус, а не подводит вплотную', () => {
    const unit = new Unit(null, 'poly', {x: unconv(1), y: 0})
    unit.controller = new LogicAI({})
    unit.controller.control = 'approach'
    unit.controller.moveX = 0
    unit.controller.moveY = 0
    unit.controller.moveRad = unconv(10)

    for (let i = 0; i < 600; i++) unit.update()

    // Радиус берётся минус семь единиц, а близкий юнит разворачивается: keepDistance здесь true
    const distance = unit.dst(0, 0)
    assert.ok(distance > 66 && distance < 80, `дистанция ${distance}`)
})

test('без новых команд контроль истекает через десять секунд', () => {
    const {world, processor} = setup('ubind @poly\nucontrol move 20 0 0 0 0\nstop')
    const unit = world.spawn('poly', {x: 0, y: 0})

    world.steps(2)
    assert.ok(unit.controller instanceof LogicAI)

    world.steps(LOGIC_CONTROL_TIMEOUT + 2)
    assert.equal(unit.controller, null, 'юнит вернулся своему ИИ')
})

test('ucontrol flag и within пишут в переменные программы', () => {
    const {world, processor} = setup([
        'ubind @poly',
        'ucontrol flag 7 0 0 0 0',
        'ucontrol within 0 0 5 near 0'
    ].join('\n'))

    const unit = world.spawn('poly', {x: 2, y: 0})
    processor.run(3)

    assert.equal(unit.flag, 7)
    assert.equal(processor.num('near'), 1)

    unit.x = unconv(20)
    processor.run(3)
    assert.equal(processor.num('near'), 0)
})

test('ucontrol unbind возвращает юнита его ИИ', () => {
    const {world, processor} = setup('ubind @poly\nucontrol move 20 0 0 0 0\nucontrol unbind 0 0 0 0 0')
    const unit = world.spawn('poly', {x: 0, y: 0})

    processor.run(3)
    assert.equal(unit.controller, null)
})

test('неперенесённая команда ucontrol даёт диагностику, а не тихий пропуск', () => {
    const {processor} = setup('ucontrol build 0 0 @router 0 0')

    const found = processor.diagnostics.find(item => item.code === Diagnostic.NOT_IMPLEMENTED)
    assert.ok(found !== undefined)
    assert.equal(found.instruction, 'ucontrol build')
})

test('sensor отдаёт координаты юнита в тайлах, а скорость в тайлах за секунду', () => {
    const {world, processor} = setup([
        'ubind @poly',
        'sensor x @unit @x',
        'sensor size @unit @size',
        'sensor speed @unit @speed',
        'sensor cap @unit @itemCapacity'
    ].join('\n'))

    world.spawn('poly', {x: 3, y: 4})
    processor.run(5)

    assert.equal(processor.num('x'), 3)
    assert.equal(processor.num('size'), UNIT_SPECS.poly.hitSize / 8)
    assert.equal(processor.num('speed'), UNIT_SPECS.poly.speed * 60 / 8)
    assert.equal(processor.num('cap'), UNIT_SPECS.poly.itemCapacity)
})

test('sensor @type отдаёт объект контента, а не строку', () => {
    const {world, processor} = setup('ubind @poly\nsensor type @unit @type\njump 0 equal type @poly')
    world.spawn('poly', {x: 0, y: 0})
    processor.run(2)

    const type = processor.get('type')
    assert.equal(type.isobj, true)
    assert.equal(type.objval.name, 'poly')
    assert.equal(type.objval.contentType, 'unit')
})

test('вместимость выводится из размера там, где в игре она не задана числом', () => {
    // UnitType.init: max(round((int)(hitSize * 4), 10), 10), и round(int, int) — деление нацело
    const derive = (hitSize) => Math.max(Math.trunc(Math.trunc(hitSize * 4) / 10) * 10, 10)

    assert.equal(UNIT_SPECS.dagger.itemCapacity, derive(UNIT_SPECS.dagger.hitSize))
    assert.equal(UNIT_SPECS.mono.itemCapacity, derive(UNIT_SPECS.mono.hitSize))
    assert.equal(UNIT_SPECS.nova.itemCapacity, derive(UNIT_SPECS.nova.hitSize))

    // А flare задаёт вместимость числом, и формула к нему не применяется
    assert.equal(UNIT_SPECS.flare.itemCapacity, 10)
    assert.notEqual(derive(UNIT_SPECS.flare.hitSize), 10)
})

test('дальность вооружённого юнита не выдумывается', () => {
    // range выводится в игре из дальности пуль; пока её не снять, sensor честно молчит
    assert.equal(UNIT_SPECS.dagger.range, null)

    const {world, processor} = setup('ubind @dagger\nsensor range @unit @range')
    world.spawn('dagger', {x: 0, y: 0})
    processor.run(2)

    const range = processor.get('range')
    assert.equal(range.isobj, true, 'NaN превращается в пустое значение, а не в ноль')
    assert.equal(range.objval, null)
})

test('сброс мира возвращает юнитов на место и повторяет прогон в точности', () => {
    const {world} = setup('ubind @poly\nucontrol move 20 5 0 0 0')
    const unit = world.spawn('poly', {x: 0, y: 0})

    world.steps(120)
    const after = {x: unit.x, y: unit.y, vx: unit.vel.x}

    world.reset()
    assert.equal(unit.x, 0)
    assert.equal(unit.vel.x, 0)

    world.steps(120)
    assert.equal(unit.x, after.x)
    assert.equal(unit.y, after.y)
    assert.equal(unit.vel.x, after.vx)
})
