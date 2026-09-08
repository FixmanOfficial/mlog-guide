/**
 * Сложность урока.
 *
 * Три ступени и три цвета, видные из списка. Смысл не в украшении: человек, который открыл
 * подряд третий сложный урок и ничего не понял, решает, что дело в нём, и уходит. Кружок
 * говорит заранее: это сложно не тебе, это урок такой.
 *
 * Цвета взяты из палитры игры, а не подобраны: `Pal.heal`, `Pal.accent`, `Pal.remove`.
 */

import pal from '@mlog/core/data/pal.json' with {type: 'json'}

export const LEVELS = {
    easy: {
        color: pal.colors.heal,
        title: {ru: 'просто', en: 'easy'},
        hint: {
            ru: 'Читается с нуля: знать заранее ничего не нужно',
            en: 'Reads from scratch: nothing needs to be known first'
        }
    },
    medium: {
        color: pal.colors.accent,
        title: {ru: 'средний', en: 'medium'},
        hint: {
            ru: 'Нужны другие уроки — какие именно, написано в начале',
            en: 'Needs other lessons, listed at the top of the page'
        }
    },
    hard: {
        color: pal.colors.remove,
        title: {ru: 'сложно', en: 'hard'},
        hint: {
            ru: 'Подводные камни: работающая на вид программа врёт молча. Читать, когда '
                + 'основное уже уложилось',
            en: 'The fine print: a program that looks right lies silently. Read it once the '
                + 'basics have settled'
        }
    }
}

export const LEVEL_ORDER = ['easy', 'medium', 'hard']

export const level = (name) => LEVELS[name] ?? LEVELS.easy
