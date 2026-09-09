/**
 * Транспорт: лента конвейера и маршрутизатор.
 *
 * Конвейер — не очередь: у предметов есть место вдоль ленты, и от него зависит и скорость,
 * и то, примут ли новый предмет. Числа сняты из игры: скорость обычной ленты 0.046 доли
 * за тик, расстояние между предметами 0.4, на клетке помещается трое.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

import {World} from '../src/world.js'
import {createContent} from '../src/content.js'
import '../src/production.js'
import '../src/distribution.js'

const logicIds = JSON.parse(readFileSync(new URL('../data/logic-ids.json', import.meta.url), 'utf8'))
const content = createContent(logicIds)

const world = (options = {}) => new World({width: 20, height: 10, content, floor: 'sand', ...options})

/** Кладёт на ленту всё, что она готова принять, и крутит мир. */
function feed(scene, belt, source, ticks) {
    let inserted = 0

    for (let i = 0; i < ticks; i++) {
        if (belt.acceptItem(source, 'copper')) {
            belt.handleItem(source, 'copper')
            inserted++
        }

        scene.step()
    }

    return inserted
}

test('лента пропускает столько, сколько обещает игра', () => {
    const scene = world()
    const feeder = scene.add('container', {x: 2, y: 2})
    const belt = scene.add('conveyor', {x: 4, y: 2, rotation: 0})
    const target = scene.add('container', {x: 5, y: 2})

    feeder.handleStack('copper', 2000)
    feed(scene, belt, feeder, 600)

    /*
     * `displayedSpeed` у обычного конвейера 6.5 предмета в секунду. Это не отдельное число
     * в модели, а следствие: предметы стоят не ближе 0.4, лента едет 0.046 за тик.
     */
    const moved = target.items.get('copper') ?? 0
    assert.ok(moved >= 63 && moved <= 67, `за десять секунд прошло ${moved}`)
})

test('на клетке ленты помещается трое, и не ближе четырёх десятых друг к другу', () => {
    const scene = world()
    const feeder = scene.add('container', {x: 2, y: 2})
    const belt = scene.add('conveyor', {x: 4, y: 2, rotation: 0})

    feeder.handleStack('copper', 100)
    feed(scene, belt, feeder, 120)

    assert.ok(belt.line.length <= 3, `на ленте ${belt.line.length}`)

    for (let i = 1; i < belt.line.length; i++) {
        const gap = belt.line[i].y - belt.line[i - 1].y
        assert.ok(gap >= 0.4 - 1e-6, `предметы ближе четырёх десятых: ${gap}`)
    }
})

test('сбоку предмет въезжает в середину ленты и только на свободное место', () => {
    const scene = world()
    const belt = scene.add('conveyor', {x: 4, y: 2, rotation: 0})
    const side = scene.add('conveyor', {x: 4, y: 1, rotation: 1})

    // Сбоку принимают, только когда голова отошла дальше семи десятых: пустая лента годится
    assert.equal(belt.acceptItem(side, 'copper'), true)
    belt.handleItem(side, 'copper')

    // Такой предмет встаёт не в начало, а в середину — оттуда и едет
    assert.equal(belt.line[0].y, 0.5)

    // `minitem` пересчитывается тактом, и после него сбоку уже не пускают
    scene.step()
    assert.equal(belt.acceptItem(side, 'copper'), false)
})

test('лента не отдаёт назад тому, на кого смотрит', () => {
    const scene = world()

    const first = scene.add('conveyor', {x: 4, y: 2, rotation: 0})
    const second = scene.add('conveyor', {x: 5, y: 2, rotation: 2})

    // Встречные ленты: иначе один предмет катался бы между ними вечно
    assert.equal(first.acceptItem(second, 'copper'), false)
    assert.equal(second.acceptItem(first, 'copper'), false)
})

test('бур, лента и контейнер работают вместе', () => {
    const scene = world()
    for (const [x, y] of [[3, 3], [4, 3], [3, 4], [4, 4]]) scene.setOverlay(x, y, 'ore-copper')

    const drill = scene.add('mechanical-drill', {x: 3, y: 3})
    for (let x = 5; x <= 9; x++) scene.add('conveyor', {x, y: 3, rotation: 0})
    const target = scene.add('container', {x: 10, y: 3})

    scene.steps(1800)

    assert.ok((target.items.get('copper') ?? 0) >= 9)
    assert.equal(drill.items.get('copper') ?? 0, 0)
})

test('маршрутизатор раздаёт соседям по кругу и возвращает отправителю', () => {
    const scene = world()
    const router = scene.add('router', {x: 5, y: 5})

    const left = scene.add('container', {x: 4, y: 5})
    const right = scene.add('container', {x: 6, y: 5})

    for (let i = 0; i < 6; i++) {
        if (router.acceptItem(left, 'copper')) router.handleItem(left, 'copper')
        scene.steps(20)
    }

    /*
     * Это и есть та самая беда с маршрутизаторами: предмет уходит и вперёд, и назад тому,
     * кто его принёс. Отправитель тут — контейнер, и часть меди возвращается в него.
     */
    assert.ok((right.items.get('copper') ?? 0) > 0, 'вперёд не ушло ничего')
    assert.ok((left.items.get('copper') ?? 0) > 0, 'назад не вернулось ничего')
})

test('двум маршрутизаторам подряд предмет достаётся не сразу', () => {
    const scene = world()
    const first = scene.add('router', {x: 5, y: 5})
    const second = scene.add('router', {x: 6, y: 5})

    first.handleItem(scene.add('container', {x: 4, y: 5}), 'copper')

    // Соседу-маршрутизатору отдают только по таймеру: `time >= 1`, то есть через speed тиков
    scene.steps(1)
    assert.equal(second.items.get('copper') ?? 0, 0)

    scene.steps(20)
    const passed = (second.items.get('copper') ?? 0) + (first.items.get('copper') ?? 0)
    assert.equal(passed >= 1, true)
})
