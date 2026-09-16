/**
 * Турели: патроны, наведение, выстрел и управление логикой.
 *
 * Числа здесь не выдуманы: дуо перезаряжается 20 тиков, крутится на 10 градусов за тик,
 * стреляет в конусе 15 градусов, а медный патрон даёт 2 единицы боезапаса и 9 урона.
 * Всё это снято выгрузкой из игры и лежит в `block-specs.json`.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

import {World} from '../src/world.js'
import {Processor} from '../src/vm.js'
import {createContent} from '../src/content.js'
import '../src/turret.js'
import {completeDamage} from '../src/damage.js'

const logicIds = JSON.parse(readFileSync(new URL('../data/logic-ids.json', import.meta.url), 'utf8'))
const content = createContent(logicIds)

/** Мир с турелью, врагом и процессором, связанным с турелью. */
function stand(program, {ammo = 5, enemyTile = 12, type = 'duo'} = {}) {
    const world = new World({width: 40, height: 20, content, floor: 'sand-floor'})
    const turret = world.add(type, {x: 5, y: 5, ammo: {copper: ammo}})

    const enemy = world.spawn('dagger', {x: enemyTile, y: 5, team: 2})
    const block = world.add('micro-processor', {x: 2, y: 2})

    block.processor = new Processor(program, {
        links: [turret], world, content, globals: content.globals, building: block
    })
    world.addProcessor(block.processor)

    return {world, turret, enemy, processor: block.processor}
}

test('патроны копятся стопкой, и наверху лежит последний подвезённый', () => {
    // ItemTurret.handleItem: медь даёт 2 единицы, графит 4, и запись всплывает наверх
    const world = new World({width: 10, height: 10, content, floor: 'sand-floor'})
    const turret = world.add('duo', {x: 2, y: 2})

    turret.handleItem(turret, 'copper')
    turret.handleItem(turret, 'graphite')
    turret.handleItem(turret, 'copper')

    assert.equal(turret.totalAmmo, 2 + 4 + 2)
    assert.deepEqual(turret.ammo.map(entry => entry.item), ['graphite', 'copper'])

    // Стрелять будет верхней записью — медью, хотя графит подвезли позже
    assert.equal(turret.peekAmmo().damage, 9)
})

test('лишний патрон турель не принимает', () => {
    const world = new World({width: 10, height: 10, content, floor: 'sand-floor'})
    const turret = world.add('duo', {x: 2, y: 2})

    // maxAmmo 30, медь по 2 за предмет — пятнадцать предметов заполняют турель целиком
    for (let i = 0; i < 15; i++) {
        assert.equal(turret.acceptItem(turret, 'copper'), true)
        turret.handleItem(turret, 'copper')
    }

    assert.equal(turret.totalAmmo, 30)
    assert.equal(turret.acceptItem(turret, 'copper'), false)

    // Непатронный предмет не берётся вовсе
    assert.equal(turret.acceptItem(turret, 'lead'), false)
})

test('control shoot наводит турель и стреляет по точке', () => {
    const {world, turret, enemy, processor} = stand([
        'control shoot duo1 12 5 1',
        'sensor стреляет duo1 @shooting',
        'sensor патронов duo1 @ammo',
        'sensor поворот duo1 @rotation'
    ].join('\n'))

    for (let i = 0; i < 60; i++) world.step()

    assert.equal(processor.num('стреляет'), 1)

    // Турель развернулась на восток: цель ровно справа
    assert.ok(Math.abs(processor.num('поворот')) < 1, processor.num('поворот'))

    // За секунду при перезарядке 20 тиков выходит три выстрела, каждый тратит единицу
    assert.equal(turret.totalAmmo, 10 - 3)
    assert.equal(processor.num('патронов'), 7)

    // И это не холостая стрельба: врагу прилетело
    assert.ok(enemy.health < 150, enemy.health)
})

test('без последнего поля турель целится, но не стреляет', () => {
    const {world, turret, enemy, processor} = stand([
        'control shoot duo1 12 5 0',
        'sensor стреляет duo1 @shooting'
    ].join('\n'))

    for (let i = 0; i < 60; i++) world.step()

    assert.equal(processor.num('стреляет'), 0)
    assert.equal(turret.totalAmmo, 10)
    assert.equal(enemy.health, 150)

    // Поворот при этом состоялся: наводка и стрельба — разные вещи
    assert.ok(Math.abs(turret.rotation) < 1, turret.rotation)
})

test('через две секунды после команды турель возвращается к своему прицелу', () => {
    // Turret.logicControlCooldown: 120 тиков
    const {world, turret} = stand('control shoot duo1 1 5 1\nstop')

    // Накопитель инструкций начинается с нуля, поэтому первый тик может не успеть ничего
    world.step()
    world.step()
    assert.equal(turret.logicControlTime > 0, true, 'logicControlTime = ' + turret.logicControlTime)

    for (let i = 0; i < 121; i++) world.step()
    assert.equal(turret.logicControlled, false)

    // Своя цель нашлась сама: враг стоит в дальности
    assert.equal(turret.target?.type, 'dagger')
})

test('control shootp берёт упреждение по скорости цели', () => {
    const {world, turret, enemy, processor} = stand([
        'ubind @dagger',
        'control shootp duo1 @unit 1',
        'sensor целитсяX duo1 @shootX'
    ].join('\n'), {enemyTile: 14})

    // Враг едет вверх, и стрелять надо туда, где он окажется
    enemy.team = 2
    enemy.x = 14 * 8
    enemy.y = 5 * 8

    world.step()
    world.step()

    // Своих юнитов у процессора нет: `ubind @dagger` привязывает чужого только в песочнице,
    // поэтому целимся напрямую
    turret.control('shootp', enemy, 1)
    assert.ok(Math.abs(turret.targetPos.x - enemy.x) < 1, turret.targetPos.x)

    // Скорость для упреждения — сдвиг за прошлый тик, `Hitboxc.deltaX`. Predict.intercept
    enemy.deltaX = 2
    enemy.deltaY = 0
    turret.control('shootp', enemy, 1)

    // Упреждение сместило точку вперёд по движению
    assert.ok(turret.targetPos.x > enemy.x, turret.targetPos.x)
    assert.equal(processor.diagnostics.length, 0)
})

test('турель без патронов не стреляет и не крутится', () => {
    const {world, turret, processor} = stand([
        'control shoot duo1 12 5 1',
        'sensor патронов duo1 @ammo'
    ].join('\n'), {ammo: 0})

    for (let i = 0; i < 60; i++) world.step()

    assert.equal(processor.num('патронов'), 0)
    assert.equal(world.bullets.length, 0)

    // Поворот остался начальным: наведение живёт внутри проверки «есть чем стрелять»
    assert.equal(turret.rotation, 90)
})

test('@currentAmmoType отдаёт предмет, а не пулю', () => {
    const {world, processor} = stand([
        'sensor патрон duo1 @currentAmmoType',
        'sensor заряд duo1 @ammoCapacity',
        'sensor готовность duo1 @progress'
    ].join('\n'))

    for (let i = 0; i < 10; i++) world.step()

    assert.equal(processor.get('патрон').objval.name, 'copper')
    assert.equal(processor.num('заряд'), 30)
    assert.ok(processor.num('готовность') >= 0 && processor.num('готовность') <= 1)
})

test('пуля живёт своё время и исчезает', () => {
    const {world, turret} = stand('control shoot duo1 30 5 1\nstop')

    // Цель далеко за дальностью, но команда логики дальности не спрашивает
    for (let i = 0; i < 25; i++) world.step()
    assert.ok(world.bullets.length > 0)

    const bullet = world.bullets[0]
    const lifetime = bullet.type.lifetime

    for (let i = 0; i < lifetime + 2; i++) world.step()
    assert.equal(world.bullets.includes(bullet), false)
    assert.equal(turret.totalAmmo < 10, true)
})

test('сброс возвращает турели патроны и поворот', () => {
    const {world, turret} = stand('control shoot duo1 12 5 1')

    for (let i = 0; i < 60; i++) world.step()
    assert.ok(turret.totalAmmo < 10)

    world.reset()

    assert.equal(turret.totalAmmo, 10)
    assert.equal(turret.rotation, 90)
    assert.equal(world.bullets.length, 0)
})

test('sensor @range у турели — в тайлах', () => {
    // BuildingComp.sense: `range() / tilesize`
    const {turret} = stand('noop')
    assert.equal(turret.sense('range'), turret.spec.range / 8)
})

test('control shootp по зданию целится в его середину в мировых единицах', () => {
    const {world, turret} = stand('noop')
    const wall = world.add('copper-wall-large', {x: 12, y: 12, team: 2})

    turret.control('shootp', wall, 1)
    assert.deepEqual(turret.targetPos, {x: (12 + 0.5) * 8, y: (12 + 0.5) * 8})
})

test('сплошной взрыв бьёт большое здание по каждой его клетке', () => {
    // Damage.completeDamage: урон на клетку, а не на здание
    const world = new World({width: 20, height: 20, content, floor: 'stone'})
    const wall = world.add('titanium-wall-large', {x: 10, y: 10, team: 2})
    const before = wall.health

    completeDamage(world, 10.5 * 8, 10.5 * 8, 3 * 8, 10, 1)
    assert.equal(before - wall.health, 40)
})
