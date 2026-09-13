/**
 * Из чего состоит курс: части, в них категории игры, в категориях группы.
 *
 * Частей четыре, и делят они курс по тому, **чем человек занят**. «Основы» — про язык,
 * «Продвинутое» — про то, что поверх инструкций, а между ними два процессора. Логический
 * ставят на карту в обычной партии; мировой живёт только в редакторе карт и умеет то, чего
 * обычный не умеет вовсе. Одним списком их держать нельзя: играющему партию половина курса
 * оказалась бы недоступна, а он бы этого не знал.
 *
 * Категория — та же, что в меню «Добавить» и в справочнике: читатель уже знает, что `sensor`
 * живёт в «Управлении блоками», и искать его будет там же. Если категория у части одна,
 * её уровень пропускается: «Мировой процессор» и «Мир» — одно и то же, сказанное дважды.
 *
 * Группа — папка с уроками. Обычно это инструкция, и подписана она так, как инструкция
 * называется в игре (`opcode` — по нему берётся имя из снятой схемы). Там, где под одним
 * именем разбирают семейство, у группы своё название (`title`).
 *
 * Файл нарочно без зависимостей: его читают и сайт, и конфиг меню, и тест — структура курса
 * должна быть записана один раз.
 */

export const PARTS = [
    {group: {id: 'basics', title: 'Основы', en: 'Basics'}},

    {
        id: 'logic',
        title: 'Логический процессор',
        en: 'Logic processor',
        categories: [
            {
                category: 'operation',
                groups: [
                    {id: 'set', opcode: 'set'},
                    {id: 'op', opcode: 'op'},
                    {id: 'select', opcode: 'select'},
                    {id: 'lookup', opcode: 'lookup'}
                ]
            },

            /*
             * Категория `control` — это «Управление последовательностью», а не инструкция
             * `control`: в игре в ней лежат `jump`, `wait`, `stop`, `end` и `setrate`.
             */
            {
                category: 'control',
                groups: [
                    {id: 'jump', opcode: 'jump'},
                    {id: 'wait', opcode: 'wait'},
                    {id: 'end', opcode: 'end'},
                    {id: 'stop', opcode: 'stop'}
                ]
            },

            /*
             * Порядок чтения, а не порядок в меню игры: сначала текст целиком (набрать,
             * подставить, отдать), потом память, потом рисование.
             */
            {
                category: 'io',
                groups: [
                    {id: 'print', opcode: 'print'},
                    {id: 'format', opcode: 'format'},
                    {id: 'printchar', opcode: 'printchar'},
                    {id: 'printflush', opcode: 'printflush'},
                    {id: 'read', opcode: 'read'},
                    {id: 'write', opcode: 'write'},
                    {id: 'draw', opcode: 'draw'},
                    {id: 'drawflush', opcode: 'drawflush'}
                ]
            },

            // А здесь `control` уже инструкция: она из категории «Управление блоками»
            {
                category: 'block',
                groups: [
                    {id: 'sensor', opcode: 'sensor'},
                    {id: 'control', opcode: 'control'},
                    {id: 'radar', opcode: 'radar'}
                ]
            },

            {
                category: 'unit',
                groups: [
                    {id: 'ubind', opcode: 'ubind'},
                    {id: 'ucontrol', opcode: 'ucontrol'},
                    {id: 'uradar', opcode: 'uradar'},
                    {id: 'ulocate', opcode: 'ulocate'}
                ]
            }
        ]
    },

    {
        id: 'world-processor',
        title: 'Мировой процессор',
        en: 'World processor',
        categories: [{category: 'world', groups: [{id: 'world', title: 'Мир', en: 'World'}]}]
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
