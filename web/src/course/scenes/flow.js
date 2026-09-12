/**
 * Сцены примеров группы «Ход программы».
 *
 * Числа, которые урок называет вслух, проверяет `web/test/course.test.js`: сколько кругов
 * программа успевает за секунду с разными хвостами.
 */

/** Урок «`wait`, `end` и `stop`»: круг раз в секунду вместо круга каждый такт. */
export const TICKS = {
    width: 7, height: 5, floor: 'sand',
    blocks: [{type: 'micro-processor', x: 3, y: 2}],
    processors: [{
        at: [3, 2],
        links: [],
        program: [
            'op add кругов кругов 1',
            'wait 1'
        ].join('\n')
    }]
}

/**
 * Тот же урок: `stop` останавливает процессор насовсем.
 *
 * Третья строка не выполнится ни разу — до неё дело не дойдёт, пока программу не поправят
 * или не перезапустят.
 */
export const STOPPED = {
    width: 7, height: 5, floor: 'sand',
    blocks: [{type: 'micro-processor', x: 3, y: 2}],
    processors: [{
        at: [3, 2],
        links: [],
        program: [
            'op add кругов кругов 1',
            'stop',
            'op add послеСтопа послеСтопа 1'
        ].join('\n')
    }]
}

/** Урок «Ритм программы»: раз в полсекунды. */
export const RHYTHM = {
    width: 11, height: 6, floor: 'sand',
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
