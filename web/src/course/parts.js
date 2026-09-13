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
            groups: inside.sort((a, b) =>
                (ORDER.get(a.opcode) ?? Infinity) - (ORDER.get(b.opcode) ?? Infinity))
        }))
}

/** Группы логического процессора: папка уроков и инструкция, по которой она названа. */
const LOGIC = [
    {id: 'set', opcode: 'set'},
    {id: 'op', opcode: 'op'},
    {id: 'select', opcode: 'select'},
    {id: 'lookup', opcode: 'lookup'},

    {id: 'jump', opcode: 'jump'},
    {id: 'wait', opcode: 'wait'},
    {id: 'end', opcode: 'end'},
    {id: 'stop', opcode: 'stop'},

    {id: 'print', opcode: 'print'},
    {id: 'format', opcode: 'format'},
    {id: 'printchar', opcode: 'printchar'},
    {id: 'printflush', opcode: 'printflush'},
    {id: 'read', opcode: 'read'},
    {id: 'write', opcode: 'write'},
    {id: 'draw', opcode: 'draw'},
    {id: 'drawflush', opcode: 'drawflush'},

    {id: 'sensor', opcode: 'sensor'},
    {id: 'control', opcode: 'control'},
    {id: 'radar', opcode: 'radar'},

    {id: 'ubind', opcode: 'ubind'},
    {id: 'ucontrol', opcode: 'ucontrol'},
    {id: 'uradar', opcode: 'uradar'},
    {id: 'ulocate', opcode: 'ulocate'}
]

/** Мировые инструкции разбирает одна группа: их два десятка, и поодиночке они не живут. */
const WORLD = [{id: 'world', title: 'Мир', en: 'World', category: 'world'}]

export const PARTS = [
    {group: {id: 'basics', title: 'Основы', en: 'Basics'}},

    {
        id: 'logic',
        title: 'Логический процессор',
        en: 'Logic processor',
        categories: byCategory(LOGIC)
    },

    {
        id: 'world-processor',
        title: 'Мировой процессор',
        en: 'World processor',
        categories: byCategory(WORLD)
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
