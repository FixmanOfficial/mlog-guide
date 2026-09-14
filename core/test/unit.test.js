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

test('мировой процессор привязывается к юниту чужой команды по объекту', () => {
    /*
     * LExecutor.UnitBindI: `u.team == exec.team || exec.privileged`. Обычному процессору
     * чужой юнит по-прежнему не даётся, а мировому — даётся, и только по объекту:
     * перебор по типу и у него идёт по своей команде.
     */
    const world = new World({content})
    const enemy = world.spawn('poly', {x: 4, y: 4, team: 2})

    const privileged = world.add('world-processor')
    const worldProcessor = new Processor('ubind цель\nstop',
        {world, content, globals: content.globals, team: 1, building: privileged})

    worldProcessor.get('цель').setconst(enemy)
    worldProcessor.run(2)
    assert.equal(worldProcessor.get('@unit').obj(), enemy)

    const {processor} = setup('ubind цель\nstop')
    processor.get('цель').setconst(enemy)
    processor.run(2)
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

test('дальность берётся из maxRange, а он у юнита не тот же, что range', () => {
    // Оба выводятся в UnitType.init из дальности пуль: range — минимум по оружию,
    // maxRange — максимум. У поли они расходятся, и sensor отдаёт именно maxRange
    assert.equal(UNIT_SPECS.poly.range, 130)
    assert.equal(UNIT_SPECS.poly.maxRange, 196)

    const {world, processor} = setup('ubind @poly\nsensor range @unit @range')
    world.spawn('poly', {x: 0, y: 0})
    processor.run(2)

    assert.equal(processor.num('range'), 196 / 8)
})

test('дальность вооружённого юнита снята из игры, а не выведена из литералов', () => {
    // Она собирается из скорости и времени жизни пуль минус запас в 4 единицы: у кинжала
    // это 2.5 * 60 - 4, и числа 146 в UnitTypes.java нет вовсе
    assert.equal(UNIT_SPECS.dagger.maxRange, 146)
    assert.equal(UNIT_SPECS.flare.maxRange, 76)

    // Где дальность всё-таки задана числом, оно и остаётся: у моно это 50, а не дальность добычи
    assert.equal(UNIT_SPECS.mono.maxRange, 50)
    assert.equal(UNIT_SPECS.mono.mineRange, 70)
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

test('ucontrol getBlock отдаёт стену, здание и руду с полом', () => {
    const {world, processor} = setup([
        'ubind @poly',
        'ucontrol getBlock 3 3 блок здание пол'
    ].join('\n'))

    world.spawn('poly', {x: 3, y: 3})
    world.setFloor(3, 3, 'sand-floor')
    world.setOverlay(3, 3, 'ore-copper')

    processor.run(2)

    // Руда важнее пола: третий результат отдаёт её, а пол только если руды нет
    assert.equal(processor.get('пол').obj().name, 'ore-copper')
    assert.equal(processor.get('блок').obj().name, 'air')
    assert.equal(processor.get('здание').obj(), null)

    world.setOverlay(3, 3, null)
    world.setWall(3, 3, 'stone-wall')
    processor.run(2)

    assert.equal(processor.get('пол').obj().name, 'sand-floor')
    assert.equal(processor.get('блок').obj().name, 'stone-wall')
})

test('пол под ногами меняет скорость и трение наземного юнита', () => {
    const world = new World({width: 8, height: 8, floor: 'stone'})
    const dagger = world.spawn('dagger', {x: 2, y: 2})

    assert.equal(dagger.speed(), UNIT_SPECS.dagger.speed)

    // deep-water: speedMultiplier 0.2. UnitComp.floorSpeedMultiplier возводит его
    // в степень floorMultiplier юнита, у кинжала она единичная
    world.setFloor(2, 2, 'deep-water')
    assert.ok(Math.abs(dagger.speed() - UNIT_SPECS.dagger.speed * 0.2) < 1e-6)

    // А летящий пола не касается вовсе
    const poly = world.spawn('poly', {x: 2, y: 2})
    assert.equal(poly.floorOn(), null)
    assert.equal(poly.speed(), Math.fround(UNIT_SPECS.poly.speed))
})

test('фаза шага копится пройденным путём, а не временем', () => {
    const world = new World({width: 30, height: 10, floor: 'stone'})
    const dagger = world.spawn('dagger', {x: 2, y: 2})

    assert.equal(dagger.spec.mech, true)
    assert.equal(dagger.walkTime, 0)

    // Стоящий мех ногами не перебирает: без движения walked не поднимается
    world.steps(30)
    assert.equal(dagger.walkTime, 0)

    dagger.controller = new LogicAI({})
    dagger.controller.control = 'move'
    dagger.controller.moveX = unconv(20)
    dagger.controller.moveY = unconv(2)

    world.steps(60)

    assert.ok(dagger.walkTime > 0, 'шёл и не нашагал')
    assert.ok(Math.abs(dagger.walkTime - (dagger.x - unconv(2))) < 0.5, 'путь и фаза расходятся')
})

test('ноги меха поворачиваются туда, куда он сдвинулся', () => {
    const world = new World({width: 30, height: 30, floor: 'stone'})
    const dagger = world.spawn('dagger', {x: 15, y: 2, rotation: 90})

    dagger.controller = new LogicAI({})
    dagger.controller.control = 'move'
    dagger.controller.moveX = unconv(15)
    dagger.controller.moveY = unconv(25)

    world.steps(120)

    // Двигался вверх — ноги смотрят вверх, то есть на 90 градусов
    assert.ok(Math.abs(dagger.baseRotation - 90) < 5, `ноги смотрят на ${dagger.baseRotation}`)
})

test('walkExtend — пила по четыре шага, симметричная относительно нуля', () => {
    const world = new World({width: 10, height: 10})
    const dagger = world.spawn('dagger', {x: 1, y: 1})
    const stride = dagger.spec.mechStride

    dagger.walkTime = 0
    assert.equal(dagger.walkExtend(false), 0)

    // Полный цикл — четыре шага: на нём значение повторяется
    dagger.walkTime = stride * 4
    assert.equal(dagger.walkExtend(false), 0)

    const values = []
    for (let i = 0; i <= 40; i++) {
        dagger.walkTime = stride * 4 * i / 40
        values.push(dagger.walkExtend(false))
    }

    assert.ok(Math.max(...values) <= stride + 1e-5)
    assert.ok(Math.min(...values) >= -stride - 1e-5)

    // Масштабированная версия — та же пила в долях шага, от нуля до четырёх
    dagger.walkTime = stride * 2
    assert.equal(dagger.walkExtend(true), 2)
})

test('огонь двигателей есть у всех, но виден только в воздухе', () => {
    // engines заводятся из engineSize, поэтому запись есть и у наземных.
    // Не видно их потому, что множитель считается от высоты, а она у них нулевая
    assert.equal(UNIT_SPECS.dagger.engines.length, 1)
    assert.equal(UNIT_SPECS.dagger.useEngineElevation, true)

    const world = new World({width: 10, height: 10})
    assert.equal(world.spawn('dagger', {x: 1, y: 1}).elevation, 0)
    assert.equal(world.spawn('poly', {x: 2, y: 2}).elevation, 1)
})

test('коды @controlled лежат в константах, как в игре', () => {
    // GlobalVars.java:94-96 кладёт их простым put, без записи в окно «Переменные»
    const {world, processor} = setup([
        'ubind @poly',
        'sensor кем @unit @controlled',
        'op equal никто кем 0',
        'ucontrol move 5 5',
        'sensor кемПосле @unit @controlled',
        'op equal процессор кемПосле @ctrlProcessor',
        'set игрок @ctrlPlayer',
        'set команда @ctrlCommand'
    ].join('\n'))

    world.spawn('poly', {x: 5, y: 5})
    processor.run(8)

    assert.equal(processor.num('никто'), 1)
    assert.equal(processor.num('процессор'), 1)
    assert.equal(processor.num('игрок'), 2)
    assert.equal(processor.num('команда'), 3)
})

test('срок управления снимает контроллер, но не отменяет начатое', () => {
    /*
     * `LogicAI.updateMovement`: когда `controlTimer` вышел, юнит получает свой обычный
     * разум обратно. Движение на этом кончается — вести юнита больше некому, — а вот
     * добыча и флаг живут в самом юните и таймер переживают.
     */
    const {world, processor} = setup([
        'ubind @mono',
        'ucontrol flag 7 0 0 0 0',
        'ucontrol mine 9 6 0 0 0',
        'stop'
    ].join('\n'))

    world.setOverlay(9, 6, 'ore-copper')
    const mono = world.spawn('mono', {x: 9, y: 6})

    world.steps(20)
    assert.ok(mono.controller instanceof LogicAI)
    assert.notEqual(mono.mineTile, null)

    /*
     * Программа давно остановилась: через 600 тиков контроль истекает. Груз по дороге
     * приходится выкидывать — с полным трюмом добыча прекращается сама, и проверка
     * поймала бы не то.
     */
    for (let i = 0; i < LOGIC_CONTROL_TIMEOUT + 30; i++) {
        world.step()
        mono.itemAmount = 0
    }

    assert.equal(mono.controller instanceof LogicAI, false, 'контроллер снят')
    assert.notEqual(mono.mineTile, null, 'а копать юнит не перестал')
    assert.equal(mono.flag, 7, 'и флаг при нём')
})

test('within продлевает управление, если контроллер уже есть, и не заводит его сам', () => {
    /*
     * UnitControlI: `within` и `unbind` не создают контроллера (`control` там ложно),
     * но найденному обновляют срок — `if(ai != null) ai.controlTimer = logicControlTimeout`.
     */
    const {world, processor} = setup([
        'ubind @poly',
        'ucontrol within 5 5 3 близко 0',
        'stop'
    ].join('\n'))

    const poly = world.spawn('poly', {x: 5, y: 5})

    world.steps(4)
    assert.equal(poly.controller, null, 'сам по себе within контроллера не заводит')
    assert.equal(processor.num('близко'), 1)

    // А после команды — продлевает: срок возвращается к полному
    const {world: second, processor: commander} = setup([
        'ubind @poly',
        'ucontrol move 9 9 0 0 0',
        'stop'
    ].join('\n'))

    const controlled = second.spawn('poly', {x: 5, y: 5})
    second.steps(4)

    const ai = controlled.controller
    assert.ok(ai instanceof LogicAI)

    ai.controlTimer = 10
    commander.reset()

    const asking = new Processor([
        'ubind @poly',
        'ucontrol within 5 5 3 близко 0',
        'stop'
    ].join('\n'), {
        world: second, content, globals: content.globals,
        team: 1, building: second.add('micro-processor', {x: 9, y: 1})
    })

    asking.run(4)
    assert.equal(ai.controlTimer, LOGIC_CONTROL_TIMEOUT, 'срок обновился')
})

test('копают с места: команда не двигает юнита и не достаёт дальше mineRange', () => {
    /*
     * `LExecutor` ставит `mineTile` только через `validMine`, а тот считает расстояние.
     * `LogicAI.updateMovement` про добычу не знает вовсе: до руды юнита ведут отдельной
     * командой движения, а не сама `mine`.
     */
    const world = new World({width: 32, height: 12, content, floor: 'stone'})
    const building = world.add('micro-processor', {x: 1, y: 6})

    world.setOverlay(10, 6, 'ore-copper')
    world.setOverlay(28, 6, 'ore-copper')

    const near = world.spawn('mono', {x: 8, y: 6})
    const far = world.spawn('mono', {x: 8, y: 6})

    const processor = new Processor([
        'ubind @mono',
        'ucontrol mine 10 6 0 0 0',
        'ubind @mono',
        'ucontrol mine 28 6 0 0 0'
    ].join('\n'), {world, content, globals: content.globals, team: 1, building})

    building.processor = processor
    world.addProcessor(processor)

    // Микропроцессор берёт две инструкции за тик — на все четыре строки нужно два тика
    world.steps(2)

    // Клетка в 2 тайлах — копает; в 20 тайлах — команда ничего не сделала
    assert.notEqual(near.mineTile, null)
    assert.equal(far.mineTile, null)

    const was = near.x
    world.steps(120)

    assert.equal(near.x, was, 'юнит остался на месте')
    assert.ok(near.itemAmount > 0, 'но клетку копает')
})

test('одну клетку копают сколько угодно юнитов разом', () => {
    // Замка на тайле нет: в `MinerComp.update` про других копателей ничего не сказано
    const world = new World({width: 16, height: 10, content, floor: 'stone'})
    world.setOverlay(8, 5, 'ore-copper')

    const crew = [0, 1, 2].map(() => world.spawn('mono', {x: 7, y: 5}))
    for (const unit of crew) unit.mineTile = {x: 8, y: 5}

    world.steps(60)

    for (const unit of crew) assert.ok(unit.itemAmount >= 2, `набрал ${unit.itemAmount}`)
})
