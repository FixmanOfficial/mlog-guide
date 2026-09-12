/**
 * Пункты docs/findings.md, не закрытые остальными файлами: мелкая семантика, которую
 * легко потерять при рефакторинге, потому что она выглядит случайной.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import {Processor} from '../src/vm.js'
import {assemble} from '../src/assembler.js'
import {parse, MAX_TOKENS, MAX_LABELS, MAX_INSTRUCTIONS} from '../src/parser.js'
import {LVar} from '../src/lvar.js'
import {World} from '../src/world.js'
import {createContent} from '../src/content.js'
import {readFileSync} from 'node:fs'

const logicIds = JSON.parse(readFileSync(new URL('../data/logic-ids.json', import.meta.url), 'utf8'))
const content = createContent(logicIds)

const run = (code, steps = 16) => {
    const processor = new Processor(code)
    processor.run(steps)
    return processor
}

test('порог истинности 1e-5, а эпсилон сравнения 1e-6 — числа разные', () => {
    const variable = new LVar('t')

    variable.setnum(0.00001)
    assert.equal(variable.bool(), true)

    variable.setnum(0.000005)
    assert.equal(variable.bool(), false)

    // То же число для op не равно нулю: его порог в десять раз меньше.
    // Значение одновременно «ложь» и «не ноль» — из-за разных порогов
    assert.equal(run('op equal result 0.000005 0').num('result'), 0)
    assert.equal(run('op equal result 0.0000005 0').num('result'), 1)
})

test('объект в числовом контексте даёт единицу, пустой объект — ноль', () => {
    assert.equal(run('op add result "текст" 0').num('result'), 1)
    assert.equal(run('op add result null 0').num('result'), 0)
})

test('jump с адресом -1 не делает ничего', () => {
    // Метка не найдена, адрес остался -1: исполнение просто идёт дальше
    const processor = new Processor('jump нету always\nset result 1')
    processor.run(2)

    assert.equal(processor.num('result'), 1)
})

test('бесконечность в литерале превращается в ноль', () => {
    // 1e400 не помещается в double, разбор даёт бесконечность, а она приводится к нулю
    const processor = new Processor('set result 1e400')
    processor.run(1)

    assert.equal(processor.num('result'), 0)
})

test('единственное экранирование в строке — перевод строки', () => {
    const processor = new Processor('print "первая\\nвторая"')
    processor.run(1)

    assert.equal(processor.textBuffer, 'первая\nвторая')
})

test('обратный слэш перед другим символом остаётся как есть', () => {
    const processor = new Processor('print "путь\\файл"')
    processor.run(1)

    assert.ok(processor.textBuffer.includes('\\'))
})

test('π это алиас @pi', () => {
    const processor = new Processor('set a @pi\nset b π')
    processor.run(2)

    assert.equal(processor.num('a'), processor.num('b'))
})

test('@configure и configure переименовываются в @config и config', () => {
    const {statements} = parse('control configure block1 0 0 0 0\nsensor result block1 @configure')

    assert.equal(statements[0].params[0], 'config')
    assert.equal(statements[1].params[2], '@config')
})

test('в строке не больше шестнадцати токенов', () => {
    const tokens = Array.from({length: MAX_TOKENS + 4}, (_, i) => `t${i}`).join(' ')
    const {diagnostics} = parse(`op ${tokens}`)

    assert.equal(diagnostics[0].code, 'parse.too-many-tokens')
})

test('меток не больше пятисот', () => {
    const labels = Array.from({length: MAX_LABELS + 2}, (_, i) => `м${i}:`).join('\n')
    const {diagnostics} = parse(labels)

    assert.equal(diagnostics[0].code, 'parse.too-many-labels')
})

test('повторная метка сообщается диагностикой', () => {
    const {diagnostics} = parse('метка:\nset a 1\nметка:\nset b 2')

    assert.equal(diagnostics[0].code, 'parse.duplicate-label')
    assert.equal(diagnostics[0].label, 'метка')
})

test('инструкций не больше тысячи', () => {
    const long = Array.from({length: MAX_INSTRUCTIONS + 50}, () => 'set a 1').join('\n')
    const {statements} = parse(long)

    assert.equal(statements.length, MAX_INSTRUCTIONS)
})

test('константу присвоить нельзя', () => {
    const processor = new Processor('set @pi 3\nset result @pi')
    processor.run(2)

    assert.equal(processor.num('result'), 3.1415927410125732)
})

test('sensor от пустого значения со свойством @dead возвращает единицу', () => {
    const processor = new Processor('sensor result нету @dead')
    processor.run(1)

    assert.equal(processor.num('result'), 1)
})

test('sensor от строки со свойством @size даёт её длину', () => {
    const processor = new Processor('set текст "абвг"\nsensor result текст @size')
    processor.run(2)

    assert.equal(processor.num('result'), 4)
})

test('текстовый буфер не растёт за четыреста символов', () => {
    const processor = new Processor('print "аб"')

    for (let i = 0; i < 500; i++) processor.step()

    assert.equal(processor.textBuffer.length, 400)
})

test('графический буфер не растёт за двести пятьдесят шесть команд', () => {
    const processor = new Processor('draw rect 0 0 1 1')

    for (let i = 0; i < 400; i++) processor.step()

    assert.equal(processor.graphicsBuffer.length, 256)
})

test('нераспознанная операция op сообщается отдельно от неизвестной инструкции', () => {
    const {diagnostics} = assemble('op неведомая result 1 2')

    assert.equal(diagnostics[0].code, 'assemble.unknown-operation')
    assert.equal(diagnostics[0].operation, 'неведомая')
})

test('нераспознанное условие jump тоже даёт свою диагностику', () => {
    const {diagnostics} = assemble('jump 0 неведомое 1 2')

    assert.equal(diagnostics[0].code, 'assemble.unknown-condition')
})

test('диагностика несёт номер строки и данные, но не текст', () => {
    const [diagnostic] = assemble('set a 1\nsett b 2').diagnostics

    assert.equal(diagnostic.line, 1)
    assert.equal(diagnostic.instruction, 'sett')
    // Ядро не отдаёт готовых строк для пользователя: их собирает сайт
    assert.equal(Object.values(diagnostic).some(value => typeof value === 'string' && value.includes(' ')), false)
})

/*
 * Правки v160.1. Каждая — отдельное поведение, которое до обновления было другим.
 */

test('камеру обычный процессор не читает', () => {
    const world = new World({width: 12, height: 12, content})
    const building = world.place('micro-processor', 3, 3)

    const processor = new Processor('sensor c @this @cameraX',
        {world, content, globals: content.globals, building})

    processor.run(4)

    /*
     * `LAccess.privilegedAccess`, v160: обычному процессору камера отвечает null. У мирового
     * она отвечала бы числом, но самой камеры в модели нет вовсе — см. `docs/parity.md`.
     */
    assert.equal(processor.get('c').isobj, true)
    assert.equal(processor.get('c').objval, null)
})

test('setrate доступен обычному процессору, но в пределах своей скорости', () => {
    const world = new World({width: 12, height: 12, content})
    const building = world.place('micro-processor', 3, 3)

    /*
     * У микропроцессора две инструкции за тик, и больше двух он себе не поставит.
     * До v160 инструкция была привилегированной и обычному процессору не давалась вовсе.
     */
    const processor = new Processor('setrate 25',
        {world, content, globals: content.globals, building, ipt: building.spec.ipt})

    processor.run(4)

    assert.deepEqual(processor.diagnostics, [])
    assert.equal(processor.ipt, 2)
})

test('статус накладывается константой контента, а не строкой', () => {
    const world = new World({width: 16, height: 16, content})

    // Инструкция привилегированная, а привилегии процессору даёт его блок
    const building = world.place('world-processor', 3, 3)
    const unit = world.spawn('dagger', 8, 8, 1)

    const processor = new Processor([
        'ubind @dagger',
        'status false @status-burning @unit 10',
        'stop'
    ].join('\n'), {world, content, globals: content.globals, building, team: 1})

    processor.run(8)

    assert.deepEqual(processor.diagnostics, [])
    assert.equal(unit.hasEffect('burning'), true)

    // Имя строкой больше не принимается: это не эффект, а обычная пустая переменная
    const other = world.spawn('dagger', 10, 10, 1)

    const old = new Processor([
        'ubind @dagger',
        'status false burning @unit 10',
        'stop'
    ].join('\n'), {world, content, globals: content.globals, building, team: 1})

    old.run(8)
    assert.equal(other.hasEffect('burning'), false)
})
