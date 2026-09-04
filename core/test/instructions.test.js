/**
 * Схема инструкций — то, по чему редактор строит блоки. Проверяем, что она согласована
 * с реализацией: разойтись им нельзя, иначе редактор предложит то, чего процессор не исполнит.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

import {KNOWN_INSTRUCTIONS} from '../src/assembler.js'
import {operations, conditions} from '../src/ops.js'
import {LACCESS} from '../src/assembler.js'

const schema = JSON.parse(readFileSync(new URL('../data/instructions.json', import.meta.url), 'utf8'))
const opcodes = schema.instructions.map(instruction => instruction.opcode)

test('в схеме 53 инструкции: 27 процессорных и 26 мира', () => {
    assert.equal(schema.counts.instructions, 53)
    assert.equal(schema.counts.processor, 27)
    assert.equal(schema.counts.world, 26)
})

test('закомментированная регистрация комментария не попала в схему', () => {
    // В LStatements.java у «#» строка @RegisterStatement закомментирована
    assert.equal(opcodes.includes('#'), false)
})

test('список известных инструкций в сборщике совпадает со схемой', () => {
    assert.deepEqual([...KNOWN_INSTRUCTIONS].sort(), [...opcodes].sort())
})

test('перечисление операций совпадает с реализацией op', () => {
    assert.deepEqual(schema.enums.LogicOp.sort(), Object.keys(operations).sort())
})

test('перечисление условий совпадает с реализацией jump', () => {
    assert.deepEqual(schema.enums.ConditionOp.sort(), Object.keys(conditions).sort())
})

test('перечисление свойств совпадает со списком LAccess в сборщике', () => {
    assert.deepEqual(schema.enums.LAccess.sort(), [...LACCESS].sort())
})

test('порядок параметров совпадает с порядком записи в текст', () => {
    const params = (opcode) =>
        schema.instructions.find(instruction => instruction.opcode === opcode).params.map(p => p.name)

    // read output target address — именно в таком порядке инструкция пишется и читается
    assert.deepEqual(params('read'), ['output', 'target', 'address'])
    assert.deepEqual(params('op'), ['op', 'dest', 'a', 'b'])
    assert.deepEqual(params('jump'), ['destIndex', 'op', 'value', 'compare'])
})

test('у каждой инструкции есть категория из известного набора', () => {
    const categories = new Set(['io', 'block', 'operation', 'control', 'unit', 'world', 'unknown'])

    for (const instruction of schema.instructions) {
        assert.ok(categories.has(instruction.category), `${instruction.opcode}: ${instruction.category}`)
    }
})

test('наследники получают параметры родителя', () => {
    // uradar объявлен как наследник radar и своих полей не имеет
    const radar = schema.instructions.find(instruction => instruction.opcode === 'radar')
    const uradar = schema.instructions.find(instruction => instruction.opcode === 'uradar')

    assert.ok(uradar.params.length > 0)
    assert.deepEqual(uradar.params.map(p => p.name), radar.params.map(p => p.name))
})

test('первая версия покрывает двадцать две инструкции', () => {
    const deferred = new Set(['radar', 'ubind', 'ucontrol', 'uradar', 'ulocate'])

    const v1 = schema.instructions.filter(instruction =>
        !instruction.privileged && !deferred.has(instruction.opcode))

    assert.equal(v1.length, 22)
})
