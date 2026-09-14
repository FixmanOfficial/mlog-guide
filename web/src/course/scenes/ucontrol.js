/**
 * Сцены группы Unit Control.
 *
 * Юниты в примерах летают по настоящей модели движения: разгон, трение и предел скорости
 * взяты из игры, поэтому в точку юнит приходит не мгновенно и не ровно. Числа, которые
 * уроки называют вслух, проверяет `web/test/course.test.js`.
 */

/** Урок «Движение»: поли летит через всю карту и остаётся у цели. */
export const MOVE = {
    width: 20, height: 10, floor: 'sand-floor',
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
    width: 20, height: 10, floor: 'sand-floor',
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
    width: 20, height: 10, floor: 'sand-floor',
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
    width: 18, height: 10, floor: 'sand-floor',
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
    width: 16, height: 10, floor: 'sand-floor',
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
    width: 16, height: 10, floor: 'sand-floor',
    terrain: [{floor: 'sand-floor', ore: 'ore-copper', rect: [8, 3, 3, 3]}],
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
    width: 20, height: 10, floor: 'sand-floor',
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

/**
 * Урок «Кто управляет юнитом»: двое смотрят на одного поли, командует только один.
 *
 * Второй процессор нарочно ничего не командует — только спрашивает. `ubind` управления
 * не берёт, поэтому он видит чужую власть со стороны: `@controller` отдаёт не его блок.
 */
export const OWNER = {
    width: 20, height: 12, floor: 'sand-floor',
    blocks: [
        {type: 'micro-processor', x: 2, y: 8},
        {type: 'micro-processor', x: 2, y: 3}
    ],
    units: [{type: 'poly', x: 8, y: 6}],
    processors: [
        {
            at: [2, 8],
            links: [],
            program: [
                'ubind @poly',
                'ucontrol move 16 6 0 0 0',
                'sensor кто @unit @controller',
                'op equal мой кто @this'
            ].join('\n')
        },
        {
            at: [2, 3],
            links: [],
            program: [
                'ubind @poly',
                'sensor кто @unit @controller',
                'op equal мой кто @this',
                'sensor кем @unit @controlled'
            ].join('\n')
        }
    ]
}

/**
 * Тот же урок: второй процессор перехватывает юнита, потому что тоже командует.
 *
 * Оба зовут `ucontrol`, и власть достаётся тому, чья команда прошла последней. Юнит
 * при этом мечется между двумя целями — обычная беда отряда без меток.
 */
export const STOLEN = {
    width: 20, height: 12, floor: 'sand-floor',
    blocks: [
        {type: 'micro-processor', x: 2, y: 8},
        {type: 'micro-processor', x: 2, y: 3}
    ],
    units: [{type: 'poly', x: 10, y: 6}],
    processors: [
        {
            at: [2, 8],
            links: [],
            program: [
                'ubind @poly',
                'ucontrol move 18 10 0 0 0',
                'sensor кто @unit @controller',
                'op equal мой кто @this'
            ].join('\n')
        },
        {
            at: [2, 3],
            links: [],
            program: [
                'ubind @poly',
                'ucontrol move 18 2 0 0 0',
                'sensor кто @unit @controller',
                'op equal мой кто @this'
            ].join('\n')
        }
    ]
}

/**
 * Тот же урок: одна команда — и процессор отпускает юнита сам.
 *
 * Команда отдаётся один раз, дальше программа только спрашивает. Через десять секунд
 * срок управления выходит, `@controlled` возвращается к нулю, а `@controller` снова
 * показывает самого юнита — то есть «сам себе хозяин».
 */
export const FORGET = {
    width: 20, height: 12, floor: 'sand-floor',
    blocks: [{type: 'micro-processor', x: 2, y: 6}],
    units: [{type: 'poly', x: 8, y: 6}],
    processors: [{
        at: [2, 6],
        links: [],
        program: [
            'ubind @poly',
            'jump 3 notEqual отдал 0',
            'ucontrol move 16 6 0 0 0',
            'set отдал 1',
            'sensor кем @unit @controlled',
            'sensor кто @unit @controller',
            'op equal мой кто @this'
        ].join('\n')
    }]
}
