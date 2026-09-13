/**
 * Перевод координат мира в пиксели холста. Ошибиться здесь легко: у мира ось Y смотрит вверх,
 * у холста вниз, а размеры игра считает в мировых единицах, которых восемь на тайл.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import {World} from '@mlog/core/src/world.js'
import {UNIT_SPECS} from '@mlog/core/src/unit.js'
import unitSprites from '@mlog/core/data/unit-sprites.json' with {type: 'json'}
import terrainSprites from '@mlog/core/data/terrain-sprites.json' with {type: 'json'}
import blockSpecs from '@mlog/core/data/block-specs.json' with {type: 'json'}
import teams from '@mlog/core/data/teams.json' with {type: 'json'}
import pal from '@mlog/core/data/pal.json' with {type: 'json'}

import {WorldView, TILE_UNITS, SPRITE_SCALE, PAL} from '../src/world.js'
import {BACKGROUND} from '../src/display.js'
import blockSprites from '@mlog/core/data/block-sprites.json' with {type: 'json'}

/** Холст-заглушка: виду от него нужен только контекст и стили. */
const fakeCanvas = () => ({
    style: {},
    getContext: () => ({imageSmoothingEnabled: true})
})

const view = (world, tile = 32) => new WorldView(fakeCanvas(), {world, tile})

test('здание рисуется по центру своего тайла, а ось Y переворачивается', () => {
    const world = new World({width: 10, height: 10})
    const building = world.add('memory-cell', {x: 0, y: 0})

    // Нижний левый угол мира — нижний левый угол холста
    assert.deepEqual(view(world).place(building), [16, 320 - 16])
})

test('клик по холсту попадает в тот же тайл', () => {
    const world = new World({width: 10, height: 10})
    const map = view(world)

    assert.deepEqual(map.at(0, 0), {x: 0, y: 9})
    assert.deepEqual(map.at(319, 319), {x: 9, y: 0})
})

test('на мировую единицу приходится восьмая часть тайла', () => {
    const world = new World({width: 4, height: 4})

    assert.equal(view(world, 32).unit, 32 / TILE_UNITS)
})

test('картинка дисплея меньше самого блока', () => {
    // displaySize / 4 мировых единиц против size * 8 у блока: рамка остаётся видна
    const world = new World({width: 10, height: 10})
    const display = world.add('logic-display', {x: 5, y: 5})

    const screen = display.spec.displaySize / SPRITE_SCALE
    assert.equal(screen, 20)
    assert.ok(screen < display.size * TILE_UNITS)
})

test('блок с чётной стороной рисуется по углу тайла', () => {
    // Block.offset: центр смещается на половину тайла, иначе блок 2 на 2 не ложится на сетку
    const world = new World({width: 10, height: 10})
    const processor = world.add('logic-processor', {x: 4, y: 4})

    assert.deepEqual(view(world).place(processor), [4 * 32 + 32, 320 - (4 * 32 + 32)])
})

test('цвета вида на мир взяты из палитры игры', () => {
    // Сверка по именам: `Drawf` рисует подложку Pal.gray, рамку связи Pal.place,
    // круг дальности Pal.accent, а фон дисплея — Pal.darkerMetal
    assert.equal(PAL.gray, pal.colors.gray)
    assert.equal(PAL.place, pal.colors.place)
    assert.equal(PAL.accent, pal.colors.accent)
    assert.equal(PAL.remove, pal.colors.remove)
    assert.equal(BACKGROUND, pal.colors.darkerMetal)
})

test('атлас юнитов держит корпус и накладку команды для каждого юнита', () => {
    const bodies = Object.keys(unitSprites.sprites).filter(name => !name.endsWith('-cell'))

    // У каждой накладки есть корпус: без него её не на что класть
    for (const name of Object.keys(unitSprites.sprites)) {
        if (!name.endsWith('-cell')) continue
        assert.ok(unitSprites.sprites[name.slice(0, -5)] !== undefined, `${name} без корпуса`)
    }

    // Размеры не нулевые и не выходят за атлас
    for (const [name, entry] of Object.entries(unitSprites.sprites)) {
        assert.ok(entry.width > 0 && entry.height > 0, name)
        assert.ok(entry.x + entry.width <= unitSprites.width, name)
        assert.ok(entry.y + entry.height <= unitSprites.height, name)
    }

    // Юниты, которых водит песочница, в атласе есть обязательно
    for (const name of ['poly', 'mono', 'dagger', 'flare']) {
        assert.ok(bodies.includes(name), name)
    }
})

test('цвет команды берётся из таблицы, а не из палитры интерфейса', () => {
    const world = new World({width: 10, height: 10})
    const it = new WorldView(fakeCanvas(), {world, tile: 32, teams})

    assert.equal(it.teamColor(1), '#ffd37f', 'sharded')
    assert.equal(it.teamColor(2), '#f25555', 'crux')
    assert.equal(it.teamColor(0), '#4d4e58', 'derelict')
})

test('юнит занимает на холсте столько же, сколько в игре', () => {
    const world = new World({width: 10, height: 10, content: null})
    world.spawn('poly', {x: 1, y: 1})

    const it = new WorldView(fakeCanvas(), {world, tile: 32, unitSprites})
    const sprite = unitSprites.sprites.poly

    // Draw.scl = 1/4: спрайт вчетверо крупнее мировых единиц, а на тайл их восемь.
    // При 32 пикселях на тайл спрайт выходит один в один со своим разрешением
    const expected = sprite.width / SPRITE_SCALE * it.unit
    assert.equal(expected, sprite.width)

    // И размер юнита в игре не равен спрайту: hitSize это коробка попаданий, она меньше
    assert.ok(UNIT_SPECS.poly.hitSize * it.unit < expected)
})

test('в атласе местности есть все варианты плиток и листы краёв', () => {
    const {sprites} = terrainSprites
    let floors = 0

    for (const [name, spec] of Object.entries(blockSpecs.blocks)) {
        if (!['floor', 'overlay', 'ore', 'staticWall'].includes(spec.kind)) continue

        // Плитка либо одна, либо пронумерованные варианты — как их ищет Floor.load
        const first = spec.variants > 0 ? `${name}1` : name
        if (sprites[first] === undefined) continue

        floors++

        for (let i = 1; i < (spec.variants ?? 0); i++) {
            assert.ok(sprites[`${name}${i + 1}`] !== undefined, `${name}: нет варианта ${i + 1}`)
        }
    }

    assert.ok(floors > 100, `плиток нашлось ${floors}`)
})

test('лист краёв — три плитки на три, как его режет Floor.load', () => {
    const cell = terrainSprites.tile
    const sheets = Object.entries(terrainSprites.sprites).filter(([name]) => name.endsWith('-edge'))

    assert.ok(sheets.length > 40, `листов ${sheets.length}`)

    for (const [name, entry] of sheets) {
        assert.equal(entry.width, cell * 3, name)
        assert.equal(entry.height, cell * 3, name)
    }
})

test('пока атлас местности не загрузился, вид не кеширует пустую картинку', () => {
    const world = new World({width: 4, height: 4})

    // Картинки нет вовсе — рисуется сетка
    assert.equal(new WorldView(fakeCanvas(), {world, tile: 32}).groundReady(), false)

    // Картинка есть, но ещё не готова: complete у неё уже true, а размера нет
    const loading = {complete: true, naturalWidth: 0}
    const view = new WorldView(fakeCanvas(), {world, tile: 32, terrain: loading, terrainSprites})
    assert.equal(view.groundReady(), false)

    loading.naturalWidth = 1024
    assert.equal(view.groundReady(), true)
})

test('у процессора мира круг дальности не рисуется', () => {
    const world = new World({width: 20, height: 20})
    const ordinary = world.add('micro-processor', {x: 2, y: 2})
    const world_ = world.add('world-processor', {x: 5, y: 5})

    for (const building of [ordinary, world_]) building.processor = {links: []}

    const map = view(world)
    const drawn = []
    map.circles = (x, y, radius) => drawn.push(radius)

    map.drawLinks(ordinary)
    assert.equal(drawn.length, 1)

    // Дальность у привилегированного — Float.MAX_VALUE, и число отрезков окружности
    // считается от радиуса: игра такой круг не рисует вовсе, и мы тоже
    map.drawLinks(world_)
    assert.equal(drawn.length, 1, 'привилегированному кругу дальности взяться неоткуда')
})

test('шаг тайла целый при любом увеличении экрана', () => {
    const world = new World({width: 20, height: 11})
    const saved = globalThis.devicePixelRatio

    // Дробный шаг оставляет границы тайлов между физическими пикселями — это и была «сетка»
    for (const ratio of [1, 1.25, 1.3333333730697632, 1.5, 2, 2.75]) {
        globalThis.devicePixelRatio = ratio

        const map = view(world, 40)
        const step = map.tile * map.ratio

        assert.equal(step, Math.round(step), `шаг ${step} при увеличении ${ratio}`)
        assert.equal(map.canvas.width % world.width, 0)
        assert.equal(map.canvas.height % world.height, 0)
    }

    globalThis.devicePixelRatio = saved
})

test('накладка команды берётся своя у команд с палитрой и общая у остальных', () => {
    // Block.init:1519-1522 — своя накладка есть у sharded, crux и malis, у green её нет
    const sprites = blockSprites.sprites

    assert.ok(sprites['vault-team'] !== undefined, 'общая накладка хранилища')
    assert.ok(sprites['vault-team-sharded'] !== undefined, 'накладка сердцевой команды')
    assert.equal(sprites['vault-team-green'], undefined)

    // У блока без накладки её нет ни в каком виде: маршрутизатор рисуется одним спрайтом
    assert.equal(sprites['router-team'], undefined)
})

test('поворот блока считается по-игровому, а не по-холстовому', () => {
    const world = new World({width: 6, height: 6})
    const belt = world.add('conveyor', {x: 2, y: 2, rotation: 1})
    const it = view(world)

    /*
     * `Draw.rect(region, x, y, rotation * 90)` — угол против часовой от оси X. Знак
     * переворачивает уже `rotated`, потому что ось Y холста смотрит вниз. Пока здесь стоял
     * минус, конвейер ехал ровно в обратную сторону от нарисованной на нём стрелки.
     */
    assert.equal(it.blockAngle(belt), 90)

    const still = world.add('router', {x: 4, y: 4})
    assert.equal(it.blockAngle(still), 0)
})

test('текст блока сообщений рисуется под блоком и переносится по словам', () => {
    /*
     * `MessageBlock.drawSelect`: шрифт в четверть, перенос по 90 единицам, подложка
     * с отступом в единицу, пустой блок пишет «<пусто>» серым. В игре это часть выделения,
     * у нас видно всегда — строка про это есть в `docs/parity.md`.
     */
    const world = new World({width: 10, height: 10})
    const message = world.add('message', {x: 4, y: 4})

    const drawn = []
    const canvas = {
        style: {},
        getContext: () => ({
            imageSmoothingEnabled: true,
            // Ширина считается по знакам: настоящего шрифта в ноде нет
            measureText: (line) => ({width: line.length * 6}),
            fillText: (line, x, y) => drawn.push({line, x, y}),
            fillRect: () => {},
            setTransform: () => {},
            save: () => {},
            restore: () => {},
            beginPath: () => {},
            fill: () => {},
            drawImage: () => {}
        })
    }

    const view = new WorldView(canvas, {world, tile: 32})

    // Пустой блок подписан «<пусто>»
    view.drawMessage(message)
    assert.equal(drawn[0].line, '<пусто>')

    // Длинная строка разбивается по словам, а не режется посередине слова
    const wide = view.wrapText('меди в контейнере ровно сто двадцать штук', 60)
    assert.ok(wide.length > 1, 'строка перенеслась')
    assert.ok(wide.every(line => !line.startsWith(' ') && !line.endsWith(' ')), 'без висячих пробелов')
    assert.equal(wide.join(' '), 'меди в контейнере ровно сто двадцать штук')

    // Перевод строки в тексте сохраняется
    assert.deepEqual(view.wrapText('раз' + '\n' + 'два', 90 * view.unit), ['раз', 'два'])
})
