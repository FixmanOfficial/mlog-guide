/**
 * Подсказки к инструкциям и свойствам.
 *
 * Игра показывает их по наведению, а на телефоне — по долгому нажатию (`LCanvas.tooltip`).
 * Тексты берутся из бандлов игры: `lst.<инструкция>` и `lenum.<свойство>`, они уже сняты
 * генератором в `core/data/i18n/<локаль>.json`.
 *
 * Локаль задаётся снаружи: редактор не решает, на каком языке говорит сайт.
 */

import ru from '@mlog/core/data/i18n/ru.json'

let bundle = ru

/** Подменить набор текстов. Сайт вызывает это при смене языка. */
export function useBundle(next) {
    bundle = next
}

/**
 * Разметка игры вида [accent]...[] презентационная: цвет тут ни к чему, убираем.
 * Скобки со смыслом, вроде "{0}" в описании format, при этом не трогаются.
 */
const stripMarkup = (text) => text.replace(/\[[a-z]*\]/gi, '')

export function instructionTip(opcode) {
    const text = bundle.logic?.instructions?.[opcode]
    return text === undefined ? null : stripMarkup(text)
}

/** Описание встроенной переменной или заголовок раздела: ключи lglobal.<имя>. */
export function globalTip(name) {
    const text = bundle.logic?.globals?.[name]
    return text === undefined ? null : stripMarkup(text)
}

/**
 * Описание свойства, операции или условия: ключи `lenum.<имя>`.
 *
 * Имя приводится к нижнему регистру и лишается пробелов ровно так, как это делает
 * `LCanvas.tooltip`: в бандле лежит `lessthan`, а в списке операций — `lessThan`,
 * и без приведения половина подсказок не находилась вовсе.
 */
export function propertyTip(name) {
    if (typeof name !== 'string') return null

    const key = name.toLowerCase().replace(/ /g, '')
    const text = bundle.logic?.properties?.[key]

    return text === undefined ? null : stripMarkup(text)
}

/**
 * Подсказка к подписи параметра. `LStatement.param` собирает ключ из имени инструкции
 * и текста подписи: `radar.from`, `control.of`. Есть такая подсказка не у каждой подписи —
 * у половины инструкций их в игре нет вовсе.
 */
export function paramTip(opcode, label) {
    if (typeof opcode !== 'string' || typeof label !== 'string') return null

    const key = `${opcode}.${label}`.toLowerCase().replace(/ /g, '')
    const text = bundle.logic?.params?.[key]

    return text === undefined ? null : stripMarkup(text)
}

export function categoryTip(category) {
    const text = bundle.logic?.categoryDescriptions?.[category]
    return text === undefined ? null : stripMarkup(text)
}

/** Локализованное имя категории — для меню добавления. */
export function categoryName(category) {
    return bundle.logic?.categories?.[category] ?? category
}

/** Локализованное название контента: «Медь» вместо copper. Из бандлов игры. */
export function contentName(type, name) {
    return bundle.content?.[type]?.[name] ?? null
}
