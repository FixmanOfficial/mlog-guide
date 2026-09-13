/**
 * Из чего состоит курс: части, а в них группы.
 *
 * Часть — это **категория игры**: та же, что в меню «Добавить» и в справочнике. Читатель
 * уже знает, что `sensor` живёт в «Управлении блоками», и искать его будет там же. Плоским
 * списком групп к концу курса вышло бы восемнадцать пунктов подряд, а категорий всегда шесть.
 *
 * «Основы» и «Продвинутое» стоят по краям своими частями: они не про инструкции, и название
 * у них своё.
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
        category: 'operation',
        groups: [
            {id: 'set', opcode: 'set'},
            {id: 'op', opcode: 'op'},
            {id: 'select', opcode: 'select'},
            {id: 'lookup', opcode: 'lookup'}
        ]
    },

    /*
     * Категория `control` — это «Управление последовательностью», а не инструкция `control`:
     * в игре в ней лежат `jump`, `wait`, `stop`, `end` и `setrate`.
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
     * Порядок чтения, а не порядок в меню игры: сначала текст целиком (набрать, подставить,
     * отдать), потом память, потом рисование.
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
    },

    {category: 'world', groups: [{id: 'world', title: 'Мир', en: 'World'}]},

    {group: {id: 'advanced', title: 'Продвинутое', en: 'Advanced'}}
]

/** Группы части: у части-темы она одна. */
export const partGroups = (part) => part.groups ?? [part.group]

/** Все группы курса подряд, в порядке частей. */
export const GROUPS = PARTS.flatMap(part => partGroups(part).map(group => group.id))
