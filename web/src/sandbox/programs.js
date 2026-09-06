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

/**
 * Разметчик: процессор мира, который рисует метки поверх карты.
 *
 * Метки — единственное, что видно от инструкций мира, и заводятся они один раз: `replace`
 * здесь `false`, поэтому повторный круг программы ничего не пересоздаёт, а только правит.
 *
 * Подпись, круг и линия выбраны не случайно: у подписи свои свойства, у круга свои, и
 * `setmarker` с чужим свойством не делает ничего. Круг ходит за поли — метку можно двигать
 * каждый тик, чем в игре и пользуются.
 */
export const MARKER = [
    // Подпись над складом: текст приходит из буфера печати, как у `printflush`
    withParams('makemarker', {type: 'shapetext', id: '1', x: '17', y: '6', replace: 'false'}),
    withParams('print', {value: '"склад"'}),
    withParams('setmarker', {type: 'flushText', id: '1', p1: '0', p2: '0', p3: '0'}),

    // Линия от процессора к складу, с переливом от одного конца к другому
    withParams('makemarker', {type: 'line', id: '2', x: '13', y: '1', replace: 'false'}),
    withParams('setmarker', {type: 'endPos', id: '2', p1: '17', p2: '4', p3: '0'}),
    withParams('setmarker', {type: 'colori', id: '2', p1: '0', p2: '%ffd37f', p3: '0'}),
    withParams('setmarker', {type: 'colori', id: '2', p1: '1', p2: '%84f491', p3: '0'}),

    // Круг, который каждый круг программы переезжает на поли
    withParams('makemarker', {type: 'point', id: '3', x: '4', y: '1', replace: 'false'}),
    withParams('ubind', {type: '@poly'}),
    withParams('sensor', {to: 'юнитX', from: '@unit', type: '@x'}),
    withParams('sensor', {to: 'юнитY', from: '@unit', type: '@y'}),

    // Метки считают в тайлах, а `@x` у юнита в мировых единицах — отсюда деление на восемь
    withParams('op', {op: 'div', dest: 'юнитX', a: 'юнитX', b: '8'}),
    withParams('op', {op: 'div', dest: 'юнитY', a: 'юнитY', b: '8'}),
    withParams('setmarker', {type: 'pos', id: '3', p1: 'юнитX', p2: 'юнитY', p3: '0'})
]
