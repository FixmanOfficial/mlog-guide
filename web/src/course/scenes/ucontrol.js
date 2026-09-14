/**
 * Сцены группы Unit Control.
 *
 * Юниты в примерах летают по настоящей модели движения: разгон, трение и предел скорости
 * взяты из игры, поэтому в точку юнит приходит не мгновенно и не ровно. Числа, которые
 * уроки называют вслух, проверяет `web/test/course.test.js`.
 */

/** Урок «Движение»: поли летит через всю карту и остаётся у цели. */
export const MOVE = {
    width: 20, height: 10, floor: 'sand',
    blocks: [{type: 'micro-processor', x: 1, y: 4}],
    units: [{type: 'poly', x: 3, y: 4}],
    processors: [{
        at: [1, 4],
        links: [],
        program: [
            'ubind @poly',
            'ucontrol move 16 4 0 0 0',
            'sensor x @unit @x',
            'sensor y @unit @y'
        ].join('\n')
    }]
}

/** Тот же урок: команда «стоять» гасит движение на месте. */
export const HALT = {
    width: 20, height: 10, floor: 'sand',
    blocks: [{type: 'micro-processor', x: 1, y: 4}],
    units: [{type: 'poly', x: 3, y: 4}],
    processors: [{
        at: [1, 4],
        links: [],
        program: [
            'ubind @poly',
            'sensor x @unit @x',
            'jump 5 greaterThan x 10',
            'ucontrol move 16 4 0 0 0',
            'end',
            'ucontrol stop 0 0 0 0 0'
        ].join('\n')
    }]
}

/** Урок «Прибытие»: `within` отвечает, дошёл ли юнит. */
export const ARRIVED = {
    width: 20, height: 10, floor: 'sand',
    blocks: [{type: 'micro-processor', x: 1, y: 4}],
    units: [{type: 'poly', x: 3, y: 4}],
    processors: [{
        at: [1, 4],
        links: [],
        program: [
            'ubind @poly',
            'ucontrol move 16 4 0 0 0',
            'ucontrol within 16 4 2 прибыл 0',
            'sensor x @unit @x'
        ].join('\n')
    }]
}

/** Урок «Предметы»: поли берёт медь со склада и везёт её в другой. */
export const CARRY = {
    width: 18, height: 10, floor: 'sand',
    blocks: [
        {type: 'micro-processor', x: 1, y: 4},
        {type: 'container', x: 5, y: 4, items: {copper: 100}},
        {type: 'container', x: 13, y: 4}
    ],
    units: [{type: 'poly', x: 5, y: 7}],
    processors: [{
        at: [1, 4],
        links: ['container1', 'container2'],
        program: [
            'ubind @poly',
            'ucontrol itemTake container1 @copper 10 0 0',
            'sensor груз @unit @totalItems',
            'sensor чего @unit @firstItem',
            'sensor вСкладе container1 @copper'
        ].join('\n')
    }]
}

/** Урок «Флаг»: юниты делятся по меткам, и метку видно через sensor. */
export const FLAG = {
    width: 16, height: 10, floor: 'sand',
    blocks: [{type: 'micro-processor', x: 1, y: 5}],
    units: [
        {type: 'poly', x: 5, y: 4},
        {type: 'poly', x: 8, y: 7},
        {type: 'poly', x: 11, y: 3}
    ],
    processors: [{
        at: [1, 5],
        links: [],
        program: [
            'ubind @poly',
            'sensor метка @unit @flag',
            'jump 6 notEqual метка 0',
            'op add последний последний 1',
            'ucontrol flag последний 0 0 0 0',
            'end',
            'op add помечено помечено 1',
            'end'
        ].join('\n')
    }]
}

/** Урок «Добыча»: моно копает медь из руды под собой. */
export const MINE = {
    width: 16, height: 10, floor: 'sand',
    terrain: [{floor: 'sand', ore: 'ore-copper', rect: [8, 3, 3, 3]}],
    blocks: [{type: 'micro-processor', x: 1, y: 4}],
    units: [{type: 'mono', x: 6, y: 4}],
    processors: [{
        at: [1, 4],
        links: [],
        program: [
            'ubind @mono',
            'ucontrol mine 9 4 0 0 0',
            'sensor груз @unit @totalItems',
            'sensor чего @unit @firstItem',
            'sensor копает @unit @mining'
        ].join('\n')
    }]
}

/** Тот же урок: полный рейс — набрать на одном складе и отвезти на другой. */
export const FERRY = {
    width: 20, height: 10, floor: 'sand',
    blocks: [
        {type: 'micro-processor', x: 1, y: 4},
        {type: 'container', x: 5, y: 4, items: {copper: 90}},
        {type: 'container', x: 15, y: 4}
    ],
    units: [{type: 'poly', x: 5, y: 7}],
    processors: [{
        at: [1, 4],
        links: ['container1', 'container2'],
        program: [
            'ubind @poly',
            'sensor груз @unit @totalItems',
            'jump 6 greaterThanEq груз 30',
            'ucontrol move 5 4 0 0 0',
            'ucontrol itemTake container1 @copper 30 0 0',
            'end',
            'ucontrol move 15 4 0 0 0',
            'ucontrol itemDrop container2 30 0 0 0',
            'sensor привезено container2 @copper'
        ].join('\n')
    }]
}
