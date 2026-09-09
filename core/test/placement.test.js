/**
 * Постановка протяжкой: линия клеток и поворот каждой.
 *
 * Перенос `Placement.normalizeLine` и `InputHandler.iterateLine`. Проверяется то, что видно
 * игроку: конвейер разворачивается по ходу линии, буры не наезжают друг на друга, а турель
 * поворот линии игнорирует.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import {linePlans, normalizeLine, breakArea} from '../src/placement.js'
import {World, canReplace} from '../src/world.js'

test('линия идёт по той оси, вдоль которой протянули дальше', () => {
    // Placement.normalizeLine: наискось линия не идёт никогда
    assert.deepEqual(normalizeLine(2, 2, 6, 3).map(p => [p.x, p.y]),
        [[2, 2], [3, 2], [4, 2], [5, 2], [6, 2]])

    assert.deepEqual(normalizeLine(2, 2, 3, 6).map(p => [p.x, p.y]),
        [[2, 2], [2, 3], [2, 4], [2, 5], [2, 6]])
})

test('конвейер разворачивается по ходу линии', () => {
    const plans = linePlans('conveyor', {x: 2, y: 2}, {x: 5, y: 2}, 1)

    assert.equal(plans.length, 4)
    assert.deepEqual(plans.map(plan => plan.rotation), [0, 0, 0, 0])

    // Тянем вниз — все смотрят вниз, хотя колесом был выбран поворот вверх
    const down = linePlans('conveyor', {x: 2, y: 8}, {x: 2, y: 5}, 1)
    assert.deepEqual(down.map(plan => plan.rotation), [3, 3, 3, 3])
})

test('последний конвейер линии смотрит туда же, куда предыдущий', () => {
    const plans = linePlans('conveyor', {x: 2, y: 2}, {x: 4, y: 2}, 2)

    // `conveyorPlacement`: у последнего нет следующего, и поворот берётся от предыдущего
    assert.equal(plans.at(-1).rotation, 0)
})

test('одиночный щелчок оставляет поворот, выбранный колесом', () => {
    const plans = linePlans('conveyor', {x: 3, y: 3}, {x: 3, y: 3}, 2)

    assert.equal(plans.length, 1)
    assert.equal(plans[0].rotation, 2)
})

test('блоки крупнее клетки встают через свой размер', () => {
    const plans = linePlans('mechanical-drill', {x: 2, y: 2}, {x: 9, y: 2}, 0)

    // Бур два на два: следующая точка пропускается, пока след перекрывается с предыдущим
    assert.deepEqual(plans.map(plan => plan.x), [2, 4, 6, 8])
    assert.ok(plans.every(plan => plan.y === 2))
})

test('турель поворот линии игнорирует', () => {
    // `ignoreLineRotation`: у дуо направление задаёт игрок, а не то, куда тянули
    const plans = linePlans('duo', {x: 2, y: 2}, {x: 5, y: 2}, 1)

    assert.deepEqual(plans.map(plan => plan.rotation), [1, 1, 1, 1])
})

test('неповорачиваемый блок остаётся с нулевым поворотом', () => {
    const plans = linePlans('router', {x: 2, y: 2}, {x: 4, y: 2}, 3)
    assert.deepEqual(plans.map(plan => plan.rotation), [0, 0, 0])
})

test('снос протяжкой выделяет прямоугольник', () => {
    assert.deepEqual(breakArea({x: 5, y: 7}, {x: 2, y: 3}), {x: 2, y: 3, width: 4, height: 5})
})

test('конвейер поверх конвейера меняет ему поворот', () => {
    // `Block.canReplace`: тот же блок заменяет сам себя только ради поворота
    assert.ok(canReplace('conveyor', 'conveyor'))
    assert.ok(canReplace('conveyor', 'router'), 'одна группа transportation')
    assert.ok(!canReplace('router', 'router'), 'маршрутизатор не поворачивается — и не заменяется')
    assert.ok(!canReplace('conveyor', 'container'), 'чужая группа')

    const world = new World({width: 8, height: 8})
    const first = world.place('conveyor', 3, 3, {rotation: 0})

    assert.equal(first.rotation, 0)
    assert.ok(!world.canPlace('conveyor', 3, 3, 0), 'тот же поворот ставить некуда')
    assert.ok(world.canPlace('conveyor', 3, 3, 3), 'другой поворот — это разворот на углу')

    const turned = world.place('conveyor', 3, 3, {rotation: 3})

    assert.equal(turned.rotation, 3)
    assert.equal(world.buildings.length, 1, 'старый исчез под новым, а не остался рядом')
})

test('крупная стена накрывает мелкие, мелкая поверх крупной не встаёт', () => {
    const world = new World({width: 12, height: 12})

    for (const [x, y] of [[4, 4], [5, 4], [4, 5], [5, 5]]) world.place('copper-wall', x, y)
    assert.equal(world.buildings.length, 4)

    // Стена два на два накрывает все четыре: одна группа, `group.anyReplace`
    assert.ok(world.canPlace('copper-wall-large', 4, 4))
    world.place('copper-wall-large', 4, 4)

    assert.equal(world.buildings.length, 1, 'четыре мелких исчезли под одной крупной')
    assert.equal(world.at(5, 5).type, 'copper-wall-large')

    // Обратно нельзя: новый блок должен уместить старый под собой целиком
    assert.ok(!world.canPlace('copper-wall', 4, 4))
})

test('линия, упёршаяся в чужой конвейер, не разворачивает его', () => {
    const world = new World({width: 12, height: 12})

    // Поперечный конвейер смотрит вверх; линия идёт к нему слева направо
    world.place('conveyor', 6, 2, {rotation: 1})

    const plans = linePlans('conveyor', {x: 2, y: 2}, {x: 6, y: 2}, 0, world)

    assert.deepEqual(plans.map(plan => plan.rotation), [0, 0, 0, 0, 1])

    // Без мира узнать не у кого, и последний блок просто продолжает линию
    const blind = linePlans('conveyor', {x: 2, y: 2}, {x: 6, y: 2}, 0)
    assert.deepEqual(blind.map(plan => plan.rotation), [0, 0, 0, 0, 0])
})

test('линия вдоль чужого конвейера его поворот не наследует', () => {
    const world = new World({width: 12, height: 12})

    // Два звена подряд: линия идёт вдоль них, а не втыкается в последнее
    world.place('conveyor', 5, 2, {rotation: 1})
    world.place('conveyor', 6, 2, {rotation: 1})

    const plans = linePlans('conveyor', {x: 2, y: 2}, {x: 6, y: 2}, 0, world)
    assert.equal(plans.at(-1).rotation, 0)
})
