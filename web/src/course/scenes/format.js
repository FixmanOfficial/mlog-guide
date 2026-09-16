/**
 * Сцены примеров групп Format и Print Char.
 *
 * Числа и строки, которые уроки называют вслух, проверяет `web/test/course.test.js`.
 */

/** Урок «Подстановка в шаблон»: один шаблон и два значения по местам. */
export const TEMPLATE = {
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
            'print "copper {0} of {1}"',
            'format copper',
            'format 300',
            'printflush message1',
            'wait 0.5'
        ].join('\n')
    }]
}

/** Урок «Символы и иконки»: символ по коду и символ предмета. */
export const CHARS = {
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
            'printchar @copper',
            'print " "',
            'print copper',
            'printchar 32',
            'printchar 8593',
            'printflush message1',
            'wait 0.5'
        ].join('\n')
    }]
}
