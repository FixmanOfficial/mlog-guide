/**
 * Редактор обязан выдавать текст, который ядро разбирает без диагностик. Это и есть контракт
 * между модулями: дальше текста они друг о друге ничего не знают.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import {assemble} from '@mlog/core'
import {Processor} from '@mlog/core/src/vm.js'

import {createStatement, operations, toText, AVAILABLE, INSTRUCTIONS} from '../src/program.js'

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
