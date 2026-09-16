/**
 * Производство: бур копает, фабрика варит, предметы едут к соседям.
 *
 * Числа взяты не с потолка: `drillTime` у механического бура 600, поправка на твёрдость 50,
 * медь твёрдостью 1 — значит 650 тиков на предмет, делённые на число рудных клеток.
 * Всё это лежит в выгрузке, а формулы перенесены из `Drill.updateTile`
 * и `GenericCrafter.updateTile`.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

import {World} from '../src/world.js'
import {createContent} from '../src/content.js'
import {edgeOffsets} from '../src/edges.js'
import '../src/production.js'

const logicIds = JSON.parse(readFileSync(new URL('../data/logic-ids.json', import.meta.url), 'utf8'))
const content = createContent(logicIds)

/** Мир с камнем и рудой там, где просят: камень сам по себе ничего не роняет. */
function setup({ore = [], width = 16, height = 10, floor = 'stone'} = {}) {
    const world = new World({width, height, content, floor})
    for (const [x, y, type = 'ore-copper'] of ore) world.setOverlay(x, y, type)

    return world
}

test('соседи обходятся в порядке игры: по углу от оси X', () => {
    // Edges.java:29-40 — точки складываются четвёрками и сортируются по Mathf.angle
    assert.deepEqual(edgeOffsets(1), [
        {x: 1, y: 0}, {x: 0, y: 1}, {x: -1, y: 0}, {x: 0, y: -1}
    ])

    // У блока два на два точек восемь, и первая — та, что правее центра
    assert.equal(edgeOffsets(2).length, 8)
    assert.deepEqual(edgeOffsets(2)[0], {x: 2, y: 0})
})

test('бур выбирает то, чего под ним больше', () => {
    const world = setup({ore: [[3, 3], [4, 3], [3, 4, 'ore-lead']]})
    const drill = world.add('mechanical-drill', {x: 3, y: 3})

    assert.equal(drill.dominantItem, 'copper')
    assert.equal(drill.dominantItems, 2)
})

test('бур не берёт руду не по зубам', () => {
    // Титан твёрдостью 3, у механического бура tier 2 — не его работа
    const world = setup({ore: [[3, 3, 'ore-titanium'], [4, 3, 'ore-titanium']]})
    const drill = world.add('mechanical-drill', {x: 3, y: 3})

    assert.equal(drill.dominantItem, null)

    const better = world.add('laser-drill', {x: 8, y: 3})
    world.setOverlay(8, 3, 'ore-titanium')
    better.countOre()

    assert.equal(better.dominantItem, 'titanium')
})

test('пол под буром тоже руда, если он что-то роняет', () => {
    // Tile.drop(): нет наложения — считается itemDrop самого пола. У песка это песок
    const world = setup({floor: 'sand-floor'})
    const drill = world.add('mechanical-drill', {x: 3, y: 3})

    assert.equal(drill.dominantItem, 'sand')
    assert.equal(drill.dominantItems, 4)
})

test('время на предмет считается по твёрдости, а скорость — по числу клеток', () => {
    const world = setup({ore: [[3, 3], [4, 3], [3, 4], [4, 4]]})
    const drill = world.add('mechanical-drill', {x: 3, y: 3})

    // Drill.getDrillTime: (600 + 50 * 1) / 1
    assert.equal(drill.drillTime('copper'), 650)

    world.steps(1800)

    /*
     * За тик прибавляется `dominantItems`, то есть четыре: 1800 * 4 / 650 ≈ 11 предметов.
     * Минус прогрев, который занимает первые полторы секунды.
     */
    const mined = [...drill.items.values()].reduce((sum, value) => sum + value, 0)
    assert.ok(mined >= 10 && mined <= 11, `добыто ${mined}`)
})

test('бур отдаёт добытое соседу, а не копит у себя', () => {
    const world = setup({ore: [[3, 3], [4, 3], [3, 4], [4, 4]]})
    const drill = world.add('mechanical-drill', {x: 3, y: 3})
    const container = world.add('container', {x: 5, y: 3})

    assert.deepEqual(drill.proximity.map(building => building.name), ['container1'])

    world.steps(1800)

    assert.equal(drill.items.get('copper') ?? 0, 0)
    assert.ok((container.items.get('copper') ?? 0) >= 10)
})

test('склад берёт что угодно, а фабрика — только своё сырьё', () => {
    const world = setup()
    const container = world.add('container', {x: 3, y: 3})
    const press = world.add('graphite-press', {x: 8, y: 3})

    assert.equal(container.acceptItem(null, 'titanium'), true)
    assert.equal(press.acceptItem(null, 'coal'), true)
    assert.equal(press.acceptItem(null, 'titanium'), false)
})

test('фабрика съедает сырьё по рецепту и выдаёт готовое', () => {
    const world = setup()
    const press = world.add('graphite-press', {x: 3, y: 3})

    press.handleStack('coal', 10)
    world.steps(600)

    // Рецепт: два угля за девяносто тиков дают графит. GenericCrafter
    assert.equal(press.items.get('coal'), 0)
    assert.equal(press.items.get('graphite'), 5)
})

test('фабрика ждёт, когда готовому некуда деться', () => {
    const world = setup()
    const press = world.add('graphite-press', {x: 3, y: 3})

    press.handleStack('coal', 100)
    world.steps(6000)

    // Вместимость десять: дальше фабрика стоит, а уголь остаётся нетронутым
    assert.equal(press.items.get('graphite'), press.spec.itemCapacity)
    assert.ok((press.items.get('coal') ?? 0) > 0)
})

test('`sensor @progress` у фабрики — доля, у бура — накопленное время', () => {
    const world = setup({ore: [[3, 3], [4, 3], [3, 4], [4, 4]]})
    const drill = world.add('mechanical-drill', {x: 3, y: 3})
    const press = world.add('graphite-press', {x: 8, y: 3})

    press.handleStack('coal', 10)
    world.steps(60)

    // GenericCrafter: доля от нуля до единицы
    assert.ok(press.sense('progress') > 0 && press.sense('progress') <= 1)

    // Drill.sense: тут это тики, а не доля, и число заметно больше единицы
    assert.ok(drill.sense('progress') > 1, drill.sense('progress'))
})

test('`@firstItem` у бура — то, что он копает, даже когда внутри пусто', () => {
    const world = setup({ore: [[3, 3], [4, 3]]})
    const drill = world.add('mechanical-drill', {x: 3, y: 3})

    assert.equal(drill.items.size, 0)
    assert.equal(drill.senseObject('firstItem'), content.find('copper'))
})

test('раздача идёт по кругу, а не в первого попавшегося', () => {
    const world = setup()
    const press = world.add('graphite-press', {x: 4, y: 4})

    const first = world.add('container', {x: 6, y: 4})
    const second = world.add('container', {x: 2, y: 4})

    press.handleStack('graphite', 4)

    press.dump('graphite')
    press.dump('graphite')

    // BuildingComp.dump: `cdump` двигается после каждой отдачи, поэтому соседи чередуются
    assert.equal(first.items.get('graphite') ?? 0, 1)
    assert.equal(second.items.get('graphite') ?? 0, 1)
})

test('сброс мира возвращает буру и поворот сверла', () => {
    // Перемотка — это сброс и прогон заново: всё, что рисуется, должно вернуться к началу
    const world = setup({ore: [[3, 3], [4, 3], [3, 4], [4, 4]]})
    const drill = world.add('mechanical-drill', {x: 3, y: 3})

    world.steps(200)
    assert.ok(drill.timeDrilled > 0)

    world.reset()
    assert.equal(drill.timeDrilled, 0)
})
