/**
 * Сцены группы Unit Locate.
 *
 * Поиск идёт от привязанного юнита и по настоящей карте: руда лежит на полу,
 * метки блоков (`BlockFlag`) сняты дампом вместе со спеками. Числа, которые уроки
 * называют вслух, проверяет `web/test/course.test.js`.
 */

/** Урок «Где лежит руда»: ближайшая медь и добыча по найденным координатам. */
export const ORE = {
    width: 18, height: 11, floor: 'sand-floor',
    terrain: [
        {floor: 'sand-floor', ore: 'ore-copper', rect: [12, 7, 2, 2]},
        {floor: 'sand-floor', ore: 'ore-lead', rect: [4, 2, 2, 2]}
    ],
    blocks: [{type: 'micro-processor', x: 1, y: 5}],
    units: [{type: 'mono', x: 8, y: 5}],
    processors: [{
        at: [1, 5],
        links: [],
        program: [
            'ubind @mono',
            'ulocate ore core true @copper oreX oreY found building',
            'ucontrol mine oreX oreY 0 0 0',
            'sensor cargo @unit @totalItems',
            'sensor what @unit @firstItem'
        ].join('\n')
    }]
}

/** Тот же урок: свинец лежит в другой стороне, и поиск отдаёт его координаты. */
export const LEAD = {
    width: 18, height: 11, floor: 'sand-floor',
    terrain: [
        {floor: 'sand-floor', ore: 'ore-copper', rect: [12, 7, 2, 2]},
        {floor: 'sand-floor', ore: 'ore-lead', rect: [4, 2, 2, 2]}
    ],
    blocks: [{type: 'micro-processor', x: 1, y: 5}],
    units: [{type: 'mono', x: 8, y: 5}],
    processors: [{
        at: [1, 5],
        links: [],
        program: [
            'ubind @mono',
            'ulocate ore core true @lead oreX oreY found building',
            'ulocate ore core true @titanium missX missY titaniumFound building2',
            'stop'
        ].join('\n')
    }]
}

/** Урок «Здания по метке»: ближайшая вражеская турель и своё ядро. */
export const BUILDINGS = {
    width: 22, height: 12, floor: 'sand-floor',
    blocks: [
        {type: 'micro-processor', x: 1, y: 6},
        {type: 'duo', x: 6, y: 6, ammo: {copper: 10}},
        {type: 'duo', x: 18, y: 6, team: 2},
        {type: 'container', x: 10, y: 10}
    ],
    units: [{type: 'poly', x: 9, y: 6}],
    processors: [{
        at: [1, 6],
        links: [],
        program: [
            'ubind @poly',
            'ulocate building turret true @copper enemyX enemyY enemyFound enemys',
            'ulocate building turret false @copper oursX oursY allyFound ours',
            'ulocate building storage false @copper storeX storeY storeFound store',
            'stop'
        ].join('\n')
    }]
}

/** Урок «Что отдаёт поиск»: подбитое здание находится только после урона. */
export const DAMAGED = {
    width: 20, height: 11, floor: 'sand-floor',
    blocks: [
        {type: 'micro-processor', x: 1, y: 5},
        {type: 'duo', x: 8, y: 5, health: 60, ammo: {copper: 10}},
        {type: 'duo', x: 14, y: 5, ammo: {copper: 10}}
    ],
    units: [{type: 'poly', x: 5, y: 5}],
    processors: [{
        at: [1, 5],
        links: [],
        program: [
            'ubind @poly',
            'ulocate damaged core true @copper damagedX damagedY found damaged',
            'sensor health damaged @health',
            'sensor limit damaged @maxHealth',
            'stop'
        ].join('\n')
    }]
}
