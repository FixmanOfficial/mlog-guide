/**
 * Сжатые спеки: значения по умолчанию отдельно, у записи только отличия.
 * Формат описан в `src/specs.js`, сжимает `src/pack.js`.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import blocksFile from '../data/block-specs.json' with {type: 'json'}
import unitsFile from '../data/unit-specs.json' with {type: 'json'}

import {BLOCK_SPECS, UNIT_SPECS, expandSpecs, packSpecs} from '../src/specs.js'

test('сжатие и разворот возвращают таблицу как была', () => {
    const table = {
        a: {size: 1, solid: false, tags: [], turret: {range: 5}},
        b: {size: 1, solid: true, tags: []},
        c: {size: 2, solid: false, tags: ['x']}
    }

    const packed = packSpecs(table)

    // Поле есть не у всех — значения по умолчанию у него нет, и отсутствие сохраняется
    assert.equal('turret' in packed.defaults, false)
    assert.deepEqual(packed.defaults, {size: 1, solid: false, tags: []})
    assert.deepEqual(packed.packed.b, {solid: true})
    assert.deepEqual(expandSpecs(packed), table)
})

test('список по умолчанию у каждой записи свой', () => {
    const table = expandSpecs({defaults: {tags: []}, packed: {a: {}, b: {}}})

    table.a.tags.push('x')
    assert.deepEqual(table.b.tags, [])
})

test('файлы спеков лежат сжатыми, и сжатие у них полное', () => {
    for (const [file, table] of [[blocksFile, BLOCK_SPECS], [unitsFile, UNIT_SPECS]]) {
        assert.equal(file.blocks, undefined)
        assert.equal(file.units, undefined)
        assert.deepEqual({defaults: file.defaults, packed: file.packed}, packSpecs(table))
    }

    assert.equal(Object.keys(BLOCK_SPECS).length, 447)
    assert.equal(Object.keys(UNIT_SPECS).length, 70)
    assert.equal(BLOCK_SPECS['micro-processor'].ipt, 2)
})
