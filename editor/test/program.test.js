/**
 * Редактор обязан выдавать текст, который ядро разбирает без диагностик. Это и есть контракт
 * между модулями: дальше текста они друг о друге ничего не знают.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import {assemble} from '@mlog/core'
import {Processor} from '@mlog/core/src/vm.js'

import {
    createStatement, operations, toText, AVAILABLE, INSTRUCTIONS,
    visibleParams, SENSEABLE, CONTROLS, sanitize, targetIndex
} from '../src/program.js'

const withParams = (opcode, params) => {
    const statement = createStatement(opcode)
    return {...statement, params: {...statement.params, ...params}}
}

test('новая инструкция получает значения по умолчанию из схемы', () => {
    const statement = createStatement('read')

    assert.equal(statement.opcode, 'read')
    assert.deepEqual(statement.params, {output: 'result', target: 'cell1', address: '0'})
})

test('текст собирается в порядке параметров из схемы', () => {
    const text = toText([withParams('write', {input: 'x', target: 'cell1', address: '5'})])

    assert.equal(text, 'write x cell1 5')
})

test('каждая доступная инструкция собирается в текст, который ядро понимает', () => {
    for (const instruction of AVAILABLE) {
        const text = toText([createStatement(instruction.opcode)])
        const {diagnostics} = assemble(text)

        const unexpected = diagnostics.filter(diagnostic =>
            diagnostic.code !== 'run.not-implemented')

        assert.deepEqual(unexpected, [], `${instruction.opcode}: ${text}`)
    }
})

test('собранная программа исполняется ядром', () => {
    const statements = [
        withParams('set', {to: 'level', from: '63'}),
        withParams('op', {op: 'mul', dest: 'width', a: 'level', b: '2'}),
        withParams('end', {})
    ]

    const processor = new Processor(toText(statements))
    processor.run(3)

    assert.equal(processor.num('width'), 126)
})

test('вставка, копирование и удаление не путают порядок', () => {
    let statements = [createStatement('set'), createStatement('end')]

    statements = operations.insert(statements, 1, createStatement('print'))
    assert.deepEqual(statements.map(s => s.opcode), ['set', 'print', 'end'])

    statements = operations.duplicate(statements, statements[1].id)
    assert.deepEqual(statements.map(s => s.opcode), ['set', 'print', 'print', 'end'])

    statements = operations.remove(statements, statements[2].id)
    assert.deepEqual(statements.map(s => s.opcode), ['set', 'print', 'end'])
})

test('копия получает свой идентификатор и независимые параметры', () => {
    const original = withParams('set', {to: 'a', from: '1'})
    const statements = operations.duplicate([original], original.id)
    const [first, second] = statements

    assert.notEqual(first.id, second.id)

    const changed = operations.setParam(statements, second.id, 'to', 'b')
    assert.equal(changed[0].params.to, 'a')
    assert.equal(changed[1].params.to, 'b')
})

test('перемещение двигает инструкцию, не теряя остальных', () => {
    const statements = [createStatement('set'), createStatement('print'), createStatement('end')]
    const moved = operations.move(statements, 0, 2)

    assert.deepEqual(moved.map(s => s.opcode), ['print', 'end', 'set'])
})

test('пустое значение параметра не ломает порядок аргументов', () => {
    const text = toText([withParams('op', {op: 'add', dest: 'r', a: '', b: '2'})])

    // Пустое место заменяется нулём, иначе b встало бы на место a
    assert.equal(text, 'op add r 0 2')
})

test('инструкции процессора мира в редактор не попадают', () => {
    assert.equal(AVAILABLE.some(instruction => instruction.opcode === 'setblock'), false)
    assert.equal(INSTRUCTIONS.has('setblock'), true)
})

test('control показывает столько полей, сколько у выбранного свойства', () => {
    const definition = INSTRUCTIONS.get('control')

    const enabled = visibleParams(definition, withParams('control', {type: 'enabled'}))
    const shoot = visibleParams(definition, withParams('control', {type: 'shoot'}))

    // enabled принимает одно значение, shoot — три
    assert.deepEqual(enabled.filter(entry => !entry.hidden).map(entry => entry.label),
        ['type', 'target', 'to'])
    assert.deepEqual(shoot.filter(entry => !entry.hidden).map(entry => entry.label),
        ['type', 'target', 'x', 'y', 'shoot'])
})

test('ucontrol без параметров не показывает ни одной ячейки', () => {
    const definition = INSTRUCTIONS.get('ucontrol')
    const idle = visibleParams(definition, withParams('ucontrol', {type: 'idle'}))

    assert.deepEqual(idle.filter(entry => !entry.hidden).map(entry => entry.label), ['type'])
})

test('ucontrol build подписывает все пять ячеек', () => {
    const definition = INSTRUCTIONS.get('ucontrol')
    const build = visibleParams(definition, withParams('ucontrol', {type: 'build'}))

    assert.deepEqual(build.filter(entry => !entry.hidden).map(entry => entry.label),
        ['type', 'x', 'y', 'block', 'rotation', 'config'])
})

test('скрытые ячейки всё равно попадают в текст: порядок аргументов важнее', () => {
    const text = toText([withParams('control', {type: 'enabled', target: 'switch1', p1: '1'})])

    assert.equal(text, 'control enabled switch1 1 0 0 0')
})

test('sensor и control предлагают разные наборы свойств', () => {
    // senseable — свойства не больше чем с одним параметром, controls — с параметрами
    assert.ok(SENSEABLE.includes('health'))
    assert.equal(SENSEABLE.includes('shoot'), false)

    assert.ok(CONTROLS.includes('shoot'))
    assert.equal(CONTROLS.includes('health'), false)
})

test('значение чистится при вводе, как в игре', () => {
    // Пробел, кавычка и точка с запятой сломали бы разбор — игра их подменяет
    assert.equal(sanitize('две слова'), 'две_слова')
    assert.equal(sanitize('a;b'), 'asb')
    assert.equal(sanitize('a"b'), "a'b")

    // Одиночный опасный символ заменяется целиком
    assert.equal(sanitize('"'), 'invalid')
    assert.equal(sanitize(';'), 'invalid')
})

test('строковый литерал переживает чистку, кавычки внутри становятся апострофами', () => {
    assert.equal(sanitize('"текст с пробелом"'), '"текст с пробелом"')
    assert.equal(sanitize('"а "вот" так"'), '"а \'вот\' так"')
})

test('цель перехода — ссылка, и вставка строки её не ломает', () => {
    let statements = [createStatement('set'), createStatement('set'), createStatement('jump')]
    statements[2].target = statements[0].id

    assert.equal(targetIndex(statements, statements[2]), 0)

    // Вставляем строку в самое начало: цель уехала на позицию 1, ссылка это учла
    statements = operations.insert(statements, 0, createStatement('print'))
    assert.equal(targetIndex(statements, statements[3]), 1)

    // А в тексте появится уже новый номер
    assert.ok(toText(statements).split('\n')[3].startsWith('jump 1 '))
})

test('удаление цели оставляет переход без адреса', () => {
    let statements = [createStatement('set'), createStatement('jump')]
    statements[1].target = statements[0].id

    statements = operations.remove(statements, statements[0].id)

    assert.equal(targetIndex(statements, statements[0]), -1)
    assert.ok(toText(statements).startsWith('jump -1 '))
})

test('цель переключается тем же нажатием', () => {
    let statements = [createStatement('set'), createStatement('jump')]
    const [first, jump] = statements

    statements = operations.setTarget(statements, jump.id, first.id)
    assert.equal(statements[1].target, first.id)

    // Повторный выбор той же строки снимает цель
    statements = operations.setTarget(statements, jump.id, first.id)
    assert.equal(statements[1].target, null)
})
