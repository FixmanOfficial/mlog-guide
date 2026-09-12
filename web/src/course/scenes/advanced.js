/**
 * Сцены примеров группы «Продвинутое».
 *
 * Числа, которые урок называет вслух, проверяет `web/test/course.test.js`.
 */

/** Урок «`@counter`: переход как значение»: запись числа в счётчик. */
export const COUNTER = {
    width: 7, height: 5, floor: 'sand',
    blocks: [{type: 'micro-processor', x: 3, y: 2}],
    processors: [{
        at: [3, 2],
        links: [],
        program: [
            'set куда 3',
            'set @counter куда',
            'set пропущено 1',
            'set дошли 1',
            'end'
        ].join('\n')
    }]
}

/**
 * Тот же урок: переход, посчитанный от текущего места.
 *
 * К моменту, когда строка выполняется, счётчик уже показывает на следующую — поэтому
 * прибавка 2 пропускает ровно две строки, а не одну.
 */
export const RELATIVE = {
    width: 7, height: 5, floor: 'sand',
    blocks: [{type: 'micro-processor', x: 3, y: 2}],
    processors: [{
        at: [3, 2],
        links: [],
        program: [
            'set шаг 2',
            'op add @counter @counter шаг',
            'set первая 1',
            'set вторая 1',
            'set третья 1'
        ].join('\n')
    }]
}
