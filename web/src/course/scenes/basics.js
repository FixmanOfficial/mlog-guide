/**
 * Сцены примеров группы `basics`.
 *
 * Мира в них нет вовсе: речь про значения, а не про блоки. Числа, которые называет урок,
 * проверяет `web/test/course.test.js`.
 */

/** Урок «Число, объект и пустота»: три вида значений и что с ними делает арифметика. */
export const VALUES = {
    width: 6, height: 4, floor: 'sand',
    blocks: [{type: 'micro-processor', x: 2, y: 2}],
    processors: [{
        at: [2, 2],
        links: [],
        program: [
            'set число 5',
            'set текст "медь"',
            'set предмет @copper',
            'set пусто null'
        ].join('\n')
    }]
}

/** Тот же урок, вторая половина: пустота в сравнениях и в арифметике. */
export const EMPTINESS = {
    width: 6, height: 4, floor: 'sand',
    blocks: [{type: 'micro-processor', x: 2, y: 2}],
    processors: [{
        at: [2, 2],
        links: [],
        program: [
            'set пусто null',
            'op equal равно пусто 0',
            'op strictEqual строго пусто 0',
            'op add сумма пусто 1',
            'set предмет @copper',
            'op add объектПлюсОдин предмет 1'
        ].join('\n')
    }]
}
