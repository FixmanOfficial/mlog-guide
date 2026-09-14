import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

import {World, DOOR_TOGGLE_DELAY, DOOR_TAP_DELAY, BLOCK_SPECS} from '../src/world.js'
import {Processor} from '../src/vm.js'
import {createContent} from '../src/content.js'

// Сортировщик — из `distribution.js`: без него мир соберёт его обычным зданием
import '../src/distribution.js'

const logicIds = JSON.parse(readFileSync(new URL('../data/logic-ids.json', import.meta.url), 'utf8'))
const icons = JSON.parse(readFileSync(new URL('../data/icons.json', import.meta.url), 'utf8'))

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

test('ячейка хранит объект объектом, а не единицей', () => {
    /*
     * `MemoryBlock.write` кладёт объект в `objectMemory`, а число в `numberMemory`
     * с меткой `sentinel`; `read` отдаёт то, что лежало. Положенное следом число
     * вытесняет объект.
     */
    const content = createContent(logicIds)
    const world = new World()
    const cell = world.add('memory-cell')

    const processor = new Processor([
        'write @copper cell1 0',
        'read result cell1 0',
        'write 7 cell1 0',
        'read again cell1 0'
    ].join('\n'), {world, links: [cell], content, globals: content.globals})

    world.addProcessor(processor)
    processor.run(4)

    assert.equal(processor.get('result').objval.name, 'copper')
    assert.equal(processor.num('again'), 7)
})

test('запись за границей памяти молча игнорируется', () => {
    const {processor, links} = setup('write 42 cell1 999')
    processor.run(1)

    assert.ok(links[0].memory.every(value => value === 0))
})

/**
 * Процессор как `LReadable`: сосед читается по имени переменной.
 *
 * `LogicBlock.LogicBuild.read/write`. Собирается вручную, потому что нужен второй процессор
 * со своей программой, а `setup` делает один.
 */
function pair(first, second) {
    const world = new World()
    const a = world.add('micro-processor', {x: 1, y: 1})
    const b = world.add('micro-processor', {x: 5, y: 1})
    const cell = world.add('memory-cell', {x: 8, y: 1})

    a.processor = new Processor(first, {links: [b], world, building: a})
    b.processor = new Processor(second, {links: [cell], world, building: b})

    world.addProcessor(a.processor)
    world.addProcessor(b.processor)

    return {world, a: a.processor, b: b.processor, blocks: {a, b}, cell}
}

test('read достаёт переменную соседнего процессора по имени', () => {
    const {world, a} = pair('read чужое processor2 "счёт"', 'set счёт 42')

    // Сосед должен успеть выставить переменную: первый круг читает пустоту
    for (let i = 0; i < 6; i++) world.step()

    assert.equal(a.num('чужое'), 42)
})

test('нет такой переменной — отдаётся связь соседа с этим именем', () => {
    /*
     * `optionalLink`: имя связи всегда кончается цифрой, и по нему у соседа ищется здание.
     * Своей связи с ячейкой у читающего при этом нет вовсе.
     */
    const {world, a, cell} = pair([
        'read ячейка processor2 "cell1"',
        'read ниЧего processor2 "склад"'
    ].join('\n'), 'set счёт 42')

    for (let i = 0; i < 6; i++) world.step()

    assert.equal(a.get('ячейка').objval, cell)
    assert.equal(a.get('ниЧего').objval, null)
})

test('адрес числом отдаёт связь соседа по номеру', () => {
    const {world, a, cell} = pair([
        'read первая processor2 0',
        'read второй processor2 1'
    ].join('\n'), 'set счёт 42')

    for (let i = 0; i < 6; i++) world.step()

    assert.equal(a.get('первая').objval, cell)
    assert.equal(a.get('второй').objval, null)
})

test('write кладёт значение в переменную соседа, но не заводит новую', () => {
    // У соседа программа из одного круга: иначе он затирал бы записанное своим же `set`
    const {world, b} = pair([
        'write 99 processor2 "принято"',
        'write 7 processor2 "новая"'
    ].join('\n'), 'set принято 0\nstop')

    for (let i = 0; i < 6; i++) world.step()

    assert.equal(b.num('принято'), 99)
    assert.equal(b.get('новая'), undefined)
})

test('константы закрыты: их не переписать у соседа и не подменить чтением', () => {
    /*
     * `LogicBuild.write` проверяет `at.constant`, а `read` — `output.constant`: копирование
     * переменной в константу не происходит вовсе. Проверяется прямо по этому уговору:
     * константы вроде `@pi` живут в общей таблице, а не среди переменных программы.
     */
    const {world, b, blocks} = pair('stop', 'set счёт 42')

    for (let i = 0; i < 4; i++) world.step()

    // Чтение в константу отказывается «ничего не делать», а в обычную переменную идёт
    assert.equal(blocks.b.read('счёт', null, {constant: true}), undefined)
    assert.equal(blocks.b.read('счёт', null, {constant: false}), 42)

    // Связь по имени в константу положить можно: в игре проверка стоит только на копировании
    assert.equal(blocks.b.read('cell1', null, {constant: true})?.type, 'memory-cell')

    b.get('счёт').constant = true
    blocks.b.write('счёт', 7)
    assert.equal(b.num('счёт'), 42)
})

test('через @this процессор читает собственную переменную и свои связи', () => {
    const {world, a} = pair([
        'set своё 8',
        'read копия @this "своё"',
        'read связь @this 0'
    ].join('\n'), 'stop')

    for (let i = 0; i < 6; i++) world.step()

    assert.equal(a.num('копия'), 8)
    assert.equal(a.get('связь').objval.type, 'micro-processor')
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

test('printchar пишет знак по коду, а контенту — его иконку', () => {
    /*
     * `PrintCharI`: число это код UTF-16 с усечением вниз, `UnlockableContent` даёт свой
     * знак (`emojiChar`), а всё остальное пропускается. Коды знаков снимает
     * `tools/gen-icons.mjs` из `icons/icons.properties`.
     */
    const content = createContent(logicIds)
    const world = new World()
    const cell = world.add('memory-cell')

    const processor = new Processor([
        'printchar 65',
        'printchar 66.9',
        'printchar @copper',
        'printchar cell1',
        'printchar "текст"',
        'printchar null'
    ].join('\n'), {world, links: [cell], content, globals: content.globals})

    world.addProcessor(processor)
    processor.run(6)

    assert.equal(processor.textBuffer,
        'AB' + String.fromCharCode(icons.content.copper))
})

test('print показывает у здания тип блока, а не имя связи', () => {
    /*
     * `PrintI.toString` печатает `build.block.name`, а имени связи в игре у здания нет
     * вовсе: оно принадлежит процессору, а не блоку. Поэтому `print container1` даёт
     * `container`. LExecutor.PrintI.toString
     */
    const {processor} = setup([
        'print cell1',
        'print " "',
        'print message1'
    ].join('\n'), ['memory-cell', 'message'])

    processor.run(3)

    assert.equal(processor.textBuffer, 'memory-cell message')
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

    // Здоровье в игре не задано числом, а выведено из размера и состава: Block.init
    assert.equal(processor.num('alive'), 40)
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

test('control config меняет настройку сортировщика, но только объектом', () => {
    /*
     * `BuildingComp.control(LAccess, Object, …)`: настройка меняется у блоков с поднятым
     * `logicConfigurable` и только объектом — число не настраивает ничего.
     */
    const content = createContent(logicIds)
    const world = new World({content})
    const sorter = world.add('sorter', {x: 1, y: 1})

    const processor = new Processor([
        'control config sorter1 @copper',
        'sensor настройка sorter1 @config'
    ].join('\n'), {world, links: [sorter], content, globals: content.globals})

    world.addProcessor(processor)
    processor.run(2)

    assert.equal(sorter.sortItem.name, 'copper')
    assert.equal(processor.get('настройка').objval.name, 'copper')

    // Числом настройка не меняется: ветка `type.isObj && p1.isobj` до блока не доходит
    const byNumber = new Processor('control config sorter1 3', {world, links: [sorter], content})
    world.addProcessor(byNumber)
    byNumber.run(1)

    assert.equal(sorter.sortItem.name, 'copper')
})

test('настройка есть не у всякого блока, и @config у прочих пуст', () => {
    const content = createContent(logicIds)
    const world = new World({content})
    const container = world.add('container', {x: 1, y: 1})

    const processor = new Processor([
        'control config container1 @copper',
        'sensor настройка container1 @config'
    ].join('\n'), {world, links: [container], content, globals: content.globals})

    world.addProcessor(processor)
    processor.run(2)

    // `logicConfigurable` у контейнера нет, `configSenseable` тоже
    assert.equal(processor.get('настройка').objval, null)
})

test('control слушается только связанных блоков', () => {
    /*
     * `ControlI`: команда доходит, если `exec.build.validLink(b)`. Здание, добытое мимо
     * связей — радаром, из памяти, через соседний процессор, — командам не подчиняется.
     */
    const world = new World()
    const door = world.add('door', {x: 1, y: 1})
    const processor = new Processor('control enabled block1 0', {world, links: []})

    // Кладём дверь в переменную мимо связей
    processor.get('block1').setobj(door)
    world.addProcessor(processor)
    processor.run(1)

    assert.equal(door.enabled, true)
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

test('блок с чётной стороной стоит по углу тайла, а не по центру', () => {
    // Block.java:761-762: offset у чётных размеров половина тайла, sizeOffset нулевой
    const world = new World()
    const processor = world.add('logic-processor', {x: 8, y: 4})

    assert.equal(processor.sense('x'), 8.5)
    assert.equal(processor.sense('y'), 4.5)

    // Занимает свой тайл и следующий по каждой оси
    assert.equal(world.at(8, 4), processor)
    assert.equal(world.at(9, 5), processor)
    assert.equal(world.at(7, 4), undefined)
    assert.equal(world.at(10, 4), undefined)
})

test('блок с нечётной стороной занимает тайлы вокруг своего', () => {
    const world = new World()
    const display = world.add('logic-display', {x: 5, y: 5})

    assert.equal(display.sense('x'), 5)
    assert.equal(world.at(4, 4), display)
    assert.equal(world.at(6, 6), display)
    assert.equal(world.at(7, 5), undefined)
})

test('сброс возвращает мир к началу, и прогон повторяется в точности', () => {
    const {world, processor, links} = setup('op add x x 1\nwrite x cell1 0\nprint x\nprintflush message1')
    const [cell, message] = links

    world.steps(30)
    const first = {tick: world.tick, x: processor.num('x'), cell: cell.read(0), message: message.message}

    world.reset()
    assert.equal(world.tick, 0)
    assert.equal(cell.read(0), 0)
    assert.equal(message.message, '')
    assert.equal(processor.num('x'), 0)

    // Симуляция детерминированная: те же тики дают то же состояние
    world.steps(30)
    assert.deepEqual({tick: world.tick, x: processor.num('x'), cell: cell.read(0), message: message.message}, first)
})

test('сброс чистит дисплей и возвращает дверь в исходное состояние', () => {
    const world = new World()
    const display = world.add('logic-display')
    const door = world.add('door', {open: false})

    display.flush([{type: 'rect', x: 0, y: 0, p1: 4, p2: 4}])
    door.open = true

    world.reset()

    assert.equal(display.sense('bufferSize'), 0)
    assert.equal(display.sense('operations'), 0)
    assert.equal(door.sense('enabled'), 0)
})

test('спеки блоков сняты из игры и совпадают с формулой Block.init', () => {
    // Таблица приезжает дампом из запущенной игры. Формула здесь для понимания, откуда
    // берутся числа: round(size * size * 40 * (1 + сумма healthScaling)), если здоровье
    // не задано прямо. Ни у одного логического блока оно не задано
    assert.equal(BLOCK_SPECS['micro-processor'].health, 40)
    assert.equal(BLOCK_SPECS['logic-processor'].health, 190, 'торий добавляет 0.2')
    assert.equal(BLOCK_SPECS['hyper-processor'].health, 520, 'торий и сплав добавляют 0.45')
    assert.equal(BLOCK_SPECS['large-logic-display'].health, 1800, 'фазовое волокно добавляет 0.25')

    // У двери здоровье задано прямо: 100 * wallHealthMultiplier
    assert.equal(BLOCK_SPECS.door.health, 400)

    // Скорость и дальность связи процессоров
    assert.deepEqual(
        ['micro-processor', 'logic-processor', 'hyper-processor'].map(name => BLOCK_SPECS[name].ipt),
        [2, 8, 25]
    )
    assert.deepEqual(
        ['micro-processor', 'logic-processor', 'hyper-processor'].map(name => BLOCK_SPECS[name].range),
        [80, 176, 336]
    )

    // Дамп покрывает весь контент, а не только логику: это же и каталог для постройки
    assert.ok(Object.keys(BLOCK_SPECS).length > 400)
    assert.equal(BLOCK_SPECS.router.size, 1)
    assert.equal(BLOCK_SPECS.duo.category, 'turret')
})

test('правка сообщения руками строже, чем printflush', () => {
    // MessageBlock.config: пробелы по краям срезаются, переносов остаётся не больше 24,
    // а слишком длинный текст не принимается вовсе. printflush ничего этого не делает
    const world = new World()
    const message = world.add('message')

    message.configureMessage('  привет  ')
    assert.equal(message.message, 'привет')

    message.configureMessage('a' + '\n'.repeat(30) + 'b')
    assert.equal([...message.message].filter(char => char === '\n').length, 25)

    message.configureMessage('x'.repeat(500))
    assert.notEqual(message.message, 'x'.repeat(500), 'слишком длинный текст отвергнут')

    message.setMessage('  без обрезки  ')
    assert.equal(message.message, '  без обрезки  ')
})

test('дверь открывается рукой, и порог у щелчка свой', () => {
    // Door.tapped: 60 тиков, тогда как логика через control ждёт 80. Door.java:98,149
    const world = new World()
    const door = world.add('door')

    assert.equal(door.tap(), true)
    assert.equal(door.sense('enabled'), 1)

    // Сразу второй раз не переключить
    assert.equal(door.tap(), false)

    world.steps(DOOR_TAP_DELAY)
    assert.equal(door.tap(), true)
    assert.equal(door.sense('enabled'), 0)
})

test('у тайла три слоя, как в игре: пол, наложение и статичная стена', () => {
    const world = new World({width: 4, height: 3, floor: 'darksand'})

    assert.equal(world.floorAt(0, 0), 'darksand')
    assert.equal(world.overlayAt(0, 0), null)
    assert.equal(world.wallAt(0, 0), null)

    world.setFloor(1, 1, 'stone')
    world.setOverlay(1, 1, 'ore-copper')
    world.setWall(2, 2, 'stone-wall')

    assert.equal(world.floorAt(1, 1), 'stone')
    assert.equal(world.overlayAt(1, 1), 'ore-copper')
    assert.equal(world.wallAt(2, 2), 'stone-wall')

    // За краем мира тайла нет вовсе, а не «пол по умолчанию»
    assert.equal(world.floorAt(-1, 0), null)
    assert.equal(world.floorAt(4, 0), null)
})

test('местность помечает себя изменённой, чтобы рендер пересобрал картинку', () => {
    const world = new World({width: 3, height: 3})
    const before = world.terrainVersion

    world.setFloor(0, 0, 'sand-floor')
    assert.notEqual(world.terrainVersion, before)
})

test('на тайле стоит здание, статичная стена или воздух', () => {
    const world = new World({width: 6, height: 6})
    world.add('memory-cell', {x: 1, y: 1})
    world.setWall(3, 3, 'stone-wall')

    assert.equal(world.blockAt(1, 1), 'memory-cell')
    assert.equal(world.blockAt(3, 3), 'stone-wall')
    assert.equal(world.blockAt(5, 5), 'air')
})

test('опись характеристик покрывает весь контент и держит то, что мы не моделируем', () => {
    const stats = JSON.parse(readFileSync(new URL('../data/stats.json', import.meta.url), 'utf8')).stats

    // Каждый блок и юнит из модели должен найтись в описи
    for (const name of Object.keys(BLOCK_SPECS)) {
        assert.ok(stats.block[name] !== undefined, `нет описи для блока ${name}`)
    }

    // Числа, которых в модели нет вовсе: turret стреляет, а мы это не считаем
    assert.equal(stats.block.duo.range, 160)
    assert.equal(stats.block.duo.reload, 20)
    assert.equal(stats.block['thorium-reactor'].explosionRadius, 19)

    assert.equal(stats.item.thorium.hardness, 4)
    assert.equal(stats.unit.dagger.mechStride, 4)

    // Служебные поля упаковки в опись не идут: имя лежит ключом, переводы снимает gen-bundles
    assert.equal(stats.item.copper.localizedName, undefined)
    assert.equal(stats.block.duo.name, undefined)
})

test('@type у здания — объект блока, а не строка', () => {
    // BuildingComp.senseObject:2137 отдаёт block; сравнивать надо с константой @router
    const content = createContent(logicIds)
    const world = new World({content})
    const router = world.add('router')
    const processor = new Processor('sensor тип router1 @type\nop equal он тип @router', {
        links: [router], world, content, globals: content.globals
    })

    world.addProcessor(processor)
    processor.run(2)

    assert.equal(processor.get('тип').objval, content.find('router'))
    assert.equal(processor.num('он'), 1)
})

test('@solid берётся у блока, а не отвечает нулём всем подряд', () => {
    // BuildingComp: block.solid || checkSolid(). У стены единица, у маршрутизатора ноль
    const world = new World()
    const wall = world.add('copper-wall', {x: 2, y: 2})
    const router = world.add('router', {x: 4, y: 4})

    assert.equal(wall.sense('solid'), 1)
    assert.equal(router.sense('solid'), 0)
})

test('команда — объект с номером, цветом и именем, а sensor @team отдаёт номер', () => {
    /*
     * `Team.sense`: id и цвет числами, имя объектом. Сравнивать `sensor @team` с константой
     * напрямую нельзя — номер спрашивают у самой команды. game/Team.java:170-182
     */
    const content = createContent(logicIds)
    const world = new World({width: 12, height: 12, content})
    const building = world.add('micro-processor')
    world.spawn('dagger', {x: 5, y: 5})

    const processor = new Processor([
        'ubind @dagger',
        'sensor чей @unit @team',
        'sensor номерКрукса @crux @id',
        'sensor номерШардед @sharded @id',
        'sensor имя @crux @name',
        'sensor цвет @crux @color',
        'stop'
    ].join('\n'), {world, content, globals: content.globals, building, team: 1})

    building.processor = processor
    world.addProcessor(processor)
    processor.run(8)

    assert.equal(processor.num('чей'), 1)
    assert.equal(processor.num('номерКрукса'), 2)
    assert.equal(processor.num('номерШардед'), 1)
    assert.equal(processor.get('имя').obj(), 'crux')

    // Цвет упакован так же, как у `packcolor`: крошечное число с байтами внутри
    assert.ok(processor.num('цвет') > 0 && processor.num('цвет') < 1e-300)
})

test('чужой процессор не читается и не пишется: проверка стоит в самом блоке', () => {
    /*
     * `LogicBuild.readable`: цел, и либо читатель привилегированный, либо блок своей
     * команды и не привилегированный. `writable` спрашивает ровно то же.
     */
    const content = createContent(logicIds)
    const world = new World({width: 16, height: 16, content})

    const mine = world.add('micro-processor', {x: 2, y: 2})
    const enemy = world.add('micro-processor', {x: 6, y: 2, team: 2})

    const theirs = new Processor('set секрет 42', {world, content, globals: content.globals, building: enemy, team: 2})
    enemy.processor = theirs
    world.addProcessor(theirs)

    const reader = new Processor([
        'read чужое block1 "секрет"',
        'write 7 block1 "секрет"',
        'read чужоеСнова block1 "секрет"',
        'stop'
    ].join('\n'), {world, content, globals: content.globals, building: mine, team: 1, links: [enemy]})

    mine.processor = reader
    world.addProcessor(reader)
    world.steps(8)

    assert.equal(reader.get('чужое').obj(), null, 'чужую переменную не прочитать')
    assert.equal(theirs.num('секрет'), 42, 'и не переписать')
    assert.equal(reader.get('чужоеСнова').obj(), null)
})

test('порог истинности — одна стотысячная, и он же решает у control', () => {
    /*
     * `LVar.bool`: число истинно, если по модулю не меньше 0.00001; объект — если он есть.
     * Об этом говорят уроки про условия и про включение блоков.
     */
    const content = createContent(logicIds)
    const world = new World({width: 12, height: 12, content})

    const building = world.add('micro-processor')
    const door = world.place('switch', 5, 5)

    const processor = new Processor([
        'control enabled switch1 0.000009 0 0 0',
        'sensor мало switch1 @enabled',
        'control enabled switch1 0.00002 0 0 0',
        'sensor много switch1 @enabled',
        'control enabled switch1 null 0 0 0',
        'sensor пусто switch1 @enabled',
        'stop'
    ].join('\n'), {world, content, globals: content.globals, building, team: 1, links: [door]})

    building.processor = processor
    world.addProcessor(processor)
    processor.run(14)

    assert.equal(processor.num('мало'), 0, 'ближе стотысячной к нулю — ложь')
    assert.equal(processor.num('много'), 1)
    assert.equal(processor.num('пусто'), 0, 'пустота ложна')
})
