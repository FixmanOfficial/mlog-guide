/**
 * Цветная разметка текста, как её читает игра.
 *
 * Строки игры размечены прямо в тексте: `[accent]Получите: [][lightgray]30[]/100`. Разбор
 * перенесён из `GlyphLayout.parseColorMarkup`, и важны в нём три мелочи:
 *
 *  - `[]` не «сбрасывает цвет», а **снимает верхний со стека** — вложенность работает;
 *  - неизвестное имя и незакрытая скобка разметкой не считаются вовсе и печатаются как есть;
 *  - `[[` — способ написать саму скобку.
 *
 * Имена цветов приходят таблицей из `core/data/markup-colors.json`: её снимает генератор
 * из `arc.graphics.Colors` и `UI.init`, потому что `[stat]` — это `#ffd37f`, и угадать
 * такое нельзя.
 */

import table from '@mlog/core/data/markup-colors.json' with {type: 'json'}

export const MARKUP_COLORS = table.colors

/** Шестнадцатеричный цвет из тега `[#rrggbb]` или `[#rrggbbaa]`. */
function parseHex(digits) {
    // Допустимая длина: от 3 до 8 цифр, но не 7 — так проверяет игра
    if (digits.length < 3 || digits.length > 8 || digits.length === 7) return null
    if (!/^[0-9a-fA-F]+$/.test(digits)) return null

    // Короткая запись дополняется нулями справа: rgb → rrggbb00, а прозрачность до ff
    const padded = digits.length <= 6
        ? digits.padEnd(6, '0').slice(0, 6)
        : digits.slice(0, 6)

    return `#${padded.toLowerCase()}`
}

/**
 * Разбирает строку на куски одного цвета.
 *
 * @param text  строка с разметкой
 * @param colors таблица имён; по умолчанию игровая
 * @returns массив `{text, color}`, где `color === null` — цвет по умолчанию
 */
export function parseMarkup(text, colors = MARKUP_COLORS) {
    if (typeof text !== 'string' || text === '') return []

    const parts = []
    const stack = []

    let current = ''

    const flush = () => {
        if (current === '') return
        parts.push({text: current, color: stack.length > 0 ? stack[stack.length - 1] : null})
        current = ''
    }

    for (let at = 0; at < text.length; at++) {
        if (text[at] !== '[') {
            current += text[at]
            continue
        }

        const next = text[at + 1]

        // «[[» — это одна скобка в тексте
        if (next === '[') {
            current += '['
            at++
            continue
        }

        // «[]» снимает верхний цвет; пустой стек означает, что снимать нечего
        if (next === ']') {
            flush()
            stack.pop()
            at++
            continue
        }

        const end = text.indexOf(']', at + 1)
        if (end === -1) {
            // Незакрытый тег разметкой не считается
            current += text[at]
            continue
        }

        const name = text.slice(at + 1, end)
        const color = name.startsWith('#') ? parseHex(name.slice(1)) : colors[name] ?? null

        if (color === null) {
            // Неизвестное имя печатается как есть, вместе со скобками
            current += text[at]
            continue
        }

        flush()
        stack.push(color)
        at = end
    }

    flush()
    return parts
}

/** Строка без разметки: то же самое, но одним куском текста. */
export function stripMarkup(text, colors = MARKUP_COLORS) {
    return parseMarkup(text, colors).map(part => part.text).join('')
}
