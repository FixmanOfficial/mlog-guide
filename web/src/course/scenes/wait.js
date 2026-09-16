/**
 * Сцены примеров про то, как процессор прерывает ход программы: `wait`, `end`, `stop`.
 *
 * Числа, которые уроки называют вслух, проверяет `web/test/course.test.js`: сколько итераций
 * программа успевает за секунду с разными хвостами.
 */

/** Урок «Пауза в секундах»: итерация раз в секунду вместо итерации каждый тик. */
export const TICKS = {
    width: 7, height: 5, floor: 'sand-floor',
    blocks: [{type: 'micro-processor', x: 3, y: 2}],
    processors: [{
        at: [3, 2],
        links: [],
        program: [
            'op add loops loops 1',
            'wait 1'
        ].join('\n')
    }]
}

/**
 * Урок «End»: итерация обрывается раньше, и строка под `end` не выполняется никогда.
 *
 * Четыре шага — это две итерации: в каждой по две инструкции, а `after` так и остаётся пустым.
 */
export const ENDING = {
    width: 7, height: 5, floor: 'sand-floor',
    blocks: [{type: 'micro-processor', x: 3, y: 2}],
    processors: [{
        at: [3, 2],
        links: [],
        program: [
            'op add loops loops 1',
            'end',
            'op add after after 1'
        ].join('\n')
    }]
}

/** Урок «Stop»: процессор останавливается насовсем. */
export const STOPPED = {
    width: 7, height: 5, floor: 'sand-floor',
    blocks: [{type: 'micro-processor', x: 3, y: 2}],
    processors: [{
        at: [3, 2],
        links: [],
        program: [
            'op add loops loops 1',
            'stop',
            'op add afterStop afterStop 1'
        ].join('\n')
    }]
}

/** Урок «Ритм программы»: раз в полсекунды. */
export const RHYTHM = {
    width: 11, height: 6, floor: 'sand-floor',
    blocks: [
        {type: 'micro-processor', x: 2, y: 2},
        {type: 'container', x: 7, y: 3, items: {copper: 120}}
    ],
    processors: [{
        at: [2, 2],
        links: ['container1'],
        program: [
            'sensor copper container1 @copper',
            'op add checks checks 1',
            'wait 0.5'
        ].join('\n')
    }]
}

/**
 * Урок «Ритм программы», второй пример: медленная часть отмеряется временем.
 *
 * `@time` — игровое время в миллисекундах. Программа помнит срок и до него крутится
 * вхолостую: за секунду итерация проходит под шестьдесят раз, а `sensor` срабатывает один.
 */
export const TIMER = {
    width: 11, height: 6, floor: 'sand-floor',
    blocks: [
        {type: 'micro-processor', x: 2, y: 2},
        {type: 'container', x: 7, y: 3, items: {copper: 120}}
    ],
    processors: [{
        at: [2, 2],
        links: ['container1'],
        program: [
            'op add loops loops 1',
            'jump 0 lessThan @time deadline',
            'op add deadline @time 1000',
            'sensor copper container1 @copper',
            'op add checks checks 1'
        ].join('\n')
    }]
}
