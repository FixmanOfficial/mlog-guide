/**
 * Размеры интерфейса. Все они лежат в исходниках игры литералами, поэтому снимаются
 * генератором `tools/gen-metrics.mjs` — и здесь проверяется, что код берёт их оттуда,
 * а не хранит свои копии.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import data from '@mlog/core/data/metrics.json' with {type: 'json'}

import {METRICS} from '../src/theme.js'
import {LANE_BASE, LANE_STEP, STROKE} from '../src/jumps.js'

test('редактор берёт размеры прямо из снятой таблицы', () => {
    assert.equal(METRICS, data.metrics)
})

test('в таблице есть всё, на что опирается вёрстка', () => {
    const needed = [
        'canvasWidth', 'canvasWidthNarrow', 'statementSpace', 'headerHeight', 'headerPadding',
        'namePadding', 'buttonSize', 'buttonGap', 'bodyPadding', 'bodyPaddingTop',
        'bodyMarginLeft', 'statementMarginBottom', 'statementFillAlpha',
        'selectCellWidth', 'selectCellHeight', 'selectColumns',
        'alignCellWidth', 'alignCellHeight', 'alignColumns', 'pencilSize',
        'addButtonWidth', 'addButtonHeight', 'addColumns',
        'dialogButtonWidth', 'dialogButtonHeight', 'closeButtonWidth',
        'editButtonWidth', 'editButtonHeight',
        'varsRowHeight', 'varsStub', 'varsValueWidth', 'varsTypeMinWidth', 'varsPeriod',
        'scrollMargin', 'scrollSpeed', 'jumpStroke', 'jumpLane', 'jumpLaneStep'
    ]

    for (const name of needed) {
        assert.equal(typeof METRICS[name], 'number', `размер ${name}`)
    }
})

test('дорожки переходов считаются по снятым числам', () => {
    // LCanvas.drawCurve: 40 плюс 10 на каждый вложенный переход, на телефоне 20 и 8
    assert.equal(LANE_BASE.wide, METRICS.jumpLane)
    assert.equal(LANE_STEP.wide, METRICS.jumpLaneStep)
    assert.equal(LANE_BASE.narrow, METRICS.jumpLanePortrait)
    assert.equal(STROKE, METRICS.jumpStroke)
})

test('числа те же, что были сняты глазами: генератор ничего не сломал', () => {
    assert.equal(METRICS.headerHeight, 38)
    assert.equal(METRICS.statementSpace, 10)
    assert.equal(METRICS.canvasWidth, 900)
    assert.equal(METRICS.varsRowHeight, 45)
    assert.equal(METRICS.varsPeriod, 15)
})
