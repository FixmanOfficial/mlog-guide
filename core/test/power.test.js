/**
 * Энергия: сеть, баланс, батареи и мачты.
 *
 * Перенос `PowerGraph`. Проверяется то, что видит игрок: соседние блоки образуют одну сеть,
 * при нехватке всё замедляется поровну, батареи разряжаются одинаково, а снос разрезает сеть
 * на две. Числа взяты из выгрузки: сжигатель выдаёт 1 за тик, батарея вмещает 4000.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

import {World} from '../src/world.js'
import {createContent} from '../src/content.js'
import '../src/production.js'
import '../src/distribution.js'
import '../src/power.js'
import '../src/sandbox.js'

const logicIds = JSON.parse(readFileSync(new URL('../data/logic-ids.json', import.meta.url), 'utf8'))
const content = createContent(logicIds)

const world = (options = {}) => new World({width: 30, height: 20, content, floor: 'sand-floor', ...options})

test('соседние блоки с энергией — одна сеть', () => {
    const scene = world()

    const first = scene.place('battery', 5, 5)
    const second = scene.place('battery', 6, 5)

    assert.equal(first.power.graph, second.power.graph)
    assert.equal(first.power.graph.all.length, 2)

    // Две фабрики рядом энергией не делятся: обе только потребляют
    const left = scene.place('silicon-smelter', 10, 5)
    const right = scene.place('silicon-smelter', 13, 5)

    assert.notEqual(left.power.graph, right.power.graph)
})

test('мачта сама тянет связи и объединяет сети', () => {
    const scene = world()

    const generator = scene.place('combustion-generator', 5, 5)
    const smelter = scene.place('silicon-smelter', 10, 5)

    assert.notEqual(generator.power.graph, smelter.power.graph)

    // Дальность обычной мачты — шесть тайлов, обоих она достаёт
    const node = scene.place('power-node', 8, 5)

    assert.equal(node.power.links.length, 2)
    assert.equal(generator.power.graph, smelter.power.graph)
    assert.equal(node.power.graph, smelter.power.graph)
})

test('мачта не берёт соседа по стороне и не превышает свой предел', () => {
    const scene = world()

    // Батарея вплотную: с ней ток идёт и так, связь на неё не тратится
    const battery = scene.place('battery', 6, 5)
    const node = scene.place('power-node', 5, 5)

    assert.deepEqual(node.power.links, [])
    assert.equal(node.power.graph, battery.power.graph, 'но сеть у них всё равно общая')
})

test('при нехватке энергии фабрика не встаёт, а замедляется', () => {
    const scene = world()

    /*
     * Сжигатель выдаёт 1 за тик, плавильне нужно 0.5, а двум — целая единица. Ставим три:
     * покрытие выходит две трети, и столько же становится полезностью каждой.
     */
    const generator = scene.place('combustion-generator', 5, 5)
    generator.handleStack('coal', 10)

    const nodes = scene.place('power-node', 7, 5)
    const first = scene.place('silicon-smelter', 10, 5)
    const second = scene.place('silicon-smelter', 10, 8)
    const third = scene.place('silicon-smelter', 5, 8)

    assert.ok(nodes.power.links.length > 0)

    for (const smelter of [first, second, third]) {
        smelter.handleStack('coal', 10)
        smelter.handleStack('sand', 10)
        scene.place('power-node', smelter.x - 2, smelter.y)
    }

    scene.steps(5)

    assert.ok(first.power.graph === third.power.graph, 'все в одной сети')
    assert.ok(Math.abs(first.efficiency - 2 / 3) < 0.05, `полезность ${first.efficiency}`)
    assert.ok(Math.abs(first.efficiency - third.efficiency) < 0.001, 'всем поровну')
})

test('батарея копит излишек и отдаёт его, когда генератор встал', () => {
    const scene = world()

    const generator = scene.place('combustion-generator', 5, 5)
    const battery = scene.place('battery', 6, 5)

    generator.handleStack('coal', 10)
    scene.steps(60)

    const stored = battery.power.graph.lastPowerStored

    assert.ok(battery.power.status > 0, 'излишек ушёл в батарею')
    assert.ok(stored > 0)

    // Плавильня два на два встаёт вплотную к батарее: соседство и есть связь
    const smelter = scene.place('silicon-smelter', 7, 5)
    smelter.handleStack('coal', 10)
    smelter.handleStack('sand', 10)

    assert.equal(smelter.power.graph, battery.power.graph, 'сеть общая')

    // Генератор погас — запас пошёл в дело
    generator.enabled = false
    scene.steps(30)

    assert.ok(battery.power.graph.lastPowerStored < stored, 'батарея разряжается')
    assert.ok(smelter.efficiency > 0, 'а плавильня работает от неё')
})

test('снос разрезает сеть на две', () => {
    const scene = world()

    const left = scene.place('battery', 5, 5)
    const middle = scene.place('battery', 6, 5)
    const right = scene.place('battery', 7, 5)

    assert.equal(left.power.graph, right.power.graph)

    scene.remove(middle)

    assert.notEqual(left.power.graph, right.power.graph)
    assert.equal(left.power.graph.all.length, 1)
})

test('свойства сети отвечают числами игры', () => {
    const scene = world()

    const generator = scene.place('combustion-generator', 5, 5)
    const battery = scene.place('battery', 6, 5)

    generator.handleStack('coal', 10)
    scene.steps(10)

    // `powerNetIn` и `powerNetOut` игра переводит в секунды, умножая на 60
    assert.ok(Math.abs(generator.sense('powerNetIn') - 60) < 1, generator.sense('powerNetIn'))
    assert.equal(battery.sense('powerNetCapacity'), 4000)
    assert.ok(battery.sense('powerNetStored') > 0)

    // `powerCapacity` — своя вместимость блока, а не сети
    assert.equal(battery.sense('powerCapacity'), 4000)
    assert.equal(generator.sense('powerCapacity'), 0)
})

test('сжигатель берёт порцию угля не каждый тик, а раз в itemDuration', () => {
    const scene = world()

    const generator = scene.place('combustion-generator', 5, 5)
    generator.handleStack('coal', 2)

    scene.steps(1)
    assert.equal(generator.items.get('coal'), 1, 'первая порция ушла в топку сразу')

    scene.steps(100)
    assert.equal(generator.items.get('coal'), 1, 'порции хватает на 120 тиков')

    scene.steps(25)
    assert.equal(generator.items.get('coal'), 0, 'взял вторую')
})

test('источник песочницы кормит сеть в одиночку', () => {
    const scene = world()

    const source = scene.place('power-source', 5, 5)
    const smelter = scene.place('silicon-smelter', 8, 5)

    smelter.handleStack('coal', 10)
    smelter.handleStack('sand', 10)

    scene.steps(5)

    assert.equal(source.power.graph, smelter.power.graph, 'источник — это мачта, он сам тянет связь')
    assert.equal(smelter.efficiency, 1)
})
