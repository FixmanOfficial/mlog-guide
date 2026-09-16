/**
 * Сцены примеров групп Print и Print Flush.
 *
 * Строку текстового буфера в примерах видно в таблице переменных — это наша добавка,
 * в игре буфер невидим. Числа, которые уроки называют вслух, проверяет
 * `web/test/course.test.js`.
 */

/** Урок «Текстовый буфер»: что попадает в буфер и в каком виде. */
export const BUFFER = {
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
            'print "copper: "',
            'print copper',
            'print " of "',
            'print 300'
        ].join('\n')
    }]
}

/** Тот же урок: во что печатаются не-числа. */
export const PIECES = {
    width: 11, height: 6, floor: 'sand-floor',
    blocks: [
        {type: 'micro-processor', x: 2, y: 2},
        {type: 'container', x: 7, y: 3, items: {copper: 120}}
    ],
    processors: [{
        at: [2, 2],
        links: ['container1'],
        program: [
            'print @copper',
            'print " "',
            'print container1',
            'print " "',
            'print empty',
            'print " "',
            'print 0.5'
        ].join('\n')
    }]
}

/** Урок «Куда уходит буфер»: печать в блок сообщений. */
export const FLUSH = {
    width: 12, height: 7, floor: 'sand-floor',
    blocks: [
        {type: 'micro-processor', x: 2, y: 3},
        {type: 'container', x: 6, y: 4, items: {copper: 120}},
        {type: 'message', x: 9, y: 2}
    ],
    processors: [{
        at: [2, 3],
        links: ['container1', 'message1'],
        program: [
            'sensor copper container1 @copper',
            'print "copper: "',
            'print copper',
            'printflush message1',
            'wait 0.5'
        ].join('\n')
    }]
}
