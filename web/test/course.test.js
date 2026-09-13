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
import {VALUES, EMPTINESS, PROCESSOR, EDITOR, WATCH, DEBUG, NAMES, LINKS} from '../src/course/scenes/basics.js'
import {linkName} from '@mlog/core/src/world.js'
import {ASSIGN, CONTENT} from '../src/course/scenes/set.js'
import {BRANCH, LOOP} from '../src/course/scenes/jump.js'
import {COUNTER, RELATIVE} from '../src/course/scenes/advanced.js'
import {CHOICE} from '../src/course/scenes/select.js'
import {TICKS, STOPPED, ENDING, RHYTHM, TIMER} from '../src/course/scenes/wait.js'
import {BUFFER, PIECES, FLUSH} from '../src/course/scenes/print.js'
import {TEMPLATE, CHARS} from '../src/course/scenes/format.js'
import {
    CELLS, BOUNDS, STORE, OBJECTS, SHARED, NEIGHBOUR, LETTERS, COMMAND
} from '../src/course/scenes/memory.js'
import iconTable from '@mlog/core/data/icons.json' with {type: 'json'}
import logicIdsData from '@mlog/core/data/logic-ids.json' with {type: 'json'}
import schema from '@mlog/core/data/instructions.json' with {type: 'json'}

import {readdirSync, readFileSync, statSync} from 'node:fs'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'

/** Все страницы уроков: тесты ниже читают их текст, а не только сцены. */
function lessonFiles(directory) {
    const found = []

    for (const name of readdirSync(directory)) {
        const path = join(directory, name)

        if (statSync(path).isDirectory()) found.push(...lessonFiles(path))
        else if (name.endsWith('.mdx')) found.push(path)
    }

    return found
}
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

test('урок «Пустота: null»: откуда он берётся', () => {
    /*
     * Таблица урока обещает шесть источников пустоты. Четыре из них проверяются прямо
     * здесь, остальные два — в уроках про связи и про юнитов.
     */
    const processor = new Processor([
        'op div делениеНаНоль 1 0',
        'op sqrt кореньИзМинуса -1',
        'op log логарифмНуля 0',
        'lookup item запредельныйПредмет 99',
        'read изПамяти cell1 999'
    ].join('\n'), {content, globals: content.globals, ipt: 8})

    processor.run(5)

    for (const name of ['делениеНаНоль', 'кореньИзМинуса', 'логарифмНуля', 'запредельныйПредмет']) {
        const value = processor.get(name)
        assert.equal(value.isobj, true, name)
        assert.equal(value.objval, null, name)
    }
})

test('урок «Число, объект и текст»: строка в арифметике тоже единица', () => {
    const processor = run({
        ...VALUES,
        processors: [{
            ...VALUES.processors[0],
            program: [
                'set текст "медь"',
                'set предмет @copper',
                'op add изТекста текст 1',
                'op add изПредмета предмет 1'
            ].join('\n')
        }]
    })

    assert.equal(num(processor, 'изТекста'), 2)
    assert.equal(num(processor, 'изПредмета'), 2)
})

test('урок «Предметы и пустой ответ»: у типа блока предметом запрашивают цену', () => {
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

test('урок «Окно переменных»: опечатка в имени даёт null, ноль и пятёрку', () => {
    const processor = run(WATCH)

    assert.equal(num(processor, 'запас'), 10)

    // Имени, которого не присваивали, достаётся своя переменная с null
    const typo = processor.get('запс')
    assert.equal(typo.isobj, true)
    assert.equal(typo.objval, null)

    // null в арифметике считается нулём, и урок называет оба числа
    assert.equal(num(processor, 'удвоено'), 0)
    assert.equal(num(processor, 'итог'), 5)
})

test('урок «Окно переменных»: в таблице видны только неконстанты, первым @counter', () => {
    const processor = run(WATCH)
    const shown = [...processor.vars.values()].filter(variable => !variable.constant)

    // Урок обещает порядок: сначала `@counter`, потом свои по первому появлению
    assert.deepEqual(shown.map(variable => variable.name),
        ['@counter', 'запас', 'удвоено', 'запс', 'итог'])

    // И обещает, что константы туда не попадают: `LogicDialog`, `if(s.constant) continue`
    for (const [name, variable] of processor.vars) {
        assert.equal(variable.constant, !shown.includes(variable), name)
    }

    assert.equal(processor.get('@this').constant, true)
})

test('урок «Когда не работает»: первый круг считает верно, а доля остаётся пустой', () => {
    const processor = run(DEBUG, 0)

    // Четыре шага — ровно один круг: урок просит пройти его руками
    for (let i = 0; i < 4; i++) processor.step()

    assert.equal(num(processor, 'цель'), 10)
    assert.equal(num(processor, 'счёт'), 1)
    assert.equal(num(processor, 'осталось'), 9)

    // Деление на пустую переменную даёт не ноль и не бесконечность, а «ничего»
    const share = processor.get('доля')
    assert.equal(share.isobj, true)
    assert.equal(share.objval, null)
})

test('урок «Когда не работает»: за секунду счёт уходит за десяток, а осталось — в минус', () => {
    const processor = run(DEBUG, 60)

    assert.equal(num(processor, 'счёт'), 30)
    assert.equal(num(processor, 'осталось'), -19)
    assert.equal(processor.get('доля').objval, null)
})

test('урок «Когда не работает»: задание чинит половину — доля становится одной десятой', () => {
    const fixed = {
        ...DEBUG,
        processors: [{
            ...DEBUG.processors[0],
            program: [
                'set цель 10',
                'op add счёт счёт 1',
                'op sub осталось цель счёт',
                'op div доля счёт цель'
            ].join('\n')
        }]
    }

    const processor = run(fixed, 0)
    for (let i = 0; i < 4; i++) processor.step()

    assert.equal(num(processor, 'доля'), 0.1)

    // А круг остаётся сломанным: урок обещает, что доля уедет выше единицы
    const later = run(fixed, 60)
    assert.ok(num(later, 'доля') > 1, num(later, 'доля'))
})

test('урок «Переменные и имена»: регистр разводит переменные, а занятое имя не принимает запись', () => {
    const processor = run(NAMES)

    assert.equal(num(processor, 'запас'), 100)
    assert.equal(num(processor, 'Запас'), 5)
    assert.equal(num(processor, 'итог'), 105)

    // `set @copper 7` не делает ничего: имя занято игрой, и в таблице его не видно
    assert.equal(processor.get('@copper'), undefined)

    const shown = [...processor.vars.values()].filter(variable => !variable.constant)
    assert.deepEqual(shown.map(variable => variable.name),
        ['@counter', 'запас', 'Запас', 'итог'])
})

test('урок «Связи и getlink»: два подключённых блока, третий номер пуст', () => {
    const processor = run(LINKS)

    assert.equal(num(processor, 'сколько'), 2)

    // `getlink` отдаёт здание, а не число: в таблице у него тип building
    assert.equal(obj(processor, 'первый').name, 'container1')
    assert.equal(obj(processor, 'второй').name, 'cell1')

    // Номер вне диапазона — не ошибка, а пустота
    assert.equal(obj(processor, 'третий'), null)

    assert.equal(num(processor, 'медь'), 80)
})

test('урок «Связи и getlink»: имена связей из таблицы урока', () => {
    // LogicBlock.getLinkName: последняя часть через дефис, а `large` и числа отбрасываются
    const table = {
        container: 'container',
        'memory-cell': 'cell',
        'power-node': 'node',
        'titanium-conveyor': 'conveyor',
        'large-logic-display': 'display'
    }

    for (const [block, name] of Object.entries(table)) {
        assert.equal(linkName(block), name, block)
    }
})

test('урок «Присваивание и копирование»: копия остаётся с прежним значением', () => {
    const processor = run(ASSIGN, 0)

    // Урок просит четыре шага — ровно один круг
    for (let i = 0; i < 4; i++) processor.step()

    assert.equal(num(processor, 'запас'), 99)
    assert.equal(num(processor, 'копия'), 5)
    assert.equal(obj(processor, 'текст'), 'медь')
})

test('урок «Присваивание и копирование»: задание меняет строки местами', () => {
    const swapped = {
        ...ASSIGN,
        processors: [{
            ...ASSIGN.processors[0],
            program: [
                'set запас 5',
                'set текст "медь"',
                'set запас 99',
                'set копия запас'
            ].join('\n')
        }]
    }

    const processor = run(swapped, 0)
    for (let i = 0; i < 4; i++) processor.step()

    assert.equal(num(processor, 'копия'), 99)
})

test('урок «Константы контента»: вещи ложатся в переменные, а sensor берёт свойство оттуда же', () => {
    const processor = run(CONTENT)

    assert.equal(obj(processor, 'предмет').name, 'copper')
    assert.equal(obj(processor, 'блок').name, 'router')
    assert.equal(obj(processor, 'юнит').name, 'poly')

    // `@this` — само здание процессора, а не число
    assert.equal(obj(processor, 'сам').name, 'processor1')

    assert.equal(num(processor, 'сколько'), 120)
})

test('урок «Константы контента»: задание меняет предмет и свойство', () => {
    const variant = (first, property) => ({
        ...CONTENT,
        processors: [{
            ...CONTENT.processors[0],
            program: [
                `set предмет ${first}`,
                'set блок @router',
                'set юнит @poly',
                'set сам @this',
                `sensor сколько container1 ${property}`
            ].join('\n')
        }]
    })

    assert.equal(num(run(variant('@lead', 'предмет')), 'сколько'), 40)
    assert.equal(num(run(variant('@copper', '@totalItems')), 'сколько'), 160)
})

test('урок «Константы контента»: сколько в игре вещей', () => {
    // Таблица урока: числа берутся из снятой описи, а не из головы
    assert.equal(logicIdsData.counts.item, 20)
    assert.equal(logicIdsData.counts.liquid, 11)
    assert.equal(logicIdsData.counts.block, 262)
    assert.equal(logicIdsData.counts.unit, 56)
})

test('урок «Условие и ветвление»: ложное условие ведёт в первую ветку', () => {
    const processor = run(BRANCH, 0)
    for (let i = 0; i < 4; i++) processor.step()

    assert.equal(num(processor, 'запас'), 7)
    assert.equal(num(processor, 'мало'), 1)
})

test('урок «Условие и ветвление»: задание с двенадцатью уводит во вторую ветку', () => {
    const twelve = {
        ...BRANCH,
        processors: [{
            ...BRANCH.processors[0],
            program: BRANCH.processors[0].program.replace('set запас 7', 'set запас 12')
        }]
    }

    const processor = run(twelve, 0)
    for (let i = 0; i < 3; i++) processor.step()

    assert.equal(num(processor, 'мало'), 0)
})

test('урок «Циклы»: семнадцать шагов дают сумму от нуля до четырёх', () => {
    const processor = run(LOOP, 0)
    for (let i = 0; i < 17; i++) processor.step()

    assert.equal(num(processor, 'итог'), 10)
    assert.equal(num(processor, 'счёт'), 5)
})

test('урок «Циклы»: круг занимает девять тактов микропроцессора', () => {
    const {world, processors} = buildScene(LOOP, {content})

    for (const entry of processors) {
        entry.building.processor = new Processor(entry.program, {
            links: entry.links, world, content, globals: content.globals,
            ipt: entry.building.spec.ipt, building: entry.building, team: entry.building.team
        })
    }

    world.processors = processors.map(entry => entry.building.processor)
    const processor = processors[0].building.processor

    let done = null
    for (let tick = 0; tick < 60 && done === null; tick++) {
        world.step()
        if (num(processor, 'итог') === 10 && num(processor, 'счёт') === 5) done = Math.trunc(world.tick)
    }

    assert.equal(done, 9)
})

test('урок «Циклы»: задание до десяти даёт 45, а сдвинутая стрелка оставляет ноль', () => {
    const variant = (program) => ({...LOOP, processors: [{...LOOP.processors[0], program}]})

    const toTen = variant([
        'set счёт 0',
        'set итог 0',
        'op add итог итог счёт',
        'op add счёт счёт 1',
        'jump 2 lessThan счёт 10',
        'end'
    ].join('\n'))

    const long = run(toTen, 0)
    for (let i = 0; i < 32; i++) long.step()
    assert.equal(num(long, 'итог'), 45)

    // Стрелка переехала ниже сложения: тело выпало из круга
    const moved = variant([
        'set счёт 0',
        'set итог 0',
        'op add итог итог счёт',
        'op add счёт счёт 1',
        'jump 3 lessThan счёт 5',
        'end'
    ].join('\n'))

    const broken = run(moved, 0)
    for (let i = 0; i < 17; i++) broken.step()
    assert.equal(num(broken, 'итог'), 0)
})

test('урок «@counter: переход как значение»: запись в счётчик пропускает строку', () => {
    const processor = run(COUNTER, 0)
    for (let i = 0; i < 3; i++) processor.step()

    assert.equal(obj(processor, 'пропущено'), null)
    assert.equal(num(processor, 'дошли'), 1)
})

test('таблицы уроков называют знаки так же, как игра', () => {
    /*
     * В блоке видно не имя условия, а знак: `===`, а не `strictEqual`. Уроки это выписывают
     * таблицами, и знаки там должны совпадать со снятыми из игры — иначе читатель будет
     * искать в списке то, чего там нет.
     */
    const symbols = {...schema.enumSymbols.LogicOp, ...schema.enumSymbols.ConditionOp}
    const dir = fileURLToPath(new URL('../src/content/docs/ru/course/', import.meta.url))

    let checked = 0

    for (const path of lessonFiles(dir)) {
        const text = readFileSync(path, 'utf8')

        for (const [, name, sign] of text.matchAll(/^\| `(\w+)` \| `([^`]+)` \|/gm)) {
            if (symbols[name] === undefined) continue

            assert.equal(sign, symbols[name], `${path}: ${name}`)
            checked++
        }
    }

    // Если таблицы переписали, а знаки выпали — тест должен об этом сказать
    assert.ok(checked >= 25, `проверено пар: ${checked}`)
})

test('урок «Условие и ветвление»: таблица условий и знаки в блоке', () => {
    /*
     * Урок обещает три строки: `null` против нуля, единица против почти единицы и две
     * одинаковые строки. Проверяется тем же способом, каким это видит читатель, — прыжком.
     */
    const jumped = (condition, a, b) => {
        const processor = new Processor([
            `jump 3 ${condition} ${a} ${b}`,
            'set ответ 0',
            'end',
            'set ответ 1'
        ].join('\n'), {content, globals: content.globals, ipt: 4})

        processor.step()
        processor.step()

        return num(processor, 'ответ') === 1
    }

    assert.equal(jumped('equal', 'null', '0'), true)
    assert.equal(jumped('strictEqual', 'null', '0'), false)

    assert.equal(jumped('equal', '1', '1.0000001'), true)
    assert.equal(jumped('strictEqual', '1', '1.0000001'), false)

    assert.equal(jumped('equal', '"медь"', '"медь"'), true)
    assert.equal(jumped('strictEqual', '"медь"', '"медь"'), true)
})

test('урок «Пустота: null»: то же строгое сравнение есть и у op, и у select', () => {
    /*
     * Урок обещает, что `strictEqual` не принадлежит `jump`: у `op` он кладёт ответ
     * в переменную, у `select` выбирает одно из двух значений.
     */
    const processor = new Processor([
        'op equal мягко null 0',
        'op strictEqual строго null 0',
        'select выбор strictEqual null 0 "пусто" "ноль"'
    ].join('\n'), {content, globals: content.globals, ipt: 4})

    processor.run(3)

    assert.equal(num(processor, 'мягко'), 1)
    assert.equal(num(processor, 'строго'), 0)
    assert.equal(obj(processor, 'выбор'), 'ноль')
})

test('урок «Выбор значения без ветки»: сравнение отвечает само, а select выбирает значения', () => {
    const processor = run(CHOICE, 0)
    for (let i = 0; i < 4; i++) processor.step()

    assert.equal(num(processor, 'медь'), 120)

    // Урок обещает, что единицу и ноль даёт само сравнение, без select
    assert.equal(num(processor, 'хватает'), 1)

    assert.equal(obj(processor, 'надпись'), 'хватает')

    // Ограничение сверху: меди больше сотни, значит берём сотню
    assert.equal(num(processor, 'сколькоБрать'), 100)
})

test('урок «Выбор значения без ветки»: перевёрнутое условие меняет ответ, а не порядок значений', () => {
    const flipped = {
        ...CHOICE,
        processors: [{
            ...CHOICE.processors[0],
            program: CHOICE.processors[0].program
                .replace('select надпись greaterThanEq', 'select надпись lessThan')
        }]
    }

    const processor = run(flipped, 0)
    for (let i = 0; i < 4; i++) processor.step()

    // Первая половина по-прежнему для «верно», просто «верно» теперь значит другое
    assert.equal(obj(processor, 'надпись'), 'мало')
})

/** Сколько кругов программа успевает за секунду с разным хвостом. */
function roundsPerSecond(tail, type = 'hyper-processor') {
    const description = {
        width: 7, height: 5, floor: 'sand',
        blocks: [{type, x: 3, y: 2}],
        processors: [{
            at: [3, 2],
            links: [],
            program: ['op add кругов кругов 1', ...tail].join('\n')
        }]
    }

    const {world, processors} = buildScene(description, {content})

    for (const entry of processors) {
        entry.building.processor = new Processor(entry.program, {
            links: entry.links, world, content, globals: content.globals,
            ipt: entry.building.spec.ipt, building: entry.building, team: entry.building.team
        })
    }

    world.processors = processors.map(entry => entry.building.processor)
    for (let tick = 0; tick < 60; tick++) world.step()

    return num(processors[0].building.processor, 'кругов')
}

test('уроки про wait, end и stop: таблица кругов за секунду', () => {
    // Числа из таблицы урока, гиперпроцессор: 25 инструкций за такт
    assert.equal(roundsPerSecond([]), 1475)
    assert.equal(roundsPerSecond(['end']), 738)
    assert.equal(roundsPerSecond(['wait 0']), 59)
    assert.equal(roundsPerSecond(['wait 0.5']), 2)
    assert.equal(roundsPerSecond(['stop']), 1)
})

test('урок «End»: круг обрывается, а строка под end недостижима', () => {
    const processor = run(ENDING, 0)

    // Урок просит четыре шага: это два круга по две инструкции
    for (let i = 0; i < 4; i++) processor.step()

    assert.equal(num(processor, 'кругов'), 2)
    assert.equal(obj(processor, 'после'), null)
})

test('уроки про wait и stop: секунда отмеряется, за stop программа не уходит', () => {
    const {world, processors} = buildScene(TICKS, {content})

    for (const entry of processors) {
        entry.building.processor = new Processor(entry.program, {
            links: entry.links, world, content, globals: content.globals,
            ipt: entry.building.spec.ipt, building: entry.building, team: entry.building.team
        })
    }

    world.processors = processors.map(entry => entry.building.processor)
    for (let tick = 0; tick < 120; tick++) world.step()

    assert.equal(num(processors[0].building.processor, 'кругов'), 2)

    // А за stop программа не уходит ни разу
    const stopped = run(STOPPED, 120)
    assert.equal(num(stopped, 'кругов'), 1)
    assert.equal(obj(stopped, 'послеСтопа'), null)
})

test('урок «Ритм программы»: два круга в секунду и вдесятеро быстрее без половины', () => {
    const half = run(RHYTHM, 60)
    assert.equal(num(half, 'проверок'), 2)
    assert.equal(num(half, 'медь'), 120)

    const faster = {
        ...RHYTHM,
        processors: [{
            ...RHYTHM.processors[0],
            program: RHYTHM.processors[0].program.replace('wait 0.5', 'wait 0.1')
        }]
    }

    /*
     * Не десять: ожидание копит время по такту, и круг выходит в шесть тактов плюс
     * такт на саму программу — девять кругов за секунду.
     */
    assert.equal(num(run(faster, 60), 'проверок'), 9)
})

test('урок «Текстовый буфер»: куски склеиваются в порядке выполнения', () => {
    const processor = run(BUFFER, 0)
    for (let i = 0; i < 5; i++) processor.step()

    assert.equal(processor.textBuffer, 'меди: 120 из 300')
})

test('урок «Текстовый буфер»: задание с переставленными строками', () => {
    const swapped = {
        ...BUFFER,
        processors: [{
            ...BUFFER.processors[0],
            program: [
                'sensor медь container1 @copper',
                'print медь',
                'print "меди: "',
                'print " из "',
                'print 300'
            ].join('\n')
        }]
    }

    const processor = run(swapped, 0)
    for (let i = 0; i < 5; i++) processor.step()

    assert.equal(processor.textBuffer, '120меди:  из 300')
})

test('урок «Что во что печатается»: здание печатается типом, пустота — словом', () => {
    const processor = run(PIECES, 0)
    for (let i = 0; i < 7; i++) processor.step()

    assert.equal(processor.textBuffer, 'copper container null 0.5')
})

test('урок «Что во что печатается»: задание про тип блока и про треть', () => {
    // Шагов ровно столько, сколько строк: лишний шаг пошёл бы на второй круг
    const variant = (program, steps) => {
        const processor = run({...PIECES, processors: [{...PIECES.processors[0], program}]}, 0)
        for (let i = 0; i < steps; i++) processor.step()
        return processor.textBuffer
    }

    // Здание и его тип печатаются одинаково
    assert.equal(variant([
        'print @copper',
        'print " "',
        'print @container',
        'print " "',
        'print пусто',
        'print " "',
        'print 0.5'
    ].join('\n'), 7), 'copper container null 0.5')

    // А непорезанная дробь печатается целиком
    assert.equal(variant([
        'op div треть 1 3',
        'print треть'
    ].join('\n'), 2), '0.3333333333333333')
})

test('урок «Print Flush»: буфер уходит в блок сообщений и чистится', () => {
    const {world, processors} = buildScene(FLUSH, {content})

    for (const entry of processors) {
        entry.building.processor = new Processor(entry.program, {
            links: entry.links, world, content, globals: content.globals,
            ipt: entry.building.spec.ipt, building: entry.building, team: entry.building.team
        })
    }

    world.processors = processors.map(entry => entry.building.processor)
    const processor = processors[0].building.processor

    for (let i = 0; i < 4; i++) processor.step()

    assert.equal(processor.textBuffer, '')

    const message = world.buildings.find(building => building.type === 'message')
    assert.equal(message.message, 'меди: 120')
})

test('урок «Print Flush»: сброс выше печати отстаёт на круг', () => {
    /*
     * Скрытая ошибка из урока: `printflush` первой строкой выглядит работающим, потому что
     * программа идёт по кругу. Первый круг при этом отдаёт пустоту, а дальше в блоке всегда
     * надпись прошлого круга.
     */
    const wrong = {
        ...FLUSH,
        processors: [{
            ...FLUSH.processors[0],
            program: [
                'printflush message1',
                'sensor медь container1 @copper',
                'print "меди: "',
                'print медь'
            ].join('\n')
        }]
    }

    const {world, processors} = buildScene(wrong, {content})

    for (const entry of processors) {
        entry.building.processor = new Processor(entry.program, {
            links: entry.links, world, content, globals: content.globals,
            ipt: entry.building.spec.ipt, building: entry.building, team: entry.building.team
        })
    }

    world.processors = processors.map(entry => entry.building.processor)
    const processor = processors[0].building.processor
    const message = world.buildings.find(building => building.type === 'message')

    // Первый круг: сброс отдал пустоту, надпись набралась уже после него
    for (let i = 0; i < 4; i++) processor.step()

    assert.equal(message.message, '')
    assert.equal(processor.textBuffer, 'меди: 120')

    // Второй круг: в блоке появилось то, что набрали в первом
    for (let i = 0; i < 4; i++) processor.step()

    assert.equal(message.message, 'меди: 120')
})

/** Собирает сцену, делает шаги и отдаёт буфер вместе с блоком сообщений. */
function printed(description, steps) {
    const {world, processors} = buildScene(description, {content})

    for (const entry of processors) {
        entry.building.processor = new Processor(entry.program, {
            links: entry.links, world, content, globals: content.globals,
            ipt: entry.building.spec.ipt, building: entry.building, team: entry.building.team
        })
    }

    world.processors = processors.map(entry => entry.building.processor)
    const processor = processors[0].building.processor

    for (let i = 0; i < steps; i++) processor.step()

    return {
        buffer: processor.textBuffer,
        message: world.buildings.find(building => building.type === 'message').message
    }
}

test('урок «Format»: шаблон заполняется по номерам мест', () => {
    const {buffer, message} = printed(TEMPLATE, 5)

    assert.equal(message, 'меди 120 из 300')
    assert.equal(buffer, '')
})

test('урок «Format»: задания про порядок номеров и про пропавшее место', () => {
    const variant = (template) => printed({
        ...TEMPLATE,
        processors: [{
            ...TEMPLATE.processors[0],
            program: [
                'sensor медь container1 @copper',
                `print "${template}"`,
                'format медь',
                'format 300'
            ].join('\n')
        }]
    }, 4).buffer

    // Номер решает, куда что встанет, а не порядок в строке
    assert.equal(variant('осталось {1} из {0}'), 'осталось 300 из 120')

    // Места не осталось — второй format промолчал
    assert.equal(variant('меди {0} из '), 'меди 120 из ')
})

test('урок «Print Char»: знак по коду и иконка предмета', () => {
    const {message} = printed(CHARS, 7)

    const copper = String.fromCharCode(iconTable.content.copper)
    assert.equal(message, `${copper} 120 ${String.fromCharCode(8593)}`)
})

test('урок «Print Char»: у здания иконки нет, а у его типа есть', () => {
    const variant = (value) => printed({
        ...CHARS,
        processors: [{
            ...CHARS.processors[0],
            program: [`printchar ${value}`, 'printflush message1'].join('\n')
        }]
    }, 2).message

    assert.equal(variant('@container'), String.fromCharCode(iconTable.content.container))
    assert.equal(variant('container1'), '')
})

test('урок «Ритм программы»: таймер на @time срабатывает раз в секунду', () => {
    /*
     * Ритм отмеряется временем, а не числом кругов: `@time` — игровое время
     * в миллисекундах, и «раз в секунду» остаётся разом в секунду при любой длине
     * программы и любом процессоре.
     */
    const {world, processors} = buildScene(TIMER, {content})

    for (const entry of processors) {
        entry.building.processor = new Processor(entry.program, {
            links: entry.links, world, content, globals: content.globals,
            ipt: entry.building.spec.ipt, building: entry.building, team: entry.building.team
        })
    }

    world.processors = processors.map(entry => entry.building.processor)
    const processor = processors[0].building.processor

    for (let tick = 0; tick < 180; tick++) world.step()

    assert.equal(num(processor, 'проверок'), 3)
    assert.equal(num(processor, 'медь'), 120)

    // Круг при этом крутится на полной скорости: десятки проходов в секунду
    assert.ok(num(processor, 'кругов') > 150, num(processor, 'кругов'))
})

/** Сцена целиком: уроки про память проверяют не только переменные, но и саму ячейку. */
function stage(description, ticks = 20) {
    const {world, processors} = buildScene(description, {content})

    for (const entry of processors) {
        entry.building.processor = new Processor(entry.program, {
            links: entry.links, world, content, globals: content.globals,
            ipt: entry.building.spec.ipt, building: entry.building, team: entry.building.team
        })
    }

    world.processors = processors.map(entry => entry.building.processor)
    for (let i = 0; i < ticks; i++) world.step()

    return {
        world,
        processor: processors[0].building.processor,
        cell: world.buildings.find(building => building.type === 'memory-cell'),
        message: world.buildings.find(building => building.type === 'message')?.message
    }
}

test('урок «Ячейка памяти»: числа достаются по адресам', () => {
    const {processor, message} = stage(CELLS)

    assert.equal(num(processor, 'запас'), 40)
    assert.equal(num(processor, 'расход'), 12)
    assert.equal(num(processor, 'предел'), 300)
    assert.equal(message, 'запас 40 из 300')
})

test('урок «Ячейка памяти»: адрес усекается, за границей лежит пустота', () => {
    const {processor} = stage(BOUNDS)

    // 1.9 — это место 1, а не 2: MemoryBlock берёт адрес через numi()
    assert.equal(num(processor, 'дробный'), 12)

    // Место внутри ячейки, но пустое — ноль; за границей и по отрицательному адресу — null
    assert.equal(num(processor, 'пустое'), 0)
    assert.equal(obj(processor, 'заГраницей'), null)
    assert.equal(processor.get('заГраницей').isobj, true)
    assert.equal(obj(processor, 'отрицательный'), null)
    assert.equal(processor.get('отрицательный').isobj, true)

    assert.equal(num(processor, 'мест'), 64)
})

test('урок «Ячейка памяти»: задание про адрес за границей', () => {
    const far = {
        ...CELLS,
        processors: [{
            ...CELLS.processors[0],
            program: CELLS.processors[0].program.replace('read запас cell1 0', 'read запас cell1 100')
        }]
    }

    assert.equal(stage(far).message, 'запас null из 300')
})

test('урок «Запись в ячейку»: счётчик живёт в памяти, а не в переменной', () => {
    // wait 0.5 — два круга в секунду; за две секунды их четыре
    const {processor, cell, message} = stage(STORE, 120)

    assert.equal(num(processor, 'кругов'), 4)
    assert.equal(cell.memory[0], 4)
    assert.equal(message, 'кругов: 4')
})

test('урок «Запись в ячейку»: задание про запись за границей', () => {
    const lost = {
        ...STORE,
        processors: [{
            ...STORE.processors[0],
            program: STORE.processors[0].program.replace('write кругов cell1 0', 'write кругов cell1 64')
        }]
    }

    const {cell, message} = stage(lost, 120)

    // Читается всегда нулевое место, а запись уходит в никуда — счётчик замирает на единице
    assert.equal(message, 'кругов: 1')
    assert.ok(cell.memory.every(value => value === 0))
})

test('урок «Объект в ячейке»: предмет и здание лежат собой, а не номером', () => {
    const {processor, cell, message} = stage(OBJECTS)

    assert.equal(obj(processor, 'предмет').name, 'copper')
    assert.equal(obj(processor, 'склад').type, 'container')
    assert.equal(num(processor, 'сколько'), 120)
    assert.equal(message, 'copper: 120')

    // В самой ячейке лежат те же объекты, а не числа
    assert.equal(cell.memory[0].name, 'copper')
    assert.equal(cell.memory[1].type, 'container')
})

test('урок «Объект в ячейке»: задания дают обещанные ответы', () => {
    const variant = (from, to) => ({
        ...OBJECTS,
        processors: [{
            ...OBJECTS.processors[0],
            program: OBJECTS.processors[0].program.replace(from, to)
        }]
    })

    assert.equal(stage(variant('write @copper cell1 0', 'write @lead cell1 0')).message, 'lead: 0')
    // У процессора нет склада вовсе, поэтому вопрос к нему даёт пустоту, а не ноль
    assert.equal(stage(variant('write container1 cell1 1', 'write @this cell1 1')).message, 'copper: null')
})

test('урок «Общая память»: один процессор кладёт, другой берёт', () => {
    const {cell, message} = stage(SHARED)

    assert.equal(cell.memory[0], 120)
    assert.equal(message, 'на складе 120')
})

test('урок «Общая память»: задания про чужой адрес и про пустую запись', () => {
    const writer = (program) => ({
        ...SHARED,
        processors: [{...SHARED.processors[0], program}, SHARED.processors[1]]
    })

    const elsewhere = writer([
        'sensor медь container1 @copper',
        'write медь cell1 1'
    ].join('\n'))

    assert.equal(stage(elsewhere).message, 'на складе 0')

    // Без sensor переменная пуста, и в ячейку уходит пустота — не ноль
    const empty = writer('write медь cell1 0')
    assert.equal(stage(empty).message, 'на складе null')
})

test('урок «Переменные другого процессора»: сосед отдаёт и переменную, и связь', () => {
    const {processor, message} = stage(NEIGHBOUR, 60)

    // Верхний считает круги с паузой 0.25 — за секунду их четыре
    assert.equal(num(processor, 'кругов'), 4)

    // Своей связи со складом у читающего нет: здание взято у соседа по имени его связи
    assert.equal(obj(processor, 'чужойСклад').type, 'container')
    assert.equal(num(processor, 'медь'), 120)
    assert.equal(message, 'кругов 4, меди 120')
})

test('урок «Переменные другого процессора»: задания про чужое имя и номер связи', () => {
    const variant = (from, to) => ({
        ...NEIGHBOUR,
        processors: [
            {...NEIGHBOUR.processors[0], program: NEIGHBOUR.processors[0].program.replace(from, to)},
            NEIGHBOUR.processors[1]
        ]
    })

    // Нет ни переменной, ни связи с таким именем — и имя не кончается цифрой
    assert.equal(stage(variant('"кругов"', '"круги"'), 60).message, 'кругов null, меди 120')

    // Связь по номеру ноль — та же самая, а под первым номером у соседа ничего нет
    assert.equal(stage(variant('"container1"', '0'), 60).message, 'кругов 4, меди 120')
    assert.equal(stage(variant('"container1"', '1'), 60).message, 'кругов 4, меди null')
})

test('урок «Знак из строки»: строка разбирается по знакам и собирается обратно', () => {
    assert.equal(stage(LETTERS, 40).message, 'mlog')

    const variant = (program) => ({
        ...LETTERS,
        processors: [{...LETTERS.processors[0], program}]
    })

    // Код первой буквы: m это 109
    const first = stage(variant('read код "mlog" 0\nstop'), 10)
    assert.equal(num(first.processor, 'код'), 109)

    // Задания: кириллица читается так же, а лишние знаки печатать нечем
    const longer = LETTERS.processors[0].program
        .replace('read код "mlog" номер', 'read код "привет" номер')
        .replace('jump 0 lessThan номер 4', 'jump 0 lessThan номер 6')

    assert.equal(stage(variant(longer), 60).message, 'привет')
    assert.equal(stage(variant(LETTERS.processors[0].program
        .replace('jump 0 lessThan номер 4', 'jump 0 lessThan номер 6')), 60).message, 'mlog')
})

test('урок «Переменные соседа»: команда пишется в переменную, а гасит её хозяин', () => {
    // Команда раз в секунду: за три секунды работа сделана трижды
    assert.equal(stage(COMMAND, 180).message, 'сделано 3')
})

test('урок «Переменные соседа»: задания про опечатку в имени и про ритм', () => {
    const variant = (from, to) => ({
        ...COMMAND,
        processors: [
            {...COMMAND.processors[0], program: COMMAND.processors[0].program.replace(from, to)},
            COMMAND.processors[1]
        ]
    })

    // Новой переменной запись не заводит: работа не начинается вовсе
    assert.equal(stage(variant('"нужен"', '"нужно"'), 180).message, '')

    // Ритм задаёт тот, кто командует
    assert.equal(stage(variant('wait 1', 'wait 0.25'), 180).message, 'сделано 12')
})

test('карточки уроков пользуются только теми ролями, что есть у Card', () => {
    /*
     * Незнакомая роль не падает, а молча становится «Скрытой ошибкой»: `KINDS[kind] ?? error`.
     * Так весь курс однажды и оказался в красных рамках — заметка была написана `kind="note"`,
     * а роли с таким именем не существовало.
     */
    const lessons = fileURLToPath(new URL('../src/content/docs/ru/course/', import.meta.url))
    const card = readFileSync(fileURLToPath(new URL('../src/course/Card.astro', import.meta.url)), 'utf8')
    const known = new Set([...card.matchAll(/^\s{4}(\w+): \{color:/gm)].map(match => match[1]))

    assert.ok(known.size >= 4, [...known].join(' '))

    for (const file of lessonFiles(lessons)) {
        for (const [, kind] of readFileSync(file, 'utf8').matchAll(/<Card kind="(\w+)"/g)) {
            assert.ok(known.has(kind), `${file}: роли ${kind} у Card нет`)
        }
    }
})
