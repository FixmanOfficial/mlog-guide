import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

import {createContent} from '../src/content.js'
import {Processor} from '../src/vm.js'
import {LVar} from '../src/lvar.js'

const data = JSON.parse(readFileSync(new URL('../data/logic-ids.json', import.meta.url), 'utf8'))
const content = createContent(data)

/** Процессор с подключёнными таблицами контента. */
const run = (code, steps = 8) => {
    const processor = new Processor(code, {globals: content.globals, content})
    processor.run(steps)
    return processor
}

test('константы контента разрешаются в объекты', () => {
    const processor = run('set result @copper')
    const result = processor.get('result')

    assert.equal(result.isobj, true)
    assert.equal(result.objval.name, 'copper')
    assert.equal(result.objval.contentType, 'item')
})

test('print выводит имя контента, а не служебную запись', () => {
    // Ровно один шаг: код идёт по кругу, и лишние шаги набили бы буфер повторами
    const processor = run('print @graphite-press', 1)

    assert.equal(processor.textBuffer, 'graphite-press')
})

test('lookup находит контент по логическому идентификатору', () => {
    const processor = run([
        'lookup item first 0',
        'lookup block firstBlock 0',
        'lookup unit firstUnit 0',
        'lookup liquid firstLiquid 0'
    ].join('\n'), 4)

    assert.equal(processor.get('first').objval.name, 'copper')
    assert.equal(processor.get('firstBlock').objval.name, 'graphite-press')
    assert.equal(processor.get('firstUnit').objval.name, 'dagger')
    assert.equal(processor.get('firstLiquid').objval.name, 'water')
})

test('lookup за границей таблицы даёт пустое значение', () => {
    const processor = run('lookup item result 9999')

    assert.equal(processor.get('result').objval, null)
})

test('счётчики контента совпадают с длиной таблиц', () => {
    const processor = run('set items @itemCount\nset blocks @blockCount', 2)

    assert.equal(processor.num('items'), data.types.item.length)
    assert.equal(processor.num('blocks'), data.types.block.length)
})

test('один и тот же контент равен сам себе, разный — нет', () => {
    const processor = run([
        'lookup item a 0',
        'op equal same a @copper',
        'op equal other a @lead'
    ].join('\n'), 3)

    assert.equal(processor.num('same'), 1)
    assert.equal(processor.num('other'), 0)
})

test('lookableContent включает команды, а таблица идентификаторов — нет', () => {
    // В logicids.dat четыре типа: block, unit, item, liquid. Команд там нет
    assert.deepEqual(Object.keys(data.types).sort(), ['block', 'item', 'liquid', 'unit'])
    assert.equal(content.types.team, undefined)
})

test('set копирует значение мимо проверки на константу — её делает инструкция', () => {
    const source = new LVar('источник')
    source.setnum(7)

    const target = new LVar('цель', {constant: true})
    target.set(source)

    // Сам LVar.set константу не защищает
    assert.equal(target.numval, 7)

    // А инструкция set — защищает
    const processor = run('set @pi 3\nset result @pi', 2)
    assert.equal(processor.num('result'), 3.1415927410125732)
})
