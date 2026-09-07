/**
 * Сцена страницы: берёт описание и собирает по нему мир.
 *
 * Сборка живёт в ядре (`core/src/scene.js`) и ничего не знает про страницу; здесь остаётся
 * то, что без страницы не имеет смысла, — машина процессора и удобные ссылки на блоки,
 * которые песочница показывает отдельно: дисплей, блок сообщений, тумблер.
 */

import {Processor} from '@mlog/core/src/vm.js'
import {createContent} from '@mlog/core/src/content.js'
import {buildScene} from '@mlog/core/src/scene.js'

import logicIds from '@mlog/core/data/logic-ids.json'

import {SANDBOX} from './scenes/sandbox.js'

export const content = createContent(logicIds)

/**
 * Собирает сцену по описанию. По умолчанию — та, что стоит на странице песочницы;
 * урок передаёт своё описание и получает такую же сцену со своей картой и своими целями.
 */
export function createScene(description = SANDBOX) {
    const {world, processors} = buildScene(description, {content})

    return {
        world,
        processors,

        /*
         * Эти блоки странице нужны поимённо: дисплей рисуется в свой холст, сообщение
         * показывается текстом, по тумблеру и двери щёлкают мышью. В сцене урока их может
         * не быть вовсе — отсюда `null`, а не `undefined`: страница проверяет наличие.
         */
        display: world.get('display1') ?? null,
        cell: world.get('cell1') ?? null,
        message: world.get('message1') ?? null,
        toggle: world.get('switch1') ?? null,
        door: world.get('door1') ?? null,
        container: world.get('container1') ?? null,
        core: world.core(world.rules.defaultTeam)
    }
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
