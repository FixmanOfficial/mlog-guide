/**
 * Перевод надписей редактора — тот самый, что появился в игре в v160.
 *
 * Переводится только интерфейс: названия инструкций, подписи параметров и значения
 * перечислений. Сам язык остаётся английским — в поле блока и в тексте программы
 * по-прежнему `sensor block1 @totalItems`, и это не наше решение, а устройство игры:
 * `LogicIO` перевод не касается вовсе.
 *
 * Выключатель тоже из игры: настройка `logiclocalization`, по умолчанию включена
 * (`SettingsMenuDialog`). Значение живёт одно на всю страницу и запоминается, как и выбор
 * подсветки строки: читатель решает один раз, а не на каждом примере.
 *
 * Ключи собирает `gen-bundles.mjs`:
 *
 *   instruction.<класс>    — название строки, `unitbind`, а не `ubind`
 *   name.token.<слово>     — подписи и слова-операции: `in`, `and`, `always`
 *   <перечисление>.label.<значение> — `laccess.label.totalitems`
 */

import {useEffect, useState} from 'preact/hooks'

import ru from '@mlog/core/data/i18n/ru.json'

let bundle = ru

/** Подменить набор текстов. Сайт вызывает это при смене языка. */
export function useNameBundle(next) {
    bundle = next
}

const KEY = 'mlog.editor.localization'

/** Слушатели: настройка одна на страницу, а показывают её несколько мест сразу. */
const listeners = new Set()

function stored() {
    try {
        return globalThis.localStorage?.getItem(KEY) !== 'off'
    } catch {
        // Приватное окно и запрет хранилища: тогда просто как в игре — включено
        return true
    }
}

let enabled = stored()

export function localizationEnabled() {
    return enabled
}

export function setLocalization(value) {
    enabled = value

    try {
        globalThis.localStorage?.setItem(KEY, value ? 'on' : 'off')
    } catch { /* хранилище не обязательно */ }

    for (const listener of listeners) listener(enabled)
}

/** Подписка для разметки: перерисовывает то, где надписи видны. */
export function useLocalization() {
    const [value, setValue] = useState(enabled)

    useEffect(() => {
        listeners.add(setValue)
        setValue(enabled)

        return () => listeners.delete(setValue)
    }, [])

    return value
}

/** Разметка игры вида [accent]…[] в надписях не нужна. */
const strip = (text) => text.replace(/\[[a-z]*\]/gi, '')

/**
 * Название строки инструкции. Ключ — имя класса без «Statement» в нижнем регистре,
 * и опкоду оно не равно: у `ubind` это `unitbind`. Поэтому берётся не опкод, а `name`
 * из схемы, где лежит то же имя со вставленными пробелами. LStatement.statementKey
 */
export function statementName(name) {
    if (typeof name !== 'string') return name
    if (!enabled) return name

    const key = name.split(' ').join('').toLowerCase()
    return strip(bundle.logic?.names?.[key] ?? name)
}

/** Подпись параметра или слово-операция: `in`, `to`, `and`, `always`. */
export function tokenName(token) {
    if (typeof token !== 'string') return token
    if (!enabled) return token

    /*
     * Подпись приходит с пробелами по краям — они держат расстояние между полями,
     * и потерять их нельзя: без них строка склеится.
     */
    const trimmed = token.trim()
    if (trimmed === '') return token

    const translated = bundle.logic?.tokens?.[trimmed]
    if (translated === undefined) return token

    const left = token.startsWith(' ') ? ' ' : ''
    const right = token.endsWith(' ') ? ' ' : ''

    return left + strip(translated) + right
}

/**
 * Значение перечисления: `laccess.label.totalitems`, `lunitcontrol.label.move`.
 *
 * У операций и условий переводятся только те, что написаны словом: `and`, `or`, `not`,
 * `xor`, `flip`, `always`. Знаки вроде `+` и `<` остаются знаками. LStatement.selectTranslate
 */
const WORD_OPERATIONS = new Set(['not', 'and', 'or', 'b-and', 'xor', 'flip', 'always'])

export function enumLabel(enumName, value) {
    if (typeof value !== 'string') return value
    if (!enabled) return value

    if (enumName === 'LogicOp' || enumName === 'ConditionOp') {
        return WORD_OPERATIONS.has(value) ? tokenName(value) : value
    }

    const table = bundle.logic?.labels?.[String(enumName).toLowerCase()]
    const translated = table?.[value.toLowerCase()]

    return translated === undefined ? value : strip(translated)
}
