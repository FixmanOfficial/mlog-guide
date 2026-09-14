/**
 * Сцены группы Unit Bind.
 *
 * Юниты в примерах настоящие: летают, дохнут от чужой турели и ходят по кругу привязки
 * ровно так, как в игре. Числа, которые уроки называют вслух, проверяет
 * `web/test/course.test.js`.
 */

/** Карта с тремя поли своей команды. */
const three = (program, extra = {}) => ({
    width: 14, height: 9, floor: 'sand',
    blocks: [{type: 'micro-processor', x: 2, y: 4}],
    units: [
        {type: 'poly', x: 6, y: 6},
        {type: 'poly', x: 9, y: 3},
        {type: 'poly', x: 11, y: 6}
    ],
    processors: [{at: [2, 4], links: [], program: program.join('\n')}],
    ...extra
})

/** Урок «Привязка по типу»: четыре привязки подряд обходят трёх поли и возвращаются к первому. */
export const CYCLE = three([
    'ubind @poly',
    'set первый @unit',
    'ubind @poly',
    'set второй @unit',
    'ubind @poly',
    'set третий @unit',
    'ubind @poly',
    'set четвёртый @unit',
    'stop'
])

/** Тот же урок: привязка живёт до следующей, и с ней работают свойства юнита. */
export const WATCH = three([
    'ubind @poly',
    'sensor x @unit @x',
    'sensor y @unit @y',
    'sensor здоровье @unit @health',
    'sensor тип @unit @type'
])

/** Тот же урок: юнитов такого типа нет — `@unit` пуст. */
export const NONE = three([
    'ubind @flare',
    'set пусто @unit',
    'sensor здоровье @unit @health',
    'stop'
])

/** Урок «Привязка к юниту»: запомненный юнит возвращается по объекту. */
export const REMEMBER = three([
    'ubind @poly',
    'set мой @unit',
    'ubind @poly',
    'ubind @poly',
    'ubind мой',
    'op equal тотЖе @unit мой',
    'stop'
])

/** Тот же урок: юнит гибнет от чужой турели, а переменная о нём помнит. */
export const LOST = {
    width: 18, height: 10, floor: 'sand',
    blocks: [
        {type: 'micro-processor', x: 2, y: 5},
        {type: 'duo', x: 14, y: 5, team: 2, ammo: {copper: 10}}
    ],
    units: [{type: 'flare', x: 9, y: 5}],
    processors: [{
        at: [2, 5],
        links: [],
        program: [
            'jump 3 notEqual мой null',
            'ubind @flare',
            'set мой @unit',
            'sensor мёртв мой @dead',
            'ubind @flare',
            'op equal живых @unit null'
        ].join('\n')
    }]
}

/** Урок «Чужие юниты»: кинжал есть, но он вражеский — привязки не будет. */
export const FOREIGN = {
    width: 14, height: 9, floor: 'sand',
    blocks: [{type: 'micro-processor', x: 2, y: 4}],
    units: [
        {type: 'poly', x: 6, y: 5},
        {type: 'dagger', x: 10, y: 4, team: 2},
        {type: 'dagger', x: 11, y: 6, team: 2}
    ],
    processors: [{
        at: [2, 4],
        links: [],
        program: [
            'ubind @dagger',
            'set чужой @unit',
            'ubind @poly',
            'set свой @unit',
            'sensor команда @unit @team',
            'stop'
        ].join('\n')
    }]
}
