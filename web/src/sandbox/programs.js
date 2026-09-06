/**
 * Программы, с которыми открывается песочница.
 *
 * Собраны блоками, а не текстом: редактор работает со строками инструкций, а текст mlog
 * получается из них. Разбор текста обратно в блоки появится вместе с обменом схемами.
 */

import {createStatement} from '@mlog/editor'

const withParams = (opcode, params) => {
    const statement = createStatement(opcode)
    return {...statement, params: {...statement.params, ...params}}
}

/** Рисующий процессор: гоняет по дисплею прямоугольник и берёт шаг из общей ячейки. */
export const PAINTER = [
    withParams('read', {output: 'шаг', target: 'cell1', address: '0'}),
    withParams('op', {op: 'mod', dest: 'x', a: 'шаг', b: '68'}),
    withParams('draw', {type: 'clear', x: '0', y: '0', p1: '0'}),
    withParams('draw', {type: 'color', x: '255', y: '210', p1: '120', p2: '255'}),
    withParams('draw', {type: 'rect', x: 'x', y: '34', p1: '12', p2: '12'}),
    withParams('drawflush', {target: 'display1'})
]

/** Считающий процессор: ведёт счёт, пишет его в память и в блок сообщений, дёргает дверь. */
export const COUNTER = [
    withParams('op', {op: 'add', dest: 'шаг', a: 'шаг', b: '1'}),
    withParams('write', {input: 'шаг', target: 'cell1', address: '0'}),
    withParams('sensor', {to: 'открыт', type: '@enabled', from: 'switch1'}),
    withParams('control', {type: 'enabled', target: 'door1', p1: 'открыт'}),
    withParams('print', {value: '"шаг: "'}),
    withParams('print', {value: 'шаг'}),
    withParams('printflush', {target: 'message1'})
]

/**
 * Пилот: добывает медь одним юнитом и водит двух других навстречу друг другу.
 *
 * Тут собрано всё, что процессор умеет делать с юнитами. `ubind` выбирает по типу — поли,
 * моно и кинжал получают разные команды от одной программы. `ulocate` ищет ближайшую жилу,
 * `ucontrol mine` копает, а когда трюм полон, поли несёт добытое в контейнер.
 *
 * И главное: `ucontrol move` повторяется каждый круг. Без новых команд юнит через 600 тиков
 * уходит из-под контроля.
 */
export const PILOT = (() => {
    const deliver = withParams('ucontrol', {type: 'move', p1: '17', p2: '5'})
    const patrol = withParams('op', {op: 'idiv', dest: 'фаза', a: '@tick', b: '240'})

    const full = withParams('jump', {op: 'greaterThanEq', value: 'груз', compare: '30'})
    const skip = withParams('jump', {op: 'always'})

    const statements = [
        // Поли: пока трюм не полон — копает ближайшую медь, иначе несёт её в контейнер
        withParams('ubind', {type: '@poly'}),
        withParams('sensor', {to: 'груз', from: '@unit', type: '@totalItems'}),
        full,
        withParams('ulocate', {locate: 'ore', ore: '@copper', outX: 'рудаX', outY: 'рудаY', outFound: 'есть'}),
        withParams('ucontrol', {type: 'move', p1: 'рудаX', p2: 'рудаY'}),
        withParams('ucontrol', {type: 'mine', p1: 'рудаX', p2: 'рудаY'}),
        skip,

        deliver,
        withParams('ucontrol', {type: 'itemDrop', p1: 'container1', p2: '30'}),

        // Моно и кинжал ходят между двумя точками, цель считается от времени
        patrol,
        withParams('op', {op: 'mod', dest: 'фаза', a: 'фаза', b: '2'}),
        withParams('op', {op: 'mul', dest: 'цель', a: 'фаза', b: '13'}),
        withParams('op', {op: 'add', dest: 'цель', a: 'цель', b: '3'}),

        withParams('ubind', {type: '@mono'}),
        withParams('ucontrol', {type: 'move', p1: 'цель', p2: '9'}),

        withParams('ubind', {type: '@dagger'}),
        withParams('ucontrol', {type: 'move', p1: 'цель', p2: '5'})
    ]

    // Цель перехода — ссылка на инструкцию, а не номер строки: так её держит и редактор игры
    full.target = deliver.id
    skip.target = patrol.id

    return statements
})()
