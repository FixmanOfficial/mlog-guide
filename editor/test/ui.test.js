/**
 * Надписи редактора на двух языках.
 *
 * Большая их часть игровая: `ui.dialog` снят с бандлов игры, и переведён он официально.
 * Своих остаётся горстка — те, которых в игре нет вовсе, — и на каждую русскую нужна
 * английская: иначе на странице `/en/` кнопка молча выйдет русской.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import ru from '@mlog/core/data/i18n/ru.json' with {type: 'json'}
import en from '@mlog/core/data/i18n/en.json' with {type: 'json'}

import {uiLocale, uiText, useNameBundle} from '../src/names.js'

const CYRILLIC = /[А-Яа-яЁё]/

test('надпись берётся из бандла игры, когда она там есть', () => {
    useNameBundle(ru)
    assert.equal(uiLocale(), 'ru')
    assert.equal(uiText('back'), ru.ui.dialog.back)

    useNameBundle(en)
    assert.equal(uiLocale(), 'en')
    assert.equal(uiText('back'), en.ui.dialog.back)
})

test('своих надписей на английском столько же, сколько на русском', () => {
    // Ключи наших надписей: те, которых в `ui.dialog` нет вовсе
    const own = ['addBelow', 'copy', 'drag', 'content', 'align', 'symbol', 'empty',
        'clipboardDenied', 'load', 'printBuffer']

    for (const key of own) {
        useNameBundle(ru)
        const russian = uiText(key)
        assert.notEqual(russian, key, `${key}: нет русской надписи`)

        useNameBundle(en)
        const english = uiText(key)
        assert.notEqual(english, key, `${key}: нет английской надписи`)
        assert.equal(CYRILLIC.test(english), false, `${key}: осталось непереведённым`)
    }

    // Набор текстов общий на модуль: вернуть как было, чтобы не мешать соседним тестам
    useNameBundle(ru)
})

test('надписи окна логики сняты с игры, а не написаны нами', () => {
    // Каждая из них — строка из бандла, и переведена она самой Mindustry
    for (const key of ['add', 'back', 'cancel', 'clear', 'clearConfirm', 'ok',
        'copyClipboard', 'delete', 'edit', 'export', 'globals', 'loadClipboard',
        'restart', 'search', 'variables']) {
        assert.equal(typeof ru.ui.dialog[key], 'string', `${key}: нет в русском бандле`)
        assert.equal(typeof en.ui.dialog[key], 'string', `${key}: нет в английском бандле`)
        assert.notEqual(ru.ui.dialog[key], '', `${key}: пусто`)
    }
})
