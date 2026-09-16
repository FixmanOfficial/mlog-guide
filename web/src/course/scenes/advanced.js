/**
 * Сцены примеров группы «Продвинутое».
 *
 * Числа, которые урок называет вслух, проверяет `web/test/course.test.js`.
 */

/** Урок «`@counter`: переход как значение»: запись числа в счётчик. */
export const COUNTER = {
    width: 7, height: 5, floor: 'sand-floor',
    blocks: [{type: 'micro-processor', x: 3, y: 2}],
    processors: [{
        at: [3, 2],
        links: [],
        program: [
            'set target 3',
            'set @counter target',
            'set skipped 1',
            'set reached 1',
            'end'
        ].join('\n')
    }]
}

/**
 * Тот же урок: переход, посчитанный от текущего места.
 *
 * К моменту, когда строка выполняется, счётчик уже показывает на следующую — поэтому
 * прибавка 2 пропускает ровно две строки, а не одну.
 */
export const RELATIVE = {
    width: 7, height: 5, floor: 'sand-floor',
    blocks: [{type: 'micro-processor', x: 3, y: 2}],
    processors: [{
        at: [3, 2],
        links: [],
        program: [
            'set step 2',
            'op add @counter @counter step',
            'set firstOne 1',
            'set secondOne 1',
            'set thirdOne 1'
        ].join('\n')
    }]
}

/**
 * Урок «Число внутри»: где целые перестают быть точными.
 *
 * 2⁵² плюс единица — честное число, 2⁵³ плюс единица — уже нет: младший бит теряется,
 * потому что мантисса двойной точности хранит 53 значащих бита.
 */
export const PRECISE = {
    width: 7, height: 5, floor: 'sand-floor',
    blocks: [{type: 'micro-processor', x: 3, y: 2}],
    processors: [{
        at: [3, 2],
        links: [],
        program: [
            'op shl withOne 1 52',
            'op or withOne withOne 1',
            'op shl lostBit 1 53',
            'op or lostBit lostBit 1',
            'op sub check lostBit 9007199254740992',
            'op add fraction 0.1 0.2',
            'op sub failure fraction 0.3',
            'stop'
        ].join('\n')
    }]
}


/** Урок «Метки»: та же программа, записанная метками вместо номеров. */
export const LABELS = {
    width: 7, height: 5, floor: 'sand-floor',
    blocks: [{type: 'micro-processor', x: 3, y: 2}],
    processors: [{
        at: [3, 2],
        links: [],
        program: [
            'set count 0',
            'again:',
            'op add count count 1',
            'jump again lessThan count 5',
            'set ready 1',
            'stop'
        ].join('\n')
    }]
}

/** Урок «Время»: три часа показывают одно и то же время в разных единицах. */
export const CLOCK = {
    width: 12, height: 7, floor: 'sand-floor',
    blocks: [{type: 'micro-processor', x: 2, y: 3}],
    processors: [{
        at: [2, 3],
        links: [],
        program: [
            'set millis @time',
            'set ticks @tick',
            'set seconds @second',
            'set minutes @minute',
            'op idiv fromTicks ticks 60'
        ].join('\n')
    }]
}

/** Тот же урок: таймер на сроке — «раз в две секунды» без `wait`. */
export const TIMER = {
    width: 12, height: 7, floor: 'sand-floor',
    blocks: [{type: 'micro-processor', x: 2, y: 3}],
    processors: [{
        at: [2, 3],
        links: [],
        program: [
            'jump 4 lessThan @second deadline',
            'op add deadline @second 2',
            'op add fired fired 1',
            'end',
            'op add idle idle 1',
            'end'
        ].join('\n')
    }]
}

/** Урок «Сколько стоит инструкция»: итерация из трёх строк на скорости 25. */
export const COST = {
    width: 12, height: 7, floor: 'sand-floor',
    blocks: [{type: 'hyper-processor', x: 2, y: 3}],
    processors: [{
        at: [2, 3],
        links: [],
        program: [
            'op add loops loops 1',
            'set speed @ipt',
            'op div loopsPerTick loops @tick'
        ].join('\n')
    }]
}

/** Урок «Упаковка данных»: два числа в одном — и обратно. */
export const PACKED = {
    width: 12, height: 7, floor: 'sand-floor',
    blocks: [{type: 'micro-processor', x: 2, y: 3}],
    processors: [{
        at: [2, 3],
        links: [],
        program: [
            'set x 37',
            'set y 12',
            'op mul packed x 1000',
            'op add packed packed y',
            'op idiv backX packed 1000',
            'op mod backY packed 1000',
            'stop'
        ].join('\n')
    }]
}

/** Урок «Несколько процессоров»: разделение труда через ячейку памяти. */
export const CREW = {
    width: 18, height: 10, floor: 'sand-floor',
    blocks: [
        {type: 'micro-processor', x: 2, y: 7},
        {type: 'micro-processor', x: 2, y: 3},
        {type: 'memory-cell', x: 8, y: 5},
        {type: 'container', x: 13, y: 5, items: {copper: 40, lead: 25}},
        {type: 'message', x: 16, y: 5}
    ],
    processors: [
        {
            at: [2, 7],
            links: ['cell1', 'container1'],
            program: [
                'sensor copperLeft container1 @copper',
                'sensor leadLeft container1 @lead',
                'write copperLeft cell1 0',
                'write leadLeft cell1 1',
                'op add samples samples 1'
            ].join('\n')
        },
        {
            at: [2, 3],
            links: ['cell1', 'message1'],
            program: [
                'read copperLeft cell1 0',
                'read leadLeft cell1 1',
                'op add everything copperLeft leadLeft',
                'print "all "',
                'print everything',
                'printflush message1'
            ].join('\n')
        }
    ]
}

/** Урок «Тонкости языка»: допуск, пустота вместо NaN и сравнение объектов. */
export const EDGE = {
    width: 12, height: 7, floor: 'sand-floor',
    blocks: [{type: 'micro-processor', x: 2, y: 3}],
    processors: [{
        at: [2, 3],
        links: [],
        program: [
            'op add almost 0.1 0.2',
            'op equal withEpsilon almost 0.3',
            'op strictEqual strict almost 0.3',
            'op div byZero 5 0',
            'op equal blankIsZero null 0',
            'op strictEqual blankStrictly null 0',
            'op equal copperIsCopper @copper @copper',
            'op equal copperIsLead @copper @lead',
            'stop'
        ].join('\n')
    }]
}
