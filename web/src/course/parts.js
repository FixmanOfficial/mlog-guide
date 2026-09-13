/**
 * Из чего состоит курс: части, в них категории игры, в категориях группы.
 *
 * Частей четыре, и делят они курс по тому, **чем человек занят**. «Основы» — про язык,
 * «Продвинутое» — про то, что поверх инструкций, а между ними два процессора. Логический
 * ставят на карту в обычной партии; мировой живёт только в редакторе карт и умеет то, чего
 * обычный не умеет вовсе. Одним списком их держать нельзя: играющему партию половина курса
 * оказалась бы недоступна, а он бы этого не знал.
 *
 * **Категорию и порядок задаёт игра, а не этот файл.** Категория берётся у самой инструкции
 * (`schema.instructions`), порядок внутри категории — тот же, что в меню «Добавить», а порядок
 * категорий — объявление `LCategory.all`. Руками здесь записано только то, чего в игре нет:
 * какие уроки лежат в одной папке и как называется группа, у которой нет своей инструкции.
 *
 * Раньше порядок был «читательский», а `printflush` лежал рядом с `print`. Это расходилось
 * с игрой: в меню «Добавить» сброс буфера живёт в «Управлении блоками», и искать его читатель
 * будет там же.
 *
 * Группа — папка с уроками, и в меню она **всегда** раскрывающаяся, даже если урок в ней один:
 * список, где половина пунктов раскрывается, а половина нет, читается как сломанный.
 *
 * Зависимость одна — снятая с игры схема инструкций: и сайт, и конфиг меню, и тест должны
 * видеть один и тот же порядок.
 */

import schema from '@mlog/core/data/instructions.json' with {type: 'json'}

/** Порядок инструкций — тот же, что в меню «Добавить». */
const ORDER = new Map(schema.instructions.map((entry, index) => [entry.opcode, index]))

/** Категория инструкции по её опкоду. */
const categoryOf = (opcode) =>
    schema.instructions.find(entry => entry.opcode === opcode)?.category ?? 'unknown'

/**
 * Место группы в категории: у инструкции — её место в меню «Добавить», у группы без
 * инструкции — своё число. Введение части стоит первым, поэтому у него минус единица.
 */
const place = (group) => group.order ?? ORDER.get(group.opcode) ?? Infinity

/** Порядок категорий — объявление `LCategory.all`. */
const CATEGORIES = Object.keys(schema.categories)

/**
 * Раскладывает группы по категориям игры и сортирует и то, и другое.
 *
 * Категория берётся у инструкции; у группы без своей инструкции она написана рядом.
 */
function byCategory(groups) {
    const found = new Map()

    for (const group of groups) {
        const category = group.category ?? categoryOf(group.opcode)
        if (!found.has(category)) found.set(category, [])
        found.get(category).push(group)
    }

    return [...found.entries()]
        .sort(([first], [second]) => CATEGORIES.indexOf(first) - CATEGORIES.indexOf(second))
        .map(([category, inside]) => ({
            category,
            groups: inside.sort((a, b) => place(a) - place(b))
        }))
}

/**
 * Группа на каждую инструкцию — список берётся из схемы целиком.
 *
 * Своего списка здесь нет намеренно: **у каждой инструкции своя группа**, и папка уроков
 * называется её опкодом. Стоит игре завести новую инструкцию — она появится в курсе сама,
 * пустой группой, и это правильнее, чем молча её потерять.
 *
 * Выпадает одна: `noop` помечена в схеме как `invalid` — это не инструкция, а пустая строка,
 * которую редактор подставляет вместо незнакомой.
 */
const groupsOf = (categories) => schema.instructions
    .filter(entry => categories.includes(entry.category) && entry.invalid !== true)
    .map(entry => ({id: entry.opcode, opcode: entry.opcode}))

/** Категории логического процессора — все, кроме мировой. */
const LOGIC_CATEGORIES = ['io', 'block', 'operation', 'control', 'unit']

export const PARTS = [
    {group: {id: 'basics', title: 'Основы', en: 'Basics'}},

    {
        id: 'logic',
        title: 'Логический процессор',
        en: 'Logic processor',
        categories: byCategory(groupsOf(LOGIC_CATEGORIES))
    },

    {
        id: 'world-processor',
        title: 'Мировой процессор',
        en: 'World processor',
        categories: byCategory([
            /*
             * Введение части: оно не про инструкцию, а про сам блок — откуда он берётся
             * и чем отличается. Без него читатель попадает сразу в `setrule` и не понимает,
             * почему у него это не работает.
             */
            {id: 'world-intro', title: 'Что это такое', en: 'What it is', category: 'world', order: -1},
            ...groupsOf(['world'])
        ])
    },

    {group: {id: 'advanced', title: 'Продвинутое', en: 'Advanced'}}
]

/** Категории части. У части-темы их нет вовсе: она сама и есть своя единственная группа. */
export const partCategories = (part) => part.categories ?? []

/** Все группы части подряд, мимо категорий. */
export const partGroups = (part) => part.categories === undefined
    ? [part.group]
    : part.categories.flatMap(category => category.groups)

/** Все группы курса подряд, в порядке частей. */
export const GROUPS = PARTS.flatMap(part => partGroups(part).map(group => group.id))
