/**
 * Сцены группы Radar — поиск юнита рядом с блоком.
 *
 * Радар смотрит из блока и видит только юнитов. Дальность — своя у блока: у турели это
 * дальность стрельбы, у процессора — дальность связи. Поэтому в сценах радар стоит на дуо:
 * у неё 160, и на карте это видно.
 *
 * Числа, которые уроки называют вслух, проверяет `web/test/course.test.js`.
 */

/** Урок «Найти юнита»: три фильтра складываются логическим И. */
export const FIND = {
    width: 20, height: 11, floor: 'sand-floor',
    blocks: [
        {type: 'micro-processor', x: 1, y: 5},
        {type: 'duo', x: 6, y: 5},
        {type: 'message', x: 16, y: 8}
    ],
    units: [
        {type: 'dagger', x: 10, y: 5, team: 2},
        {type: 'flare', x: 12, y: 7, team: 2},
        {type: 'poly', x: 8, y: 3, team: 1}
    ],
    processors: [{
        at: [1, 5],
        links: ['duo1', 'message1'],
        program: [
            'radar enemy any any distance duo1 1 near',
            'radar enemy flying any distance duo1 1 flying',
            'radar ally any any distance duo1 1 mine',
            'print near',
            'print " "',
            'print flying',
            'print " "',
            'print mine',
            'printflush message1',
            'stop'
        ].join('\n')
    }]
}

/**
 * Урок «Сортировка и кеш»: чем мерить «лучшую» цель и в какую сторону.
 *
 * Кинжал стоит ближе, вспышка дальше; здоровья у кинжала больше. Поэтому «ближний» и «самый
 * живучий» — это один юнит, а «дальний» и «самый слабый» — другой.
 */
export const SORT = {
    width: 20, height: 11, floor: 'sand-floor',
    blocks: [
        {type: 'micro-processor', x: 1, y: 5},
        {type: 'duo', x: 6, y: 5}
    ],
    units: [
        {type: 'dagger', x: 10, y: 5, team: 2},
        {type: 'flare', x: 14, y: 5, team: 2}
    ],
    processors: [{
        at: [1, 5],
        links: ['duo1'],
        program: [
            'radar enemy any any distance duo1 1 near',
            'radar enemy any any distance duo1 0 far',
            'radar enemy any any health duo1 1 tough',
            'radar enemy any any health duo1 0 weakest',
            'sensor nearHealth near @health',
            'sensor weakHealth weakest @health',
            'stop'
        ].join('\n')
    }]
}

/**
 * Тот же урок: цель обновляется раз в 30 тиков.
 *
 * Радар находит вспышку, турель её добивает — и ещё какое-то время радар продолжает отдавать
 * покойника: пересчёт у него не каждую итерацию, а раз в полсекунды.
 */
export const CACHE = {
    width: 24, height: 11, floor: 'sand-floor',
    blocks: [
        {type: 'micro-processor', x: 1, y: 5},
        {type: 'duo', x: 6, y: 5, ammo: {copper: 20}}
    ],
    units: [{type: 'flare', x: 10, y: 5, team: 2}],
    processors: [{
        at: [1, 5],
        links: ['duo1'],
        program: [
            'radar enemy any any distance duo1 1 aim',
            'control shootp duo1 aim 1',
            'sensor dead aim @dead',
            'op add loops loops 1'
        ].join('\n')
    }]
}
