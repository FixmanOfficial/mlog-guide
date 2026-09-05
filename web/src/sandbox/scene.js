/**
 * Стартовая сцена песочницы: мир, блоки и процессор.
 *
 * Пока сцена одна и задана здесь. Когда появится редактор мира, она станет просто первым
 * пресетом — модель для этого готова: мир собирается вызовами `world.add`, а связи процессора
 * это обычный список зданий.
 */

import {World} from '@mlog/core/src/world.js'
import {Processor, IPT} from '@mlog/core/src/vm.js'
import {createContent} from '@mlog/core/src/content.js'

import logicIds from '@mlog/core/data/logic-ids.json'

export const content = createContent(logicIds)

/** Программа, с которой открывается песочница. */
export const STARTER = `set x 0
op add x x 1
op mod y x 80
draw clear 0 0 0
draw color 255 210 120 255
draw rect y 30 12 12
drawflush display1
print "тик: "
print @tick
printflush message1
write x cell1 0`

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

/** Собирает процессор и вешает его на здание: рендеру связи видны именно оттуда. */
export function attachProcessor(scene, code) {
    const processor = new Processor(code, {
        links: scene.links,
        world: scene.world,
        content,
        globals: content.globals,
        ipt: IPT.logic
    })

    scene.processorBuilding.processor = processor
    scene.world.processors = [processor]

    return processor
}
