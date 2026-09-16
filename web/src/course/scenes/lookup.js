/**
 * Сцены группы Lookup — контент по номеру.
 *
 * Номера берутся не из головы: таблицы лежат в ассете `logicids.dat` и снимаются
 * `tools/gen-content.mjs`. Поэтому «нулевой предмет — медь» здесь не допущение, а факт игры.
 *
 * Числа, которые уроки называют вслух, проверяет `web/test/course.test.js`.
 */

/** Урок «Контент по номеру»: четыре таблицы, границы и обратный перевод через `@id`. */
export const TABLE = {
    width: 9, height: 6, floor: 'sand-floor',
    blocks: [{type: 'micro-processor', x: 4, y: 2}],
    processors: [{
        at: [4, 2],
        links: [],
        program: [
            'lookup item firstItem 0',
            'lookup unit firstUnit 0',
            'lookup liquid firstLiquid 0',
            'lookup item pastEnd 999',
            'sensor graphiteId @graphite @id',
            'lookup item back graphiteId',
            'set itemCount @itemCount',
            'set unitCount @unitCount',
            'stop'
        ].join('\n')
    }]
}

/**
 * Тот же урок: обход всех предметов.
 *
 * Программа спрашивает склад про каждый предмет по очереди и запоминает, какого больше всех.
 * Без `lookup` пришлось бы выписывать двадцать констант руками.
 */
export const SCAN = {
    width: 13, height: 8, floor: 'sand-floor',
    blocks: [
        {type: 'micro-processor', x: 1, y: 4},
        {type: 'container', x: 5, y: 4, items: {copper: 40, lead: 25, graphite: 60}},
        {type: 'message', x: 10, y: 4}
    ],
    processors: [{
        at: [1, 4],
        links: ['container1', 'message1'],
        program: [
            'lookup item item index',
            'sensor amount container1 item',
            'jump 5 lessThanEq amount best',
            'set best amount',
            'set what item',
            'op add index index 1',
            'jump 0 lessThan index @itemCount',
            'print what',
            'print ": "',
            'print best',
            'printflush message1',
            'stop'
        ].join('\n')
    }]
}
