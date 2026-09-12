/**
 * Перевод надписей редактора и его запомненный выбор.
 *
 * Важна не только подстановка строк, но и момент, когда читается хранилище. Разметка
 * примера собирается на сервере, где хранилища нет вовсе, и первая отрисовка в браузере
 * обязана совпасть с ней: Preact при подключении атрибуты не сверяет, и разойдись они —
 * подписи и рамка подсветки остались бы серверными до первого перерисовывания.
 *
 * Поэтому модуль начинает с включённого перевода, как настройка в игре, а запомненный
 * выбор применяется отдельным вызовом из эффекта.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import {
    localizationEnabled, restoreLocalization, setLocalization, statementName
} from '../src/names.js'

/** Хранилище браузера, какое есть на странице: модуль обращается к нему через globalThis. */
function withStorage(value) {
    const store = new Map(value === null ? [] : [['mlog.editor.localization', value]])

    globalThis.localStorage = {
        getItem: (name) => store.get(name) ?? null,
        setItem: (name, text) => store.set(name, text),
        removeItem: (name) => store.delete(name)
    }

    return store
}

test('перевод включён с самого начала, каким бы ни было хранилище', () => {
    withStorage('off')

    // Модуль уже загружен: значение должно быть тем же, что на сервере
    assert.equal(localizationEnabled(), true)
    assert.equal(statementName('Set'), 'Установить')
})

test('запомненное «выключено» применяется отдельным вызовом', () => {
    withStorage('off')
    restoreLocalization()

    assert.equal(localizationEnabled(), false)
    assert.equal(statementName('Set'), 'Set')

    // И обратно: пустое хранилище означает настройку по умолчанию
    withStorage(null)
    restoreLocalization()

    assert.equal(localizationEnabled(), true)
})

test('переключение запоминается', () => {
    const store = withStorage(null)

    setLocalization(false)
    assert.equal(store.get('mlog.editor.localization'), 'off')

    setLocalization(true)
    assert.equal(store.get('mlog.editor.localization'), 'on')
})
