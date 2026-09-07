/**
 * Стартовая сцена песочницы: мир, блоки и процессоры.
 *
 * Процессоров несколько — как в игре, где их ставят пачками и каждый занят своим делом.
 * У каждого свои связи и своя программа; мир крутит их все, а страница показывает выбранный.
 *
 * Пока сцена одна и задана здесь. Когда появится редактор мира, она станет просто первым
 * пресетом: модель для этого готова — мир собирается вызовами `world.add`.
 */

import {World} from '@mlog/core/src/world.js'
import {Processor} from '@mlog/core/src/vm.js'
import {createContent} from '@mlog/core/src/content.js'
import {FlagObjective, TimerObjective, UnitCountObjective} from '@mlog/core/src/objectives.js'
import {Marker} from '@mlog/core/src/markers.js'
import {simplexRaw2d, packColorHex} from '@mlog/core/src/arc.js'

import logicIds from '@mlog/core/data/logic-ids.json'

export const content = createContent(logicIds)

/**
 * Раскладывает местность: пол, руду и статичные стены.
 *
 * Шум тот же, что у генератора карт игры, — `Simplex` из arc, — но карта здесь маленькая
 * и рукотворная: задача не повторить генерацию Серпуло, а дать сцене узнаваемую землю
 * вместо пустоты. Раскладка детерминированная: одинаковый вход, одинаковая карта.
 */
function paintTerrain(world) {
    for (let y = 0; y < world.height; y++) {
        for (let x = 0; x < world.width; x++) {
            const ground = simplexRaw2d(1, x / 9, y / 9)

            // Три пола с разными идентификаторами: у камня он больше, поэтому его край
            // ложится поверх песка, и переход выходит мягким
            world.setFloor(x, y, ground > 0.3 ? 'stone' : ground < -0.25 ? 'sand-floor' : 'darksand')

            // Руда лежит жилами, а не сыпью: частота ниже, порог выше
            const ore = simplexRaw2d(7, x / 5, y / 5)
            if (ore > 0.78) world.setOverlay(x, y, 'ore-copper')
        }
    }

    // Пара скальных выходов по краям: место под ними всё равно ничем не занято
    for (const [x, y] of [[0, 4], [0, 5], [1, 5], [19, 3], [19, 4], [18, 3]]) {
        world.setWall(x, y, 'stone-wall')
        world.setOverlay(x, y, null)
    }
}

/**
 * Цели карты. Условия те же тринадцать, что в редакторе карт игры; здесь взяты три,
 * и каждая закрывается по-своему.
 *
 * Первая выполнена с самого начала — поли на карте есть. Вторая ждёт времени. Третья
 * ждёт **флага**, который поднимает процессор мира, когда поли натаскает на склад меди:
 * это и есть вся связь логики с целями. У неё же своя метка — цель носит метки тех же
 * классов, что `makemarker`, и рисуются они, пока цель работает.
 */
function addObjectives(world) {
    const store = new Marker('shape')
    store.control('pos', 17, 4)
    store.control('radius', 14)
    store.control('shape', 6)
    store.control('color', packColorHex('84f491'))

    /*
     * Текст у флага и таймера свой: строки под них в игре нет, её задаёт карта.
     * У таймера в текст подставляется остаток времени — `{0}`, как в `TimerObjective`.
     */
    world.objectives.add(
        new UnitCountObjective('poly', 1),
        new TimerObjective(60 * 20, {text: '[accent]Продержаться: []{0}'}),
        new FlagObjective('склад', {
            text: '[accent]Натаскать на склад: []10 меди',
            markers: [store]
        })
    )

    return world
}

export function createScene() {
    // Контент миру нужен, чтобы `sensor @unit @type` отдавал @poly, а не строку
    const world = new World({width: 20, height: 11, content, floor: 'darksand'})

    paintTerrain(world)

    const display = world.add('logic-display', {x: 15, y: 7})
    const cell = world.add('memory-cell', {x: 4, y: 3})
    const message = world.add('message', {x: 7, y: 3})
    const toggle = world.add('switch', {x: 4, y: 8})
    const door = world.add('door', {x: 7, y: 8})

    // Рисующий процессор стоит у дисплея, считающий — у памяти и тумблера,
    // а пилот ни к чему не подключён: юнитам связи не нужны, их находит `ubind`
    const painter = world.add('logic-processor', {x: 11, y: 7})
    const counter = world.add('micro-processor', {x: 5, y: 5})
    const pilot = world.add('micro-processor', {x: 1, y: 1})

    // Процессор мира: ставить его в игре нельзя, он появляется только в редакторе карт.
    // Инструкции мира работают лишь у него — `Block.privileged`
    const marker = world.add('world-processor', {x: 13, y: 1})

    // Контейнер, куда поли носит добытое: без него `ucontrol itemDrop` некуда целить
    const container = world.add('container', {x: 17, y: 4})

    // Ядро: по нему HUD показывает запасы команды, а цели читают предметы.
    // Запас начальный — в игре его кладёт карта, а не логика
    const core = world.add('core-shard', {x: 2, y: 8})
    core.handleStack('copper', 1250)
    core.handleStack('lead', 480)
    core.handleStack('graphite', 95)

    // Три юнита разных типов: `ubind` выбирает по типу, и один процессор водит всех.
    // Кинжал наземный и ходит ногами — на нём видно, что шаг считается по пройденному пути
    world.spawn('poly', {x: 4, y: 1})
    world.spawn('mono', {x: 12, y: 9})
    world.spawn('dagger', {x: 10, y: 5})

    const processors = [
        {building: painter, links: [display, cell]},
        {building: counter, links: [cell, message, toggle, door]},
        {building: pilot, links: [container]},
        {building: marker, links: [container]}
    ]

    addObjectives(world)

    return {world, display, cell, message, toggle, door, container, core, processors}
}

/**
 * Собирает процессор и вешает его на здание: рендеру связи видны именно оттуда.
 *
 * Скорость берётся из спеки блока, а не задаётся отдельно: `instructionsPerTick` — свойство
 * процессора, у микро 2, у логического 8, у гипера 25 (`content/Blocks.java:6849-6867`).
 */
export function attachProcessor(scene, entry, code) {
    const processor = new Processor(code, {
        links: entry.links,
        world: scene.world,
        content,
        globals: content.globals,
        ipt: entry.building.spec.ipt,

        // Своё здание и команда нужны `ucontrol`: он записывает юниту, кто им командует
        building: entry.building,
        team: entry.building.team
    })

    entry.building.processor = processor
    scene.world.processors = scene.processors
        .map(item => item.building.processor)
        .filter(item => item !== undefined)

    return processor
}
