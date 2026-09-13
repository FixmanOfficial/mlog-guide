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

/**
 * Урок «Число внутри»: где целые перестают быть точными.
 *
 * 2⁵² плюс единица — честное число, 2⁵³ плюс единица — уже нет: младший бит теряется,
 * потому что мантисса двойной точности хранит 53 значащих бита.
 */
export const PRECISE = {
    width: 7, height: 5, floor: 'sand',
    blocks: [{type: 'micro-processor', x: 3, y: 2}],
    processors: [{
        at: [3, 2],
        links: [],
        program: [
            'op shl сОдной 1 52',
            'op or сОдной сОдной 1',
            'op shl безЕдиницы 1 53',
            'op or безЕдиницы безЕдиницы 1',
            'op sub проверка безЕдиницы 9007199254740992',
            'op add дробь 0.1 0.2',
            'op sub ошибка дробь 0.3',
            'stop'
        ].join('\n')
    }]
}

