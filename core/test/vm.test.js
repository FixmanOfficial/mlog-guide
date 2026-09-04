import test from 'node:test'
import assert from 'node:assert/strict'

import {Processor, IPT, MAX_INSTRUCTION_SCALE} from '../src/vm.js'

test('счётчик указывает на следующую инструкцию уже во время исполнения текущей', () => {
    const processor = new Processor('set a @counter')
    processor.step()

    // Счётчик увеличивается до запуска инструкции, поэтому здесь единица, а не ноль
    assert.equal(processor.num('a'), 1)
})

test('код идёт по кругу', () => {
    const processor = new Processor('op add count count 1')
    processor.run(3)

    assert.equal(processor.num('count'), 3)
})

test('end отправляет счётчик за последнюю инструкцию, а на ноль его вернёт следующий шаг', () => {
    const processor = new Processor('set a 1\nend')

    processor.step()
    processor.step()
    assert.equal(processor.counter.numval, 2)

    processor.step()
    assert.equal(processor.counter.numval, 1)
})

test('jump переставляет счётчик', () => {
    const processor = new Processor('set a 1\njump 0 always\nset a 2')
    processor.run(4)

    // До третьей строки исполнение не доходит никогда
    assert.equal(processor.num('a'), 1)
})

test('jump с условием по объектам сравнивает объекты', () => {
    const processor = new Processor('jump 3 equal nothing null\nset a 1\nend\nset a 2')
    processor.run(4)

    assert.equal(processor.num('a'), 2)
})

test('запись объекта в счётчик не ломает исполнение', () => {
    const processor = new Processor('set @counter null\nset a 1')
    processor.run(4)

    // Счётчик принудительно становится числовым на каждом шаге
    assert.equal(processor.counter.isobj, false)
})

test('stop застревает на себе и уступает', () => {
    const processor = new Processor('set a 1\nstop\nset a 2')
    processor.run(8)

    assert.equal(processor.stopped, true)
    assert.equal(processor.num('a'), 1)
})

test('накопленное прибавляется после цикла, а не до него', () => {
    const processor = new Processor('op add count count 1', {ipt: IPT.micro})

    // Первый тик приходит с пустым накопителем и ничего не исполняет
    assert.equal(processor.tick(), 0)
    assert.equal(processor.tick(), IPT.micro)
})

test('накопитель не растёт бесконечно при просадке кадров', () => {
    const processor = new Processor('op add count count 1', {ipt: IPT.logic})

    processor.tick(1000)
    const executed = processor.tick()

    assert.equal(executed, IPT.logic * MAX_INSTRUCTION_SCALE)
})

test('сброс возвращает переменные к значению по умолчанию', () => {
    const processor = new Processor('op add count count 1')
    processor.run(5)
    processor.reset()

    const count = processor.get('count')
    assert.equal(count.isobj, true)
    assert.equal(processor.counter.numval, 0)
})

test('пустая программа не исполняется', () => {
    const processor = new Processor('')

    assert.equal(processor.loaded, false)
    assert.equal(processor.step(), false)
})
