/**
 * Примеры уроков прогоняются как тесты.
 *
 * Урок называет числа вслух: «в контейнере 160 предметов», «координата 6.5», «у подбитой
 * турели 120 из 250». Пока эти числа считает симуляция, а пишет их человек, они разойдутся —
 * вопрос только когда. Поэтому каждая сцена примера здесь запускается, и утверждения урока
 * проверяются по именам переменных.
 *
 * Тест живёт в `web`, а не в `core`: сцены — часть курса, а не движка.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import {buildScene} from '@mlog/core/src/scene.js'
import {createContent} from '@mlog/core/src/content.js'
import {Processor} from '@mlog/core/src/vm.js'
import logicIds from '@mlog/core/data/logic-ids.json' with {type: 'json'}

import {BUILDINGS, ITEMS, UNITS, HOLDERS} from '../src/course/scenes/sensor.js'
import {VALUES, EMPTINESS, PROCESSOR} from '../src/course/scenes/basics.js'

const content = createContent(logicIds)

/**
 * Собирает сцену, крутит мир и отдаёт переменные первого процессора.
 *
 * Тиков берётся с запасом: программы примеров короткие, а у микропроцессора две инструкции
 * за тик — за двадцать тиков любая из них проходит целиком не раз.
 */
function run(description, ticks = 20) {
    const {world, processors} = buildScene(description, {content})

    for (const entry of processors) {
        entry.building.processor = new Processor(entry.program, {
            links: entry.links,
            world,
            content,
            globals: content.globals,
            ipt: entry.building.spec.ipt,
            building: entry.building,
            team: entry.building.team
        })
    }

    world.processors = processors.map(entry => entry.building.processor)
    for (let i = 0; i < ticks; i++) world.step()

    const processor = processors[0].building.processor
    assert.deepEqual(processor.diagnostics, [], 'программа примера собирается без замечаний')

    return processor
}

/** Число из переменной, как его показывает таблица примера. */
const num = (processor, name) => processor.get(name).numval

/** Объект из переменной: контент, здание или null. */
const obj = (processor, name) => processor.get(name).objval

test('урок «Как работает процессор»: скорость микропроцессора и круг из двух инструкций', () => {
    const processor = run(PROCESSOR, 60)

    assert.equal(num(processor, 'скорость'), 2)

    /*
     * Две инструкции за такт при программе из двух инструкций — круг в такт, то есть около
     * шестидесяти кругов в секунду. Ровно шестьдесят не выходит: накопитель начинается
     * с нуля, и первый круг достаётся не полностью. Урок так и говорит — «около».
     */
    assert.ok(Math.abs(num(processor, 'кругов') - 60) <= 1, num(processor, 'кругов'))
})

test('урок «Как работает процессор»: счётчик обходит две строки и уходит за последнюю', () => {
    const processor = run(PROCESSOR, 0)
    const counters = []

    for (let i = 0; i < 4; i++) {
        processor.step()
        counters.push(processor.counter.numval)
    }

    assert.deepEqual(counters, [1, 2, 1, 2])
})

test('урок «Число, объект и пустота»: у значения есть вид, и он приходит со значением', () => {
    const processor = run(VALUES)

    assert.equal(processor.get('число').isobj, false)
    assert.equal(processor.get('текст').objval, 'медь')
    assert.equal(processor.get('предмет').objval, content.find('copper'))
    assert.equal(processor.get('пусто').objval, null)
})

test('урок «Число, объект и пустота»: пустота считается нулём, объект — единицей', () => {
    const processor = run(EMPTINESS)

    assert.equal(num(processor, 'равно'), 1)
    assert.equal(num(processor, 'строго'), 0)
    assert.equal(num(processor, 'сумма'), 1)

    // Любой объект в арифметике это единица: LVar.num
    assert.equal(num(processor, 'объектПлюсОдин'), 2)
})

test('урок «Предметы и пустота»: у типа блока предметом спрашивают цену', () => {
    const processor = run({
        ...ITEMS,
        processors: [{
            ...ITEMS.processors[0],
            program: ['sensor титан @vault @titanium', 'sensor медь @vault @copper'].join('\n')
        }]
    })

    assert.equal(num(processor, 'титан'), 250)
    assert.equal(num(processor, 'медь'), 0)
})

test('урок «Свойства зданий»: контейнер отвечает теми числами, что названы в тексте', () => {
    const processor = run(BUILDINGS)

    assert.equal(num(processor, 'всего'), 160)
    assert.equal(num(processor, 'предел'), 300)
    assert.equal(num(processor, 'здоровье'), 220)

    // @type отдаёт объект блока — тот же, что константа @container
    assert.equal(obj(processor, 'тип'), content.find('container'))
})

test('урок «Свойства зданий»: у блока два на два координата с половиной', () => {
    const processor = run({
        ...BUILDINGS,
        processors: [{
            ...BUILDINGS.processors[0],
            program: 'sensor x container1 @x\nsensor y container1 @y\nsensor размер container1 @size'
        }]
    })

    assert.equal(num(processor, 'x'), 6.5)
    assert.equal(num(processor, 'y'), 3.5)
    assert.equal(num(processor, 'размер'), 2)
})

test('урок «Предметы и пустота»: ноль, пустота и объект предмета — три разных ответа', () => {
    const processor = run(ITEMS)

    assert.equal(num(processor, 'медь'), 220)

    // Кремния нет, но предмет такой бывает — ответ ноль, а не пустота
    assert.equal(num(processor, 'кремний'), 0)
    assert.equal(processor.get('кремний').isobj, false)

    // Жидкости хранилище не держит вовсе — вот это уже пустота
    assert.equal(processor.get('вода').isobj, true)
    assert.equal(obj(processor, 'вода'), null)

    assert.equal(obj(processor, 'первый'), content.find('copper'))
})

test('урок «Предметы и пустота»: пустота равна нулю, пока не спросить строго', () => {
    const processor = run({
        ...ITEMS,
        processors: [{
            ...ITEMS.processors[0],
            program: [
                'sensor вода vault1 @water',
                'op equal равно вода 0',
                'op strictEqual строго вода 0',
                'op add сумма вода 1'
            ].join('\n')
        }]
    })

    assert.equal(num(processor, 'равно'), 1)
    assert.equal(num(processor, 'строго'), 0)
    assert.equal(num(processor, 'сумма'), 1)
})

test('урок «Свойства юнитов»: координаты в клетках, тип объектом', () => {
    const processor = run(UNITS)

    assert.equal(num(processor, 'x'), 8)
    assert.equal(num(processor, 'y'), 5)
    assert.equal(num(processor, 'летит'), 1)
    assert.equal(obj(processor, 'тип'), content.find('poly'))
    assert.ok(num(processor, 'здоровье') > 0)
})

test('урок «Свойства юнитов»: один ubind ещё не делает процессор командиром', () => {
    const processor = run({
        ...UNITS,
        processors: [{
            ...UNITS.processors[0],
            program: 'ubind @poly\nsensor кем @unit @controlled'
        }]
    })

    assert.equal(num(processor, 'кем'), 0)
})

test('урок «Свойство есть не у каждого»: тип отвечает о чертеже, здание — о себе', () => {
    const processor = run(HOLDERS)

    assert.equal(num(processor, 'полное'), 250)
    assert.equal(num(processor, 'текущее'), 120)
    assert.equal(num(processor, 'памятьЯчейки'), 64)

    // У маршрутизатора памяти нет вовсе: не ноль, а пустота
    assert.equal(obj(processor, 'памятьМаршрута'), null)
})
