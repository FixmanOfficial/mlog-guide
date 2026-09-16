/**
 * Сцены примеров группы `sensor`.
 *
 * Живут отдельно от текста урока, чтобы их можно было прогнать в ноде: числа, которые урок
 * называет вслух — 160 предметов, 220 здоровья, 6.5 координаты, — проверяются тестом
 * (`web/test/course.test.js`). Иначе пример однажды разойдётся с уроком, и никто не заметит.
 */

/** Урок «Свойства зданий»: контейнер с медью и свинцом рядом с процессором. */
export const BUILDINGS = {
    width: 10, height: 6, floor: 'sand-floor',
    blocks: [
        {type: 'micro-processor', x: 2, y: 2},
        {type: 'container', x: 6, y: 3, items: {copper: 120, lead: 40}}
    ],
    processors: [{
        at: [2, 2],
        links: ['container1'],
        program: [
            'sensor everything container1 @totalItems',
            'sensor limit container1 @itemCapacity',
            'sensor health container1 @health',
            'sensor kind container1 @type'
        ].join('\n')
    }]
}

/** Урок «Предметы и null»: хранилище, в котором есть медь, нет кремния и не бывает воды. */
export const ITEMS = {
    width: 11, height: 6, floor: 'sand-floor',
    blocks: [
        {type: 'micro-processor', x: 2, y: 2},
        {type: 'vault', x: 7, y: 3, items: {copper: 220, graphite: 15}}
    ],
    processors: [{
        at: [2, 2],
        links: ['vault1'],
        program: [
            'sensor copper vault1 @copper',
            'sensor silicon vault1 @silicon',
            'sensor water vault1 @water',
            'sensor first vault1 @firstItem'
        ].join('\n')
    }]
}

/** Урок «Свойства юнитов»: один поли, взятый `ubind`. */
export const UNITS = {
    width: 14, height: 8, floor: 'sand-floor',
    blocks: [{type: 'micro-processor', x: 2, y: 2}],
    units: [{type: 'poly', x: 8, y: 5}],
    processors: [{
        at: [2, 2],
        links: [],
        program: [
            'ubind @poly',
            'sensor x @unit @x',
            'sensor y @unit @y',
            'sensor health @unit @health',
            'sensor kind @unit @type',
            'sensor flies @unit @flying'
        ].join('\n')
    }]
}

/** Урок «Свойство есть не у каждого»: подбитая турель, маршрутизатор и ячейка памяти. */
export const HOLDERS = {
    width: 13, height: 7, floor: 'sand-floor',
    blocks: [
        {type: 'micro-processor', x: 2, y: 2},
        {type: 'duo', x: 6, y: 4, health: 120},
        {type: 'router', x: 9, y: 3},
        {type: 'memory-cell', x: 9, y: 5}
    ],
    processors: [{
        at: [2, 2],
        links: ['duo1', 'router1', 'cell1'],
        program: [
            'sensor full @duo @health',
            'sensor current duo1 @health',
            'sensor cellSize cell1 @memoryCapacity',
            'sensor routerSize router1 @memoryCapacity'
        ].join('\n')
    }]
}
