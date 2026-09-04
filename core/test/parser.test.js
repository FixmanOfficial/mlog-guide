import test from 'node:test'
import assert from 'node:assert/strict'

import {parse} from '../src/parser.js'
import {assemble} from '../src/assembler.js'
import {Processor} from '../src/vm.js'

test('точка с запятой разделяет инструкции наравне с переводом строки', () => {
    const {statements} = parse('set a 1; set b 2')

    assert.equal(statements.length, 2)
    assert.deepEqual(statements.map(s => s.op), ['set', 'set'])
})

test('решётка начинает комментарий до конца строки', () => {
    const {statements} = parse('set a 1 # это комментарий\nset b 2')

    assert.equal(statements.length, 2)
    assert.deepEqual(statements[0].params, ['a', '1'])
})

test('строковый литерал сохраняет пробелы и остаётся в кавычках', () => {
    const {statements} = parse('print "привет мир"')

    assert.deepEqual(statements[0].params, ['"привет мир"'])
})

test('метка не занимает номер инструкции', () => {
    const {statements, labels} = parse('set a 1\nметка:\nset b 2')

    assert.equal(statements.length, 2)
    assert.equal(labels.get('метка'), 1)
})

test('jump по метке получает её адрес', () => {
    const {statements} = parse('jump конец always\nset a 1\nконец:\nset b 2')

    assert.equal(statements[0].params[0], '2')
})

test('несуществующая метка даёт диагностику, а не падение', () => {
    const {diagnostics} = parse('jump нету always')

    assert.equal(diagnostics.length, 1)
    assert.equal(diagnostics[0].code, 'parse.undefined-label')
    assert.equal(diagnostics[0].label, 'нету')
})

test('незакрытая кавычка сообщается диагностикой', () => {
    const {diagnostics} = parse('print "без закрытия\nset a 1')

    assert.equal(diagnostics[0].code, 'parse.missing-closing-quote')
})

test('переменная по умолчанию — объект null, а не ноль', () => {
    const {vars} = assemble('set result nothing')
    const variable = vars.get('nothing')

    assert.equal(variable.isobj, true)
    assert.equal(variable.objval, null)
})

test('шестнадцатеричные и двоичные литералы разбираются со знаком', () => {
    const processor = new Processor('set a 0xff\nset b -0x10\nset c 0b1010')
    processor.run(3)

    assert.equal(processor.num('a'), 255)
    assert.equal(processor.num('b'), -16)
    assert.equal(processor.num('c'), 10)
})

test('в нестроковом токене пробелы становятся подчёркиванием', () => {
    const {vars} = assemble('set a b')

    assert.ok(vars.has('b'))
})

test('неизвестная инструкция и неперенесённая различаются', () => {
    const опечатка = assemble('sett a 1')
    const отложенная = assemble('radar enemy any any distance turret1 1 result')

    assert.equal(опечатка.diagnostics[0].code, 'assemble.unknown-instruction')
    assert.equal(отложенная.diagnostics[0].code, 'run.not-implemented')
})

test('нераспознанная строка занимает место в программе', () => {
    // Иначе адреса jump поедут относительно того, что видит ученик
    const {instructions} = assemble('set a 1\nsett b 2\nset c 3')

    assert.equal(instructions.length, 3)
})
