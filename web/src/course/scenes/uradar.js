/**
 * Сцены группы Unit Radar.
 *
 * `uradar` — тот же радар, только смотрит от привязанного юнита и его дальностью.
 * Числа, которые уроки называют вслух, проверяет `web/test/course.test.js`.
 */

/** Урок «Поиск от юнита»: ближний и дальний враг вокруг кинжала. */
export const SEEK = {
    width: 20, height: 12, floor: 'sand-floor',
    blocks: [{type: 'micro-processor', x: 1, y: 6}],
    units: [
        {type: 'dagger', x: 6, y: 6},
        {type: 'flare', x: 9, y: 6, team: 2},
        {type: 'flare', x: 14, y: 6, team: 2}
    ],
    processors: [{
        at: [1, 6],
        links: [],
        program: [
            'ubind @dagger',
            'uradar enemy any any distance 0 1 near',
            'uradar enemy any any distance 0 0 far',
            'sensor nearX near @x',
            'sensor farX far @x',
            'sensor range @unit @range'
        ].join('\n')
    }]
}

/** Тот же урок: свои ищутся так же, а сам себя юнит не находит. */
export const ALLY = {
    width: 20, height: 12, floor: 'sand-floor',
    blocks: [{type: 'micro-processor', x: 1, y: 6}],
    units: [
        {type: 'dagger', x: 6, y: 6},
        {type: 'poly', x: 10, y: 7},
        {type: 'flare', x: 13, y: 5, team: 2}
    ],
    processors: [{
        at: [1, 6],
        links: [],
        program: [
            'ubind @dagger',
            'uradar ally any any distance 0 1 mine',
            'sensor whoIsIt mine @type',
            'sensor myself @unit @type',
            'stop'
        ].join('\n')
    }]
}
