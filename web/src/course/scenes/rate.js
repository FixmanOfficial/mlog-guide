/**
 * Сцены группы Set Rate.
 *
 * Скорость процессора — не выдумка урока: `@ipt` показывает её саму, а счётчик итераций
 * за секунду показывает, во что она обходится. Числа проверяет `web/test/course.test.js`.
 */

/** Общая карта: один процессор и табло. */
const stand = (program, type) => ({
    width: 11, height: 7, floor: 'sand',
    blocks: [
        {type, x: 2, y: 3},
        {type: 'message', x: 8, y: 3}
    ],
    processors: [{
        at: [2, 3],
        links: ['message1'],
        program: program.join('\n')
    }]
})

/** Урок «Скорость процессора»: гиперпроцессор на полном ходу. */
export const FULL = stand([
    'set скорость @ipt',
    'op add итераций итераций 1',
    'print итераций',
    'printflush message1',
    'end'
], 'hyper-processor')

/** Тот же урок: `setrate 1` — один шаг за тик. */
export const SLOW = stand([
    'setrate 1',
    'set скорость @ipt',
    'op add итераций итераций 1',
    'print итераций',
    'printflush message1',
    'end'
], 'hyper-processor')

/** Тот же урок: выше своего предела процессор не поднимается. */
export const CEILING = stand([
    'setrate 1000',
    'set скорость @ipt',
    'stop'
], 'micro-processor')
