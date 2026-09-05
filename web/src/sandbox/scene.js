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

import logicIds from '@mlog/core/data/logic-ids.json'

export const content = createContent(logicIds)

export function createScene() {
    const world = new World({width: 20, height: 11})

    const display = world.add('logic-display', {x: 15, y: 7})
    const cell = world.add('memory-cell', {x: 4, y: 3})
    const message = world.add('message', {x: 7, y: 3})
    const toggle = world.add('switch', {x: 4, y: 8})
    const door = world.add('door', {x: 7, y: 8})

    // Рисующий процессор стоит у дисплея, считающий — у памяти и тумблера
    const painter = world.add('logic-processor', {x: 11, y: 7})
    const counter = world.add('micro-processor', {x: 5, y: 5})

    const processors = [
        {building: painter, links: [display, cell]},
        {building: counter, links: [cell, message, toggle, door]}
    ]

    return {world, display, cell, message, toggle, door, processors}
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
        ipt: entry.building.spec.ipt
    })

    entry.building.processor = processor
    scene.world.processors = scene.processors
        .map(item => item.building.processor)
        .filter(item => item !== undefined)

    return processor
}
