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

test('подсказка по раскладке либо полна, либо честно помечена', () => {
    for (const instruction of schema.instructions) {
        const hint = instruction.layoutHint
        if (hint === null || !hint.complete) continue

        // Полной считается только та, где упомянут каждый параметр
        const used = new Set(hint.items.filter(item => item.param).map(item => item.param))
        for (const param of instruction.params) {
            assert.ok(used.has(param.name), `${instruction.opcode}: нет ${param.name}`)
        }
    }
})

test('раскладка ссылается только на существующие параметры', () => {
    for (const instruction of schema.instructions) {
        const names = new Set(instruction.params.map(param => param.name))

        for (const item of instruction.layoutHint?.items ?? []) {
            if (item.param === undefined) continue
            assert.ok(names.has(item.param), `${instruction.opcode}: лишний ${item.param}`)
        }
    }
})

test('символы операций сняты из перечисления', () => {
    // На кнопке в редакторе стоит символ, а не имя значения. LogicOp.toString
    assert.equal(schema.enumSymbols.LogicOp.add, '+')
    assert.equal(schema.enumSymbols.LogicOp.idiv, '//')
    assert.equal(schema.enumSymbols.LogicOp.emod, '%%')
    assert.equal(schema.enumSymbols.LogicOp.strictEqual, '===')
    assert.equal(schema.enumSymbols.LogicOp.and, 'b-and')
    assert.equal(schema.enumSymbols.LogicOp.not, 'flip')
})

test('символ есть у каждой операции и каждого условия', () => {
    for (const value of schema.enums.LogicOp) {
        assert.ok(schema.enumSymbols.LogicOp[value] !== undefined, value)
    }
    for (const value of schema.enums.ConditionOp) {
        assert.ok(schema.enumSymbols.ConditionOp[value] !== undefined, value)
    }
})

test('функциями записываются шесть операций', () => {
    const funcs = Object.keys(schema.enumFlags.LogicOp ?? {}).sort()

    assert.deepEqual(funcs, ['angle', 'angleDiff', 'len', 'max', 'min', 'noise'])
})

test('меню выбора у setblock короче перечисления: слой building не ставится', () => {
    const set = schema.instructions.find(item => item.opcode === 'setblock')
    const get = schema.instructions.find(item => item.opcode === 'getblock')

    // TileLayer.settable в игре: {floor, ore, block}. Здание появляется вместе с блоком,
    // отдельно его не поставить
    assert.deepEqual(set.params[0].options, ['floor', 'ore', 'block'])

    // А читать можно все четыре слоя, поэтому у getblock подмножества нет
    assert.equal(get.params[0].options, undefined)
    assert.deepEqual(schema.enums.TileLayer, ['floor', 'ore', 'block', 'building'])
})
