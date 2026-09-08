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
            ru: 'Хватит того, что уже прочитано в этой группе',
            en: 'What you have already read in this group is enough'
        }
    },
    medium: {
        color: pal.colors.accent,
        title: {ru: 'средний', en: 'medium'},
        hint: {
            ru: 'Нужны инструкции из других групп — какие, написано в начале урока',
            en: 'Needs instructions from other groups, listed at the top of the lesson'
        }
    },
    hard: {
        color: pal.colors.remove,
        title: {ru: 'сложно', en: 'hard'},
        hint: {
            ru: 'Тонкости, из-за которых программа ведёт себя не так, как написано',
            en: 'The fine print that makes a program behave unlike what it says'
        }
    }
}

export const LEVEL_ORDER = ['easy', 'medium', 'hard']

export const level = (name) => LEVELS[name] ?? LEVELS.easy
