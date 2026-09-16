/**
 * Как команда `draw` доезжает до дисплея.
 *
 * Главное здесь — упаковка: в игре команда лежит в long полями по 10 бит, поэтому от каждого
 * параметра остаются девять бит модуля и бит знака. Всё, что не влезло, оборачивается,
 * а дробная часть пропадает ещё раньше, на приведении к int.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import {World} from '../src/world.js'
import {Processor, SCALE_STEP} from '../src/vm.js'
import {createContent} from '../src/content.js'
import logicIds from '../data/logic-ids.json' with {type: 'json'}

const content = createContent(logicIds)

/** Мир с дисплеем и процессором, подключённым к нему. */
function setup(code) {
    const world = new World()
    const display = world.add('large-logic-display')
    const processor = new Processor(code, {links: [display], world, content, globals: content.globals})

    world.addProcessor(processor)
    return {processor, display}
}

/** Гоняет программу и отдаёт то, что дисплей получил после drawflush. */
function draw(code) {
    const {processor, display} = setup(`${code}\ndrawflush display1`)
    processor.run(40)
    return display.commands
}

test('параметры draw усекаются до целых', () => {
    const [command] = draw('draw rect 10.9 -3.7 5.5 5.5')

    assert.equal(command.x, 10)
    assert.equal(command.y, -3)
    assert.equal(command.p1, 5)
})

test('параметры draw обрезаются до девяти бит с отдельным знаком', () => {
    // LExecutor.DrawI.packSign: abs(value) & 511, знак отдельным битом
    const [command] = draw('draw rect 600 -600 1024 511')

    assert.equal(command.x, 600 & 511)
    assert.equal(command.y, -(600 & 511))
    assert.equal(command.p1, 0)
    assert.equal(command.p2, 511)
})

test('draw scale хранится шагами по 0.05', () => {
    // LogicDisplay.scaleStep: в буфер уходит число шагов, а не сам масштаб
    const [command] = draw('draw scale 2 -0.5')

    assert.equal(command.x, 2 / SCALE_STEP)
    assert.equal(command.y, -Math.trunc(0.5 / SCALE_STEP))
})

test('draw col раскладывается в обычную команду color', () => {
    // DrawI разбирает упакованный цвет сам, до дисплея доезжает уже color
    const [command] = draw('draw col %ff8000c0')

    assert.equal(command.type, 'color')
    assert.deepEqual([command.x, command.y, command.p1, command.p2], [255, 128, 0, 192])
})

test('draw image несёт объект контента, а не число', () => {
    const [command] = draw('draw image 40 40 @router 32 0')

    assert.equal(command.content.name, 'router')
    assert.equal(command.content.contentType, 'block')
    assert.equal(command.p2, 32)
})

test('координаты глифов draw print тоже упаковываются', () => {
    const commands = draw('print "A"\ndraw print 600 0 @bottomLeft')

    assert.equal(commands[0].char, 'A')
    assert.equal(commands[0].x, 600 & 511)
})

test('рендер вычерпывает очередь дисплея, как это делает игра', () => {
    const {processor, display} = setup('draw rect 0 0 10 10\ndrawflush display1')
    processor.run(2)

    assert.equal(display.sense('bufferSize'), 1)
    assert.equal(display.take().length, 1)
    // После отрисовки очередь пуста, а счётчик операций остаётся
    assert.equal(display.sense('bufferSize'), 0)
    assert.equal(display.sense('operations'), 1)
})

/** Младшие 32 бита числа — там игра держит цвет. Color.toDoubleBits */
function colorBits(value) {
    const view = new DataView(new ArrayBuffer(8))
    view.setFloat64(0, value)
    return view.getUint32(4) >>> 0
}

test('packcolor кладёт RGBA в младшие 32 бита double и усекает каналы', () => {
    // Color.rgba8888 умножает во float и приводит к int: половина даёт 127, а не 128
    const {processor} = setup('packcolor c 1 0.5 0 1')
    processor.run(1)

    assert.equal(colorBits(processor.num('c')), 0xff7f00ff)
})

test('литерал %RRGGBBAA даёт те же биты, что packcolor', () => {
    const {processor} = setup('set c %ff7f00ff')
    processor.run(1)

    assert.equal(colorBits(processor.num('c')), 0xff7f00ff)
})

test('в литерале цвета мусор читается нулём, а не ошибкой', () => {
    // Strings.parseInt возвращает значение по умолчанию, поэтому %zzzzzz — чёрный
    const {processor} = setup('set c %zzzzzz')
    processor.run(1)

    assert.equal(colorBits(processor.num('c')), 0x000000ff)
})

test('unpackcolor разбирает цвет обратно по каналам', () => {
    const {processor} = setup('unpackcolor r g b a %ff7f00c0')
    processor.run(1)

    assert.equal(processor.num('r'), 1)
    assert.equal(processor.num('g'), 127 / 255)
    assert.equal(processor.num('b'), 0)
    assert.equal(processor.num('a'), 192 / 255)
})

test('@bottomLeft и соседние выравнивания есть в константах', () => {
    // GlobalVars.java:151 раскладывает LStatement.nameToAlign в константы
    const {processor} = setup('set a @bottomLeft\nset b @center\nset c @topRight')
    processor.run(3)

    assert.equal(processor.num('a'), 12)
    assert.equal(processor.num('b'), 1)
    assert.equal(processor.num('c'), 18)
})

test('draw scale делит во float: 0.15 — это три шага, а не два', () => {
    // LExecutor.DrawI: `(int)(x.numf() / LogicDisplay.scaleStep)`, где scaleStep — float
    const processor = new Processor('draw scale 0.15 0.35')
    processor.run(1)

    const [command] = processor.graphicsBuffer
    assert.equal(command.x, 3)
    assert.equal(command.y, 7)
})

test('draw print считает суррогатную пару двумя символами', () => {
    // LExecutor.DrawI: обход `str.charAt(i)` — по 16-битным кодам
    const processor = new Processor('printchar 55357\nprintchar 56832\nprint "A"\ndraw print 0 0 @topLeft')
    processor.run(4)

    const [command] = processor.graphicsBuffer
    assert.equal(command.char, 'A')
    assert.equal(command.x, 14, 'A стоит третьим: перед ним два шага')
})
