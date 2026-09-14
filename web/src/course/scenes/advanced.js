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


/** Урок «Метки»: та же программа, записанная метками вместо номеров. */
export const LABELS = {
    width: 7, height: 5, floor: 'sand',
    blocks: [{type: 'micro-processor', x: 3, y: 2}],
    processors: [{
        at: [3, 2],
        links: [],
        program: [
            'set счёт 0',
            'снова:',
            'op add счёт счёт 1',
            'jump снова lessThan счёт 5',
            'set готово 1',
            'stop'
        ].join('\n')
    }]
}

/** Урок «Время»: три часа показывают одно и то же время в разных единицах. */
export const CLOCK = {
    width: 12, height: 7, floor: 'sand',
    blocks: [{type: 'micro-processor', x: 2, y: 3}],
    processors: [{
        at: [2, 3],
        links: [],
        program: [
            'set миллисекунды @time',
            'set тики @tick',
            'set секунды @second',
            'set минуты @minute',
            'op idiv изТиков тики 60'
        ].join('\n')
    }]
}

/** Тот же урок: таймер на сроке — «раз в две секунды» без `wait`. */
export const TIMER = {
    width: 12, height: 7, floor: 'sand',
    blocks: [{type: 'micro-processor', x: 2, y: 3}],
    processors: [{
        at: [2, 3],
        links: [],
        program: [
            'jump 4 lessThan @second срок',
            'op add срок @second 2',
            'op add сработало сработало 1',
            'end',
            'op add холостых холостых 1',
            'end'
        ].join('\n')
    }]
}

/** Урок «Сколько стоит инструкция»: круг из трёх строк на скорости 25. */
export const COST = {
    width: 12, height: 7, floor: 'sand',
    blocks: [{type: 'hyper-processor', x: 2, y: 3}],
    processors: [{
        at: [2, 3],
        links: [],
        program: [
            'op add кругов кругов 1',
            'set скорость @ipt',
            'op div кругаЗаТик кругов @tick'
        ].join('\n')
    }]
}
