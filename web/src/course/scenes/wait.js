/**
 * Сцены примеров про то, как процессор прерывает ход программы: `wait`, `end`, `stop`.
 *
 * Числа, которые уроки называют вслух, проверяет `web/test/course.test.js`: сколько итераций
 * программа успевает за секунду с разными хвостами.
 */

/** Урок «Пауза в секундах»: круг раз в секунду вместо круга каждый тик. */
export const TICKS = {
    width: 7, height: 5, floor: 'sand-floor',
    blocks: [{type: 'micro-processor', x: 3, y: 2}],
    processors: [{
        at: [3, 2],
        links: [],
        program: [
            'op add итераций итераций 1',
            'wait 1'
        ].join('\n')
    }]
}

/**
 * Урок «End»: круг обрывается раньше, и строка под `end` не выполняется никогда.
 *
 * Четыре шага — это два круга: в итерации две инструкции, а `после` так и остаётся пустым.
 */
export const ENDING = {
    width: 7, height: 5, floor: 'sand-floor',
    blocks: [{type: 'micro-processor', x: 3, y: 2}],
    processors: [{
        at: [3, 2],
        links: [],
        program: [
            'op add итераций итераций 1',
            'end',
            'op add после после 1'
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
            'op add итераций итераций 1',
            'stop',
            'op add послеСтопа послеСтопа 1'
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
            'sensor медь container1 @copper',
            'op add проверок проверок 1',
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
            'op add итераций итераций 1',
            'jump 0 lessThan @time срок',
            'op add срок @time 1000',
            'sensor медь container1 @copper',
            'op add проверок проверок 1'
        ].join('\n')
    }]
}
