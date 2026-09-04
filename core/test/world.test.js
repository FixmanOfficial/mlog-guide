import test from 'node:test'
import assert from 'node:assert/strict'

import {World, DOOR_TOGGLE_DELAY} from '../src/world.js'
import {Processor} from '../src/vm.js'

/** Собирает мир с набором блоков и процессор, подключённый ко всем сразу. */
function setup(code, types = ['memory-cell', 'message', 'large-logic-display', 'switch']) {
    const world = new World()
    const links = types.map(type => world.add(type))
    const processor = new Processor(code, {links, world})

    world.addProcessor(processor)
    return {world, processor, links}
}

test('read и write ходят в ячейку памяти', () => {
    const {processor, links} = setup('write 42 cell1 3\nread result cell1 3')
    processor.run(2)

    assert.equal(links[0].memory[3], 42)
    assert.equal(processor.num('result'), 42)
})

test('чтение за границей памяти даёт не ноль, а пустое значение', () => {
    const {processor} = setup('read result cell1 999')
    processor.run(1)

    // NaN при записи в переменную превращается в объект null
    const result = processor.get('result')
    assert.equal(result.isobj, true)
    assert.equal(result.objval, null)
})

test('запись за границей памяти молча игнорируется', () => {
    const {processor, links} = setup('write 42 cell1 999')
    processor.run(1)

    assert.ok(links[0].memory.every(value => value === 0))
})

test('print собирает буфер, printflush отдаёт его в блок сообщений', () => {
    const {processor, links} = setup('print "заряд "\nprint 63\nprintflush message1')
    processor.run(3)

    assert.equal(links[1].message, 'заряд 63')
    // Буфер после сброса пуст
    assert.equal(processor.textBuffer, '')
})

test('целое печатается без дробной части, дробное — с ней', () => {
    const {processor, links} = setup('print 5\nprint " и "\nprint 2.5\nprintflush message1')
    processor.run(4)

    assert.equal(links[1].message, '5 и 2.5')
})

test('format подставляет в место с наименьшим номером, а не в первое', () => {
    const {processor, links} = setup('print "{1} и {0}"\nformat "первый"\nprintflush message1')
    processor.run(3)

    assert.equal(links[1].message, '{1} и первый')
})

test('format без подходящего места не делает ничего', () => {
    const {processor, links} = setup('print "без мест"\nformat 1\nprintflush message1')
    processor.run(3)

    assert.equal(links[1].message, 'без мест')
})

test('printflush чистит буфер даже когда цель не подходит', () => {
    const {processor} = setup('print "текст"\nprintflush cell1')
    processor.run(2)

    assert.equal(processor.textBuffer, '')
})

test('draw копит команды, drawflush отдаёт их дисплею', () => {
    const {processor, links} = setup('draw clear 20 20 20\ndraw rect 0 0 10 5\ndrawflush display1')
    processor.run(3)

    const display = links[2]
    assert.deepEqual(display.commands.map(command => command.type), ['clear', 'rect'])
    assert.equal(display.commands[1].p1, 10)
    assert.equal(processor.graphicsBuffer.length, 0)
    // Счётчик операций растёт при каждом сбросе
    assert.equal(display.operations, 1)
})

test('sensor читает свойства блока', () => {
    const {processor} = setup([
        'sensor cap cell1 @memoryCapacity',
        'sensor width display1 @displayWidth',
        'sensor alive cell1 @health'
    ].join('\n'))
    processor.run(3)

    assert.equal(processor.num('cap'), 64)
    assert.equal(processor.num('width'), 176)
    assert.equal(processor.num('alive'), 130)
})

test('неизвестное свойство даёт пустое значение, а не ноль', () => {
    const {processor} = setup('sensor result cell1 @heat')
    processor.run(1)

    // sense вернул NaN, а NaN в переменной становится объектом null
    assert.equal(processor.get('result').isobj, true)
})

test('control переключает блок, sensor это видит', () => {
    const {processor, links} = setup('control enabled switch1 0 0 0 0\nsensor result switch1 @enabled')
    processor.run(2)

    assert.equal(links[3].enabled, false)
    assert.equal(processor.num('result'), 0)
})

test('дверь не переключается чаще таймера', () => {
    const world = new World()
    const door = world.add('door')
    const processor = new Processor('control enabled door1 1 0 0 0', {links: [door], world})

    processor.run(1)
    assert.equal(door.open, true)

    processor.run(1)
    door.control('enabled', 0)
    // Слишком рано: отказ, дверь осталась открытой
    assert.equal(door.open, true)

    world.tick += DOOR_TOGGLE_DELAY
    door.control('enabled', 0)
    assert.equal(door.open, false)
})

test('getlink выдаёт здания по порядку подключения', () => {
    const {processor, links} = setup('getlink first 0\ngetlink missing 99')
    processor.run(2)

    assert.equal(processor.get('first').objval, links[0])
    assert.equal(processor.get('missing').objval, null)
})

test('@links знает число подключённых блоков', () => {
    const {processor} = setup('set result @links')
    processor.run(1)

    assert.equal(processor.num('result'), 4)
})

test('select выбирает значение по условию', () => {
    const {processor} = setup('select result lessThan 1 2 "меньше" "больше"')
    processor.run(1)

    assert.equal(processor.get('result').objval, 'меньше')
})

test('packcolor и unpackcolor работают в долях от нуля до единицы', () => {
    const {processor} = setup('packcolor c 1 0.5 0 1\nunpackcolor r g b a c')
    processor.run(2)

    assert.equal(processor.num('r'), 1)
    assert.ok(Math.abs(processor.num('g') - 0.5) < 0.01)
    assert.equal(processor.num('b'), 0)
})

test('wait задерживает исполнение и уступает', () => {
    const world = new World()
    const processor = new Processor('op add count count 1\nwait 1', {world, ipt: 8})
    world.addProcessor(processor)

    world.steps(10)
    // Секунда не прошла: счётчик увеличился один раз, дальше процессор ждёт
    assert.equal(processor.num('count'), 1)

    world.steps(60)
    assert.ok(processor.num('count') > 1)
})

test('мир двигает время, процессор его видит', () => {
    const world = new World()
    const processor = new Processor('set t @tick\nset s @second', {world})
    world.addProcessor(processor)

    world.steps(120)

    assert.equal(processor.num('t'), 120)
    assert.equal(processor.num('s'), 2)
})

test('здание находится по тайлу', () => {
    const world = new World()
    const display = world.add('large-logic-display', {x: 10, y: 10})

    assert.equal(world.at(10, 10), display)
    assert.equal(world.at(12, 12), display)
    assert.equal(world.at(20, 20), undefined)
})

test('draw print раскладывает текст по символам моноширинного шрифта', () => {
    const {processor, links} = setup('print "AB"\ndraw print 10 20 0\ndrawflush display1')
    processor.run(3)

    const glyphs = links[2].commands
    assert.equal(glyphs.length, 2)
    assert.deepEqual(glyphs.map(g => g.char), ['A', 'B'])

    // Шаг 7 пикселей: шрифт логического дисплея моноширинный
    assert.equal(glyphs[1].x - glyphs[0].x, 7)
})

test('draw print расходует текстовый буфер', () => {
    const {processor} = setup('print "AB"\ndraw print 0 0 0')
    processor.run(2)

    assert.equal(processor.textBuffer, '')
})

test('кириллица не рисуется, но место занимает', () => {
    const {processor, links} = setup('print "AяB"\ndraw print 0 0 0\ndrawflush display1')
    processor.run(3)

    const glyphs = links[2].commands
    // В наборе шрифта только ASCII, поэтому я не даёт команды вовсе
    assert.deepEqual(glyphs.map(g => g.char), ['A', 'B'])
    // Но курсор через неё шагнул: между A и B две ширины символа
    assert.equal(glyphs[1].x - glyphs[0].x, 14)
})

test('пробела в наборе шрифта нет', () => {
    const {processor, links} = setup('print "A B"\ndraw print 0 0 0\ndrawflush display1')
    processor.run(3)

    assert.equal(links[2].commands.length, 2)
})

test('перенос строки сдвигает вниз на высоту строки', () => {
    // В исходнике mlog это два символа, обратный слэш и n: их раскрывает сборщик
    const {processor, links} = setup('print "A\\nB"\ndraw print 0 0 0\ndrawflush display1')
    processor.run(3)

    const [first, second] = links[2].commands
    assert.equal(first.x, second.x)
    assert.equal(first.y - second.y, 13)
})
