/**
 * Сцены группы Get Link — связи по номеру.
 *
 * Порядок связей — порядок подключения, и он же порядок в `getlink`. В сцене он задан
 * списком `links`: первым идёт тот, кого подключили первым.
 */

/** Урок «Связи по номеру»: обход всех связей с печатью того, что подключено. */
export const LOOP = {
    width: 14, height: 9, floor: 'sand-floor',
    blocks: [
        {type: 'micro-processor', x: 1, y: 4},
        {type: 'container', x: 5, y: 5, items: {copper: 40}},
        {type: 'memory-cell', x: 5, y: 2},
        {type: 'message', x: 10, y: 4}
    ],
    processors: [{
        at: [1, 4],
        links: ['container1', 'cell1', 'message1'],
        program: [
            'getlink block index',
            'print block',
            'print " "',
            'op add index index 1',
            'jump 0 lessThan index @links',
            'printflush message1',
            'stop'
        ].join('\n')
    }]
}

/** Тот же урок: за последней связью лежит пустота, а не ошибка. */
export const BEYOND = {
    width: 12, height: 8, floor: 'sand-floor',
    blocks: [
        {type: 'micro-processor', x: 1, y: 4},
        {type: 'container', x: 5, y: 4, items: {copper: 40}},
        {type: 'memory-cell', x: 8, y: 4}
    ],
    processors: [{
        at: [1, 4],
        links: ['container1', 'cell1'],
        program: [
            'set amount @links',
            'getlink first 0',
            'getlink second 1',
            'getlink third 2',
            'getlink fractional 1.9',
            'stop'
        ].join('\n')
    }]
}
