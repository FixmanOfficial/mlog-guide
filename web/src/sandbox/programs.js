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
 * Пилот: водит два юнита разных типов навстречу друг другу.
 *
 * Показывает главное про управление юнитами. Во-первых, `ubind` выбирает юнита по типу —
 * поли и моно получают разные команды от одного процессора. Во-вторых, команда не «отправить
 * и забыть»: `ucontrol move` повторяется каждый круг, потому что без новых команд юнит через
 * 600 тиков уходит из-под контроля.
 *
 * Цель считается от `@tick`, а не от «долетел ли»: так она меняется ровно раз в четыре
 * секунды и оба юнита идут ровно, без дёрганья.
 */
export const PILOT = [
    withParams('op', {op: 'idiv', dest: 'фаза', a: '@tick', b: '240'}),
    withParams('op', {op: 'mod', dest: 'фаза', a: 'фаза', b: '2'}),
    withParams('op', {op: 'mul', dest: 'цель', a: 'фаза', b: '13'}),
    withParams('op', {op: 'add', dest: 'цель', a: 'цель', b: '3'}),

    withParams('ubind', {type: '@poly'}),
    withParams('ucontrol', {type: 'move', p1: 'цель', p2: '1'}),

    // Моно ходит навстречу: 19 минус цель — это те же 3 и 16, только наоборот
    withParams('op', {op: 'sub', dest: 'встречно', a: '19', b: 'цель'}),
    withParams('ubind', {type: '@mono'}),
    withParams('ucontrol', {type: 'move', p1: 'встречно', p2: '9'})
]
