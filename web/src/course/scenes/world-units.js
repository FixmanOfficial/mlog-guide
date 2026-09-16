/**
 * Сцены мировых инструкций, работающих с юнитами: `query`, `spawn`, `status`.
 *
 * Всё это привилегированное, поэтому процессор в сценах мировой. Числа, которые уроки
 * называют вслух, проверяет `web/test/course.test.js`.
 */

/** Урок «Поиск по области»: круг, прямоугольник и отбор по команде. */
export const AREA = {
    width: 20, height: 12, floor: 'sand-floor',
    blocks: [{type: 'world-processor', x: 1, y: 6}],
    units: [
        {type: 'dagger', x: 8, y: 6},
        {type: 'dagger', x: 9, y: 7},
        {type: 'flare', x: 10, y: 5, team: 2},
        {type: 'dagger', x: 17, y: 10, team: 2}
    ],
    processors: [{
        at: [1, 6],
        links: [],
        program: [
            'query circle unit null 9 6 3 0',
            'sensor everything @queries @size',
            'query circle unit @sharded 9 6 3 0',
            'sensor ourOwn @queries @size',
            'query rect unit null 9 6 4 4',
            'sensor inBox @queries @size',
            'read first @queries 0',
            'sensor firstKind first @type',
            'stop'
        ].join('\n')
    }]
}

/** Урок «Создать юнита»: отряд появляется из ниоткуда, пока их не станет трое. */
export const SPAWN = {
    width: 18, height: 11, floor: 'sand-floor',
    blocks: [{type: 'world-processor', x: 1, y: 5}],
    units: [],
    processors: [{
        at: [1, 5],
        links: [],
        program: [
            'query circle unit @sharded 9 5 5 0',
            'sensor amount @queries @size',
            'jump 6 greaterThanEq amount 3',
            'spawn @dagger 9 5 90 @sharded fresh',
            'sensor newKind fresh @type',
            'end',
            'stop'
        ].join('\n')
    }]
}

/** Урок «Эффекты»: горение съедает здоровье кинжала. */
export const BURN = {
    width: 16, height: 10, floor: 'sand-floor',
    blocks: [{type: 'world-processor', x: 1, y: 5}],
    units: [{type: 'dagger', x: 8, y: 5}],
    processors: [{
        at: [1, 5],
        links: [],
        program: [
            'ubind @dagger',
            'jump 3 notEqual burned 0',
            'status false @status-burning @unit 10',
            'set burned 1',
            'sensor health @unit @health',
            'sensor limit @unit @maxHealth'
        ].join('\n')
    }]
}

/** Тот же урок: `unmoving` держит юнита на месте, сколько ему ни командуй. */
export const FROZEN = {
    width: 22, height: 10, floor: 'sand-floor',
    blocks: [{type: 'world-processor', x: 1, y: 5}],
    units: [
        {type: 'dagger', x: 3, y: 7},
        {type: 'dagger', x: 3, y: 3}
    ],
    processors: [{
        at: [1, 5],
        links: [],
        program: [
            'ubind @dagger',
            'sensor y @unit @y',
            'ucontrol move 18 y 0 0 0',
            'jump 7 lessThan y 5',
            'status false @status-unmoving @unit 20',
            'sensor heldX @unit @x',
            'end',
            'sensor freeX @unit @x',
            'end'
        ].join('\n')
    }]
}
