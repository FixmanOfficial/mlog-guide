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
import '../src/sandbox.js'

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
     * `displayedSpeed` у обычного конвейера — пять предметов в секунду. Это не отдельное
     * число в модели, а следствие: предметы стоят не ближе 0.4, лента едет 0.035 за тик.
     *
     * В v159.7 было 6.5 при скорости 0.046 — ленту замедлили в v160, и тест это заметил
     * раньше, чем мы.
     */
    const moved = target.items.get('copper') ?? 0
    assert.ok(moved >= 46 && moved <= 51, `за десять секунд прошло ${moved}`)
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

test('лента на повороте рисуется углом, а не прямым куском', () => {
    const scene = world()

    /*
     * Линия вправо, потом вниз. У углового конвейера приток приходит с одной стороны,
     * и `Autotiler` даёт вид 1 — угол. Отражение по вертикали переворачивает ту же
     * картинку: угол налево и угол направо рисуются одним спрайтом.
     */
    for (let x = 2; x < 6; x++) scene.place('conveyor', x, 5, {rotation: 0})
    for (let y = 4; y > 1; y--) scene.place('conveyor', 6, y, {rotation: 3})

    const corner = scene.at(6, 5)
    assert.equal(corner, undefined, 'угол занимает клетка вертикальной ветки, а не лишняя')

    // Угол — это верхний конвейер вертикальной ветки: в него отдаёт горизонтальная линия
    const turn = scene.place('conveyor', 6, 5, {rotation: 3})

    assert.equal(turn.blendbits, 1, 'угол')
    assert.equal(turn.blendscly, -1, 'зеркальный: приток слева, а не справа')

    // Прямой участок в середине линии остаётся прямым
    assert.equal(scene.at(4, 5).blendbits, 0)
})

test('лента с двумя притоками рисуется тройником, с тремя — крестом', () => {
    const scene = world()

    // В центральную клетку отдают слева и справа, сама она смотрит вверх
    const middle = scene.place('conveyor', 5, 5, {rotation: 1})

    scene.place('conveyor', 4, 5, {rotation: 0})
    assert.equal(middle.blendbits, 1, 'один приток сбоку — угол')

    scene.place('conveyor', 6, 5, {rotation: 2})
    assert.equal(middle.blendbits, 4, 'два притока по бокам — прямой сверху')

    scene.place('conveyor', 5, 4, {rotation: 1})
    assert.equal(middle.blendbits, 3, 'приток ещё и сзади — со всех сторон')
})

test('снос соседа возвращает ленте прямой вид', () => {
    const scene = world()

    const middle = scene.place('conveyor', 5, 5, {rotation: 1})
    const side = scene.place('conveyor', 4, 5, {rotation: 0})

    assert.equal(middle.blendbits, 1)

    scene.remove(side)
    assert.equal(middle.blendbits, 0, 'сосед исчез — исчез и угол')
})

/** Кладёт предмет в блок от имени соседа, если тот его берёт. */
function give(target, source, item = 'copper') {
    if (!target.acceptItem(source, item)) return false

    target.handleItem(source, item)
    return true
}

/*
 * Приёмники во всех проверках ниже — ленты, а не хранилища: у контейнера сторона два на два,
 * и четыре штуки вокруг одной клетки просто не помещаются. Лента же занимает клетку и по
 * содержимому видна: `line` — это то, что на ней лежит.
 */

test('перекрёсток пропускает две линии насквозь и не смешивает их', () => {
    const scene = world()

    const cross = scene.place('junction', 5, 5)

    const west = scene.place('conveyor', 4, 5, {rotation: 0})
    const east = scene.place('conveyor', 6, 5, {rotation: 0})
    const south = scene.place('conveyor', 5, 4, {rotation: 1})
    const north = scene.place('conveyor', 5, 6, {rotation: 1})

    assert.ok(give(cross, west, 'copper'), 'слева берут')
    assert.ok(give(cross, south, 'lead'), 'снизу берут')

    // 26 тиков — `Junction.speed`; до них предмет ещё внутри
    scene.steps(25)
    assert.equal(east.line.length + north.line.length, 0, 'рано')

    scene.steps(2)

    assert.equal(east.line.length, 1, 'медь вышла с той стороны, куда шла')
    assert.equal(east.line[0].item, 'copper')
    assert.equal(north.line.length, 1, 'свинец ушёл вверх, а не вбок')
    assert.equal(north.line[0].item, 'lead')
})

test('перекрёсток не берёт предмет, когда выхода с той стороны нет', () => {
    const scene = world()

    const cross = scene.place('junction', 5, 5)
    const west = scene.place('conveyor', 4, 5, {rotation: 0})

    assert.ok(!cross.acceptItem(west, 'copper'), 'справа пусто — предмет застрял бы')

    scene.place('conveyor', 6, 5, {rotation: 0})
    assert.ok(cross.acceptItem(west, 'copper'))
})

test('сортировщик пропускает названный предмет насквозь, остальные вбок', () => {
    const scene = world()

    const sorter = scene.place('sorter', 5, 5, {sortItem: 'copper'})
    const source = scene.place('conveyor', 4, 5, {rotation: 0})

    const ahead = scene.place('conveyor', 6, 5, {rotation: 0})
    const side = scene.place('conveyor', 5, 6, {rotation: 1})

    assert.ok(give(sorter, source, 'copper'))
    assert.equal(ahead.line.length, 1, 'свой предмет идёт прямо')

    assert.ok(give(sorter, source, 'lead'))
    assert.equal(side.line[0].item, 'lead', 'чужой уходит вбок')

    // Сам сортировщик ничего не держит: он только передаёт
    assert.equal(sorter.items, null)
})

test('обратный сортировщик делает наоборот', () => {
    const scene = world()

    const sorter = scene.place('inverted-sorter', 5, 5, {sortItem: 'copper'})
    const source = scene.place('conveyor', 4, 5, {rotation: 0})

    const ahead = scene.place('conveyor', 6, 5, {rotation: 0})
    const side = scene.place('conveyor', 5, 6, {rotation: 1})

    assert.ok(give(sorter, source, 'copper'))
    assert.equal(side.line[0].item, 'copper', 'названный предмет уходит вбок')

    assert.ok(give(sorter, source, 'lead'))
    assert.equal(ahead.line[0].item, 'lead', 'остальные идут прямо')
})

test('сортировщик чередует стороны, когда берут обе', () => {
    const scene = world()

    const sorter = scene.place('sorter', 5, 5, {sortItem: 'copper'})
    const source = scene.place('conveyor', 4, 5, {rotation: 0})

    const up = scene.place('conveyor', 5, 6, {rotation: 1})
    const down = scene.place('conveyor', 5, 4, {rotation: 3})

    assert.ok(give(sorter, source, 'lead'))
    assert.ok(give(sorter, source, 'lead'))

    assert.equal(up.line.length, 1, 'по одному на сторону, а не оба в одну')
    assert.equal(down.line.length, 1)
})

test('ворота переполнения пускают вбок только когда впереди не берут', () => {
    const scene = world()

    const gate = scene.place('overflow-gate', 5, 5)
    const source = scene.place('conveyor', 4, 5, {rotation: 0})

    const ahead = scene.place('conveyor', 6, 5, {rotation: 0})
    const side = scene.place('conveyor', 5, 6, {rotation: 1})

    assert.ok(give(gate, source, 'copper'))
    assert.equal(ahead.line.length, 1, 'пока берут впереди — идёт прямо')
    assert.equal(side.line.length, 0)

    /*
     * Тик спустя лента впереди уже занята: `minitem` считается в её такте, и до тех пор
     * она о принятом предмете не знает — в игре ровно так же.
     */
    scene.step()

    assert.ok(!ahead.acceptItem(gate, 'copper'), 'впереди голова ленты ещё в начале')
    assert.ok(give(gate, source, 'copper'))
    assert.equal(side.line.length, 1, 'впереди занято — ушло вбок')
})

test('ворота недополнения пускают прямо только когда по бокам не берут', () => {
    const scene = world()

    const gate = scene.place('underflow-gate', 5, 5)
    const source = scene.place('conveyor', 4, 5, {rotation: 0})

    const ahead = scene.place('conveyor', 6, 5, {rotation: 0})
    const side = scene.place('conveyor', 5, 6, {rotation: 1})

    assert.ok(give(gate, source, 'copper'))
    assert.equal(side.line.length, 1, 'сначала вбок')

    scene.remove(side)

    assert.ok(give(gate, source, 'copper'))
    assert.equal(ahead.line.length, 1, 'по бокам никого — тогда прямо')
})

test('источник песочницы выдаёт предмет сто раз в секунду и ничего не копит', () => {
    const scene = world()

    const source = scene.place('item-source', 5, 5, {outputItem: 'copper'})
    const belt = scene.place('conveyor', 6, 5, {rotation: 0})

    // `ItemSource.itemsPerSecond` — сто, то есть предмет каждые 0.6 тика
    scene.steps(2)

    assert.ok(belt.line.length > 0, 'лента уже приняла')
    assert.equal(source.items?.get('copper') ?? 0, 0, 'у самого источника не остаётся ничего')
    assert.ok(!source.acceptItem(belt, 'copper'), 'источник ничего не принимает')
})

test('ненастроенный источник не выдаёт ничего', () => {
    const scene = world()

    scene.place('item-source', 5, 5)
    const belt = scene.place('conveyor', 6, 5, {rotation: 0})

    scene.steps(60)
    assert.equal(belt.line.length, 0)
})

test('яма песочницы принимает что угодно и не хранит', () => {
    const scene = world()

    const belt = scene.place('conveyor', 4, 5, {rotation: 0})
    const pit = scene.place('item-void', 5, 5)

    assert.ok(pit.acceptItem(belt, 'copper'))
    assert.ok(pit.acceptItem(belt, 'thorium'))

    pit.handleItem(belt, 'thorium')

    assert.equal(pit.items, null, 'содержимого у ямы нет вовсе')
    assert.equal(pit.consumed, 1)

    // Выключенная яма ничего не берёт: `ItemVoid.acceptItem` возвращает `enabled`
    pit.enabled = false
    assert.ok(!pit.acceptItem(belt, 'copper'))
})

test('источник кормит сортировщик, а яма забирает лишнее', () => {
    const scene = world()

    scene.place('item-source', 4, 5, {outputItem: 'copper'})

    const sorter = scene.place('sorter', 5, 5, {sortItem: 'copper'})
    const ahead = scene.place('conveyor', 6, 5, {rotation: 0})
    const pit = scene.place('item-void', 5, 6)

    scene.steps(30)

    assert.ok(ahead.line.length > 0, 'медь идёт насквозь')
    assert.equal(pit.consumed, 0, 'вбок ничего не ушло: у источника только медь')

    assert.ok(sorter.configItem === 'copper')
})
