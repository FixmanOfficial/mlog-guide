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
import {VALUES, EMPTINESS, PROCESSOR, EDITOR} from '../src/course/scenes/basics.js'
import {
    ARITHMETIC, STEPS, INTEGERS, ROUNDING, PRECISION, LOGIC, NEGATION, BITWISE, SHIFTS,
    GEOMETRY, FLOAT, RANDOM, NOISE
} from '../src/course/scenes/op.js'

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

test('урок «Число, объект и null»: у значения есть вид, и он приходит со значением', () => {
    const processor = run(VALUES)

    assert.equal(processor.get('число').isobj, false)
    assert.equal(processor.get('текст').objval, 'медь')
    assert.equal(processor.get('предмет').objval, content.find('copper'))
    assert.equal(processor.get('безЗначения').objval, null)
})

test('урок «Число, объект и null»: null считается нулём, объект — единицей', () => {
    const processor = run(EMPTINESS)

    assert.equal(num(processor, 'равно'), 1)
    assert.equal(num(processor, 'строго'), 0)
    assert.equal(num(processor, 'сумма'), 1)

    // Любой объект в арифметике это единица: LVar.num
    assert.equal(num(processor, 'объектПлюсОдин'), 2)
})

test('урок «Предметы и null»: у типа блока предметом запрашивают цену', () => {
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

test('урок «Предметы и null»: ноль, null и объект предмета — три разных ответа', () => {
    const processor = run(ITEMS)

    assert.equal(num(processor, 'медь'), 220)

    // Кремния нет, но предмет такой бывает — ответ ноль, а не null
    assert.equal(num(processor, 'кремний'), 0)
    assert.equal(processor.get('кремний').isobj, false)

    // Жидкости хранилище не держит вовсе — вот это уже null
    assert.equal(processor.get('вода').isobj, true)
    assert.equal(obj(processor, 'вода'), null)

    assert.equal(obj(processor, 'первый'), content.find('copper'))
})

test('урок «Предметы и null»: null равен нулю, пока не сравнить строго', () => {
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

    // У маршрутизатора памяти нет вовсе: не ноль, а null
    assert.equal(obj(processor, 'памятьМаршрута'), null)
})

test('урок «Арифметика»: четыре действия над 12 и 5', () => {
    const processor = run(ARITHMETIC)

    assert.equal(num(processor, 'сумма'), 17)
    assert.equal(num(processor, 'разность'), 7)
    assert.equal(num(processor, 'произведение'), 60)

    // Урок отдельно говорит, что деление обычное: 12 на 5 это 2.4, а не 2
    assert.equal(num(processor, 'частное'), 2.4)
})

test('урок «Арифметика»: деление на ноль даёт не бесконечность, а null', () => {
    const processor = run({
        ...ARITHMETIC,
        processors: [{
            ...ARITHMETIC.processors[0],
            program: ['set a 12', 'set b 0', 'op div частное a b', 'op add потом частное 1'].join('\n')
        }]
    })

    // `LVar.setnum`: бесконечность хранению не подлежит, переменная становится объектом null
    assert.equal(processor.get('частное').isobj, true)
    assert.equal(processor.get('частное').objval, null)

    // И дальше он считается нулём — ровно это урок и обещает в задании
    assert.equal(num(processor, 'потом'), 1)
})

test('урок «Арифметика»: сложное выражение разворачивается в две строки', () => {
    const processor = run(STEPS)

    assert.equal(num(processor, 'сумма'), 17)
    assert.equal(num(processor, 'итог'), 34)
})

test('урок «Целые и точность»: idiv округляет вниз, а знак mod идёт от делимого', () => {
    const processor = run(INTEGERS)

    assert.equal(num(processor, 'точно'), 3.5)
    assert.equal(num(processor, 'целое'), 3)
    assert.equal(num(processor, 'остаток'), 1)

    // Два числа, ради которых урок и написан
    assert.equal(num(processor, 'вниз'), -4)
    assert.equal(num(processor, 'знак'), -1)
    assert.equal(num(processor, 'всегда'), 2)
})

test('урок «Целые и точность»: round отправляет половину вверх', () => {
    const processor = run(ROUNDING)

    assert.equal(num(processor, 'вниз'), 3)
    assert.equal(num(processor, 'вверх'), 4)
    assert.equal(num(processor, 'ближе'), 3)
})

test('урок «Целые и точность»: equal прощает хвост дроби, strictEqual — нет', () => {
    const processor = run(PRECISION)

    assert.equal(num(processor, 'сумма'), 0.30000000000000004)
    assert.equal(num(processor, 'равно'), 1)
    assert.equal(num(processor, 'строго'), 0)
})

test('урок «Целые и точность»: сто предметов по тридцать, и то же самое в минусе', () => {
    const processor = run({
        ...INTEGERS,
        processors: [{
            ...INTEGERS.processors[0],
            program: [
                'op idiv ящики 100 30',
                'op mod остаток 100 30',
                'op idiv ящикиМинус -100 30',
                'op mod остатокМинус -100 30'
            ].join('\n')
        }]
    })

    assert.equal(num(processor, 'ящики'), 3)
    assert.equal(num(processor, 'остаток'), 10)
    assert.equal(num(processor, 'ящикиМинус'), -4)
    assert.equal(num(processor, 'остатокМинус'), -10)
})

test('урок «Сравнения и логика»: сравнение отдаёт единицу или ноль', () => {
    const processor = run(LOGIC)

    assert.equal(num(processor, 'мало'), 1)
    assert.equal(num(processor, 'много'), 0)

    // `land` — это «и», а «или» в mlog приходится писать побитовым `or`
    assert.equal(num(processor, 'оба'), 0)
    assert.equal(num(processor, 'хотяБы'), 1)
})

test('урок «Сравнения и логика»: not даёт −2, а отрицание пишется через equal', () => {
    const processor = run(NEGATION)

    assert.equal(num(processor, 'побитовое'), -2)
    assert.equal(num(processor, 'логическое'), 0)
})

test('урок «Битовые операции»: маски и сдвиги над 12 и 10', () => {
    const processor = run(BITWISE)

    assert.equal(num(processor, 'маска'), 8)
    assert.equal(num(processor, 'обе'), 14)
    assert.equal(num(processor, 'разные'), 6)
    assert.equal(num(processor, 'сдвиг'), 8)
    assert.equal(num(processor, 'обратно'), 1)
    assert.equal(num(processor, 'инверт'), -6)
})

test('урок «Битовые операции»: три ответа, которых никто не ждёт', () => {
    const processor = run(SHIFTS)

    // Величина сдвига берётся по младшим шести битам: сдвиг на 64 — это сдвиг на ноль
    assert.equal(num(processor, 'перебор'), 1)

    // `shr` бережёт знак, `ushr` считает число беззнаковым
    assert.equal(num(processor, 'знак'), -4)
    assert.equal(num(processor, 'беззнак'), 15)
})

test('урок «Битовые операции»: два числа складываются в одно и достаются обратно', () => {
    const processor = run({
        ...BITWISE,
        processors: [{
            ...BITWISE.processors[0],
            program: [
                'op shl упаковано 5 8',
                'op or упаковано упаковано 3',
                'op and первое упаковано 255',
                'op shr второе упаковано 8'
            ].join('\n')
        }]
    })

    assert.equal(num(processor, 'упаковано'), 1283)
    assert.equal(num(processor, 'первое'), 3)
    assert.equal(num(processor, 'второе'), 5)
})

test('урок «Битовые операции»: дробная часть до операции отбрасывается', () => {
    const processor = run({
        ...BITWISE,
        processors: [{...BITWISE.processors[0], program: 'op and дробь 12.7 10'}]
    })

    assert.equal(num(processor, 'дробь'), 8)
})

test('урок «Углы и расстояния»: длина, угол и разница углов', () => {
    const processor = run(GEOMETRY)

    assert.equal(num(processor, 'расстояние'), 50)
    assert.equal(num(processor, 'разница'), 20)

    // Числа с хвостом урок называет полностью — их видно в таблице примера
    assert.equal(num(processor, 'угол'), 53.130008697509766)
    assert.equal(num(processor, 'высота'), 0.49999999999999994)
})

test('урок «Углы и расстояния»: у этих операций точность вдвое короче', () => {
    const processor = run(FLOAT)

    // Корень из двух в полной точности — 1.4142135623730951
    assert.equal(num(processor, 'диагональ'), 1.4142135381698608)

    // Угол «влево» — не ровно 180: `Angles.angle` считает приближённо
    assert.equal(num(processor, 'назад'), 179.99989318847656)
})

test('урок «Углы и расстояния»: обратное смещение меняет угол на 180', () => {
    const processor = run({
        ...GEOMETRY,
        processors: [{
            ...GEOMETRY.processors[0],
            program: [
                'op sub dx 40 12',
                'op sub dy 45 5',
                'op len путь dx dy',
                'op angle туда dx dy',
                'op angle обратно -28 -40',
                'op angleDiff разворот туда обратно'
            ].join('\n')
        }]
    })

    assert.equal(num(processor, 'dx'), 28)
    assert.ok(Math.abs(num(processor, 'путь') - 48.8) < 0.1, num(processor, 'путь'))
    /*
     * Не ровно 180, и это ровно то, о чём урок: у `angle` и `angleDiff` точность вдвое
     * короче обычной, поэтому развороту позволено промахнуться на тысячную.
     */
    assert.ok(Math.abs(num(processor, 'разворот') - 180) < 0.001, num(processor, 'разворот'))
})

test('урок «Случайность и шум»: кубик выпадает от одного до шести', () => {
    /*
     * Зерно у нас закреплено, но урок обещает не конкретное число, а границы — их и
     * проверяем, зато на многих бросках. Проверять выпавшую двойку значило бы закрепить
     * тестом то, что в игре каждый раз другое.
     */
    /*
     * Тики кратны трём: у микропроцессора две инструкции за тик, а в программе их три,
     * и только на каждом третьем тике круг заканчивается ровно. Иначе снимок застаёт
     * программу между `floor` и `add`, когда кубик ещё не собран.
     */
    for (let ticks = 3; ticks <= 60; ticks += 3) {
        const processor = run(RANDOM, ticks)

        const roll = num(processor, 'бросок')
        const value = num(processor, 'кубик')

        assert.ok(roll >= 0 && roll < 6, `бросок от 0 до 6: ${roll}`)
        assert.ok(Number.isInteger(value), `грань целая: ${value}`)
        assert.ok(value >= 1 && value <= 6, `грань от 1 до 6: ${value}`)
    }
})

test('урок «Случайность и шум»: два броска подряд дают разные числа', () => {
    const processor = run({
        ...RANDOM,
        processors: [{
            ...RANDOM.processors[0],
            program: ['op rand a 1000', 'op rand b 1000'].join('\n')
        }]
    })

    assert.notEqual(num(processor, 'a'), num(processor, 'b'))
})

test('урок «Случайность и шум»: у соседних точек шум почти одинаковый', () => {
    const processor = run(NOISE)

    const here = num(processor, 'тут')
    const near = num(processor, 'рядом')
    const far = num(processor, 'далеко')

    for (const value of [here, near, far]) {
        assert.ok(value >= -1 && value <= 1, `шум в пределах от −1 до 1: ${value}`)
    }

    assert.ok(Math.abs(here - near) < 0.01, `соседи близки: ${here} и ${near}`)
    assert.ok(Math.abs(here - far) > 0.5, `дальняя точка другая: ${here} и ${far}`)
})

test('урок «Как писать в игре»: порядок строк и есть порядок выполнения', () => {
    const processor = run(EDITOR)

    assert.equal(num(processor, 'запас'), 10)
    assert.equal(num(processor, 'удвоено'), 20)
    assert.equal(num(processor, 'итог'), 25)
})

test('урок «Как писать в игре»: переставленные строки дают пятёрку на первом круге', () => {
    const swapped = {
        ...EDITOR,
        processors: [{
            ...EDITOR.processors[0],
            program: [
                'set запас 10',
                'op add итог удвоено 5',
                'op mul удвоено запас 2'
            ].join(String.fromCharCode(10))
        }]
    }

    // Задание урока: на втором шаге — пятёрка, потому что `удвоено` ещё пусто
    const first = run(swapped, 0)
    first.step()
    first.step()

    assert.equal(num(first, 'итог'), 5)

    // А на втором круге уже двадцать пять: программа идёт по кругу
    const later = run(swapped, 20)
    assert.equal(num(later, 'итог'), 25)
})
