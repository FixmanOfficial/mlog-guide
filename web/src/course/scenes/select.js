/**
 * Сцены примеров группы `select`.
 *
 * Числа, которые урок называет вслух, проверяет `web/test/course.test.js`.
 */

/** Урок «Выбор значения без ветки»: одна строка вместо перехода, метки и числа. */
export const CHOICE = {
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
            'select хватает greaterThanEq медь 100 1 0',
            'select надпись greaterThanEq медь 100 "хватает" "мало"',
            'select сколькоБрать lessThan медь 100 медь 100'
        ].join('\n')
    }]
}
