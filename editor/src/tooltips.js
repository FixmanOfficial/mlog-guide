/**
 * Подсказки к инструкциям и свойствам.
 *
 * Игра показывает их по наведению, а на телефоне — по долгому нажатию (`LCanvas.tooltip`).
 * Тексты берутся из бандлов игры: `lst.<инструкция>` и `lenum.<свойство>`, они уже сняты
 * генератором в `core/data/i18n/<локаль>.json`.
 *
 * Локаль задаётся снаружи: редактор не решает, на каком языке говорит сайт.
 */

import ru from '@mlog/core/data/i18n/ru.json' with {type: 'json'}

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

export function propertyTip(name) {
    const text = bundle.logic?.properties?.[name]
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
