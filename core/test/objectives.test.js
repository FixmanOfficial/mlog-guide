/**
 * Цели карты: тринадцать условий и то, что их проверяет.
 *
 * Главное здесь не сами условия — они простые, — а порядок и однократность. Цели идут
 * раньше юнитов, зданий и процессоров, поэтому флаг, поднятый программой, цель видит только
 * в следующем тике. А `done` срабатывает ровно один раз: он ставит флаги и запускает код,
 * и повторный запуск сломал бы любую цепочку.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

import {World} from '../src/world.js'
import {Processor} from '../src/vm.js'
import {createContent} from '../src/content.js'
import {Marker} from '../src/markers.js'
import {
    FlagObjective, TimerObjective, DestroyBlockObjective, DestroyBlocksObjective,
    DestroyUnitsObjective, UnitCountObjective, ItemObjective, CoreItemObjective,
    BuildCountObjective, DestroyCoreObjective, CommandModeObjective, ResearchObjective
} from '../src/objectives.js'

const logicIds = JSON.parse(readFileSync(new URL('../data/logic-ids.json', import.meta.url), 'utf8'))
const content = createContent(logicIds)

const world = (options = {}) => new World({width: 20, height: 20, content, ...options})

/** Процессор мира с программой: только он умеет `setflag`. */
function privileged(world, code, {x = 1, y = 1} = {}) {
    const building = world.add('world-processor', {x, y})

    const processor = new Processor(code, {
        world, content, globals: content.globals, building, team: 1, ipt: building.spec.ipt
    })

    building.processor = processor
    world.addProcessor(processor)
    return processor
}

test('цель по флагу видит то, что подняла программа, — но следующим тиком', () => {
    const map = world()
    privileged(map, 'setflag "готово" 1\nstop')

    const objective = new FlagObjective('готово')
    map.objectives.add(objective)

    // Накопитель инструкций наполняется в конце тика, поэтому программа шагает со второго
    map.steps(2)
    assert.equal(map.rules.flag('готово'), true, 'программа флаг не подняла')
    // Цели проверяются до процессоров, поэтому поднятый флаг виден им только следующим тиком
    assert.equal(objective.completed, false, 'цель успела увидеть флаг в том же тике')

    map.step()
    assert.equal(objective.completed, true)
})

test('выполненная цель ставит и снимает флаги ровно один раз', () => {
    const map = world()
    map.rules.setFlag('старт', true)

    const objective = new FlagObjective('старт', {flagsAdded: ['дальше'], flagsRemoved: ['старт']})
    map.objectives.add(objective)

    map.step()
    assert.equal(map.rules.flag('дальше'), true)
    assert.equal(map.rules.flag('старт'), false, 'снятый флаг остался')

    // Флаг сняли — но цель уже выполнена и заново не проверяется
    map.rules.setFlag('дальше', false)
    map.steps(5)
    assert.equal(map.rules.flag('дальше'), false, 'цель сработала второй раз')
})

test('потомок ждёт родителя, а add кладёт его в список раньше', () => {
    const map = world()

    const first = new FlagObjective('первый')
    const second = new FlagObjective('второй')
    first.child(second)

    map.objectives.add(first)

    assert.deepEqual(map.objectives.all, [second, first], 'потомок должен разворачиваться первым')
    assert.equal(second.qualified(), false, 'потомок работает до родителя')

    // Флаг второго поднят заранее: пока родитель не выполнен, это ничего не значит
    map.rules.setFlag('второй', true)
    map.step()
    assert.equal(second.completed, false)

    map.rules.setFlag('первый', true)
    map.step()
    assert.equal(first.completed, true)

    map.step()
    assert.equal(second.completed, true)
})

test('таймер копит время и слушается множителя из правил', () => {
    const map = world()
    const objective = new TimerObjective(10)
    map.objectives.add(objective)

    map.steps(9)
    assert.equal(objective.completed, false)

    map.step()
    assert.equal(objective.completed, true, 'десять тиков должны закрывать десятитиковый таймер')

    // Множитель растягивает срок, не трогая саму цель
    const slow = world()
    slow.rules.set('objectiveTimerMultiplier', 3)

    const long = new TimerObjective(10)
    slow.objectives.add(long)

    slow.steps(29)
    assert.equal(long.completed, false)

    slow.step()
    assert.equal(long.completed, true)
})

test('перемотка мира возвращает цели в начало вместе с таймером', () => {
    const map = world()
    const objective = new TimerObjective(10)
    map.objectives.add(objective)

    map.steps(12)
    assert.equal(objective.completed, true)

    map.reset()
    assert.equal(objective.completed, false)
    assert.equal(objective.countup, 0)
})

test('цель на блок считает не разрушение, а несовпадение', () => {
    const map = world()
    const building = map.add('router', {x: 5, y: 5, team: 2})

    const objective = new DestroyBlockObjective('router', 5, 5, 2)
    map.objectives.add(objective)

    map.step()
    assert.equal(objective.completed, false)

    // Здание на месте, но сменило команду — для цели это то же самое, что снесли
    building.team = 1
    map.step()
    assert.equal(objective.completed, true)
})

test('цель на список блоков ведёт счёт и закрывается на последнем', () => {
    const map = world()
    const first = map.add('router', {x: 5, y: 5, team: 2})
    const second = map.add('router', {x: 7, y: 5, team: 2})

    const objective = new DestroyBlocksObjective('router', 2, [[5, 5], [7, 5]])
    map.objectives.add(objective)

    first.destroy()
    map.step()

    assert.equal(objective.completed, false)
    assert.equal(objective.describe(map).done, 1)

    second.destroy()
    map.step()
    assert.equal(objective.completed, true)
})

test('счётчики партии: сбитые чужие юниты и разрушенные блоки', () => {
    const map = world()

    const enemy = map.spawn('dagger', {x: 5, y: 5, team: 2})
    const own = map.spawn('dagger', {x: 6, y: 5, team: 1})

    const objective = new DestroyUnitsObjective(1)
    map.objectives.add(objective)

    // Свой юнит в счёт не идёт: игра считает только чужих
    own.kill()
    map.step()
    assert.equal(map.stats.enemyUnitsDestroyed, 0)
    assert.equal(objective.completed, false)

    enemy.kill()
    map.step()
    assert.equal(map.stats.enemyUnitsDestroyed, 1)
    assert.equal(objective.completed, true)

    // Блоки считаются так же врозь: свои штуками, чужие по видам
    map.add('router', {x: 9, y: 9, team: 1}).destroy()
    map.add('router', {x: 11, y: 9, team: 2}).destroy()

    assert.equal(map.stats.buildingsDestroyed, 1)
    assert.equal(map.stats.getDestroyed('router'), 1)
})

test('количество юнитов и предметы в ядре читаются у своей команды', () => {
    const map = world()

    const units = new UnitCountObjective('poly', 2)
    const items = new ItemObjective('copper', 30)
    map.objectives.add(units, items)

    map.spawn('poly', {x: 3, y: 3, team: 1})
    map.spawn('poly', {x: 4, y: 3, team: 2})

    const core = map.add('core-shard', {x: 8, y: 8, team: 1})
    core.handleStack('copper', 30)

    map.step()

    // Чужой поли не считается, поэтому первая цель ещё открыта
    assert.equal(units.completed, false)
    assert.equal(items.completed, true, 'предметы читаются со склада первого ядра команды')

    map.spawn('poly', {x: 5, y: 3, team: 1})
    map.step()
    assert.equal(units.completed, true)
})

test('привезённое в ядро считается отдельно от лежащего в нём', () => {
    const map = world()
    const core = map.add('core-shard', {x: 8, y: 8, team: 1})

    const objective = new CoreItemObjective('copper', 5)
    map.objectives.add(objective)

    // `handleStack` — это выдача предметов пачкой, а не доставка транспортом:
    // счётчик доставленного она не трогает, и цель остаётся открытой
    core.handleStack('copper', 10)
    map.step()
    assert.equal(objective.completed, false)

    map.stats.coreItemCount.increment('copper', 5)
    map.step()
    assert.equal(objective.completed, true)
})

test('цель про ядра закрывается, когда у команды волн их не осталось', () => {
    const map = world()
    const core = map.add('core-shard', {x: 8, y: 8, team: 2})

    const objective = new DestroyCoreObjective()
    map.objectives.add(objective)

    map.step()
    assert.equal(objective.completed, false)

    core.destroy()
    map.step()
    assert.equal(objective.completed, true)
})

test('цели без нашей модели: постройка, исследование и команда юнитом', () => {
    const map = world()

    const build = new BuildCountObjective('conveyor', 1)
    const research = new ResearchObjective('graphite')
    const command = new CommandModeObjective()
    map.objectives.add(build, research, command)

    map.step()

    // Командовать юнитом без интерфейса игры засчитывается сразу — так же, как на сервере
    assert.equal(command.completed, true)
    assert.equal(build.completed, false, 'постройки у нас пока нет, счётчик пустой')
    assert.equal(research.completed, false)

    map.stats.placedBlockCount.increment('conveyor')
    map.unlocked.add('graphite')
    map.step()

    assert.equal(build.completed, true)
    assert.equal(research.completed, true)
})

test('выполненная цель запускает свой кусок кода — привилегированный и один раз', () => {
    const map = world()

    const objective = new FlagObjective('пуск', {
        completionLogicCode: 'setflag "код" 1\nsetrule unitCap 7 0 0 0 0'
    })

    map.objectives.add(objective)
    map.rules.setFlag('пуск', true)

    map.step()

    // Своего блока у цели нет, но инструкции мира ей доступны
    assert.equal(map.rules.flag('код'), true)
    assert.equal(map.rules.get('unitCap'), 7)
})

test('метки отдаются только у работающих целей', () => {
    const map = world()
    const marker = new Marker('shape')

    const objective = new FlagObjective('видно', {markers: [marker]})
    map.objectives.add(objective)

    assert.deepEqual(map.objectives.markers(), [marker])

    map.rules.setFlag('видно', true)
    map.step()

    assert.deepEqual(map.objectives.markers(), [], 'метки выполненной цели остались на карте')
})
