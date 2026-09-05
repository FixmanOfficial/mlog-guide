/**
 * Стартовая сцена песочницы: мир, блоки и процессор.
 *
 * Пока сцена одна и задана здесь. Когда появится редактор мира, она станет просто первым
 * пресетом — модель для этого готова: мир собирается вызовами `world.add`, а связи процессора
 * это обычный список зданий.
 */

import {World} from '@mlog/core/src/world.js'
import {Processor} from '@mlog/core/src/vm.js'
import {createContent} from '@mlog/core/src/content.js'

import logicIds from '@mlog/core/data/logic-ids.json'

export const content = createContent(logicIds)

export function createScene() {
    const world = new World({width: 16, height: 9})

    const display = world.add('logic-display', {x: 11, y: 5})
    const cell = world.add('memory-cell', {x: 4, y: 2})
    const message = world.add('message', {x: 6, y: 2})
    const toggle = world.add('switch', {x: 4, y: 6})
    const door = world.add('door', {x: 6, y: 6})
    const processorBuilding = world.add('logic-processor', {x: 8, y: 4})

    const links = [display, cell, message, toggle, door]

    return {world, display, cell, message, toggle, door, processorBuilding, links}
}

/**
 * Собирает процессор и вешает его на здание: рендеру связи видны именно оттуда.
 *
 * Скорость берётся из спеки блока, а не задаётся отдельно: `instructionsPerTick` — свойство
 * процессора, у микро 2, у логического 8, у гипера 25 (`content/Blocks.java:6849-6867`).
 * Поменяется блок в сцене — поменяется и скорость.
 */
export function attachProcessor(scene, code) {
    const processor = new Processor(code, {
        links: scene.links,
        world: scene.world,
        content,
        globals: content.globals,
        ipt: scene.processorBuilding.spec.ipt
    })

    scene.processorBuilding.processor = processor
    scene.world.processors = [processor]

    return processor
}
