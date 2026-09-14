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
    width: 9, height: 6, floor: 'sand',
    blocks: [{type: 'micro-processor', x: 4, y: 2}],
    processors: [{
        at: [4, 2],
        links: [],
        program: [
            'lookup item первыйПредмет 0',
            'lookup unit первыйЮнит 0',
            'lookup liquid перваяЖидкость 0',
            'lookup item заГраницей 999',
            'sensor номерГрафита @graphite @id',
            'lookup item обратно номерГрафита',
            'set предметов @itemCount',
            'set юнитов @unitCount',
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
    width: 13, height: 8, floor: 'sand',
    blocks: [
        {type: 'micro-processor', x: 1, y: 4},
        {type: 'container', x: 5, y: 4, items: {copper: 40, lead: 25, graphite: 60}},
        {type: 'message', x: 10, y: 4}
    ],
    processors: [{
        at: [1, 4],
        links: ['container1', 'message1'],
        program: [
            'lookup item предмет номер',
            'sensor сколько container1 предмет',
            'jump 5 lessThanEq сколько лучшее',
            'set лучшее сколько',
            'set чего предмет',
            'op add номер номер 1',
            'jump 0 lessThan номер @itemCount',
            'print чего',
            'print ": "',
            'print лучшее',
            'printflush message1',
            'stop'
        ].join('\n')
    }]
}
