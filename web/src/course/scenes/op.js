/**
 * Сцены примеров группы `op`.
 *
 * Как и у остальных групп, живут отдельно от текста: числа, которые урок называет вслух —
 * 2.4, −4, 0.30000000000000004, — прогоняются тестом (`web/test/course.test.js`). Урок про
 * арифметику разойтись с движком особенно легко: в нём каждое второе слово это число.
 *
 * Мир у всех сцен маленький и пустой: `op` ничего не спрашивает у мира, ему хватает
 * процессора. Ставить рядом хранилище только ради красоты — значит уводить читателя
 * в другую группу.
 */

/** Урок «Арифметика»: четыре действия над двумя числами. */
export const ARITHMETIC = {
    width: 8, height: 5, floor: 'sand-floor',
    blocks: [{type: 'micro-processor', x: 2, y: 2}],
    processors: [{
        at: [2, 2],
        links: [],
        program: [
            'set a 12',
            'set b 5',
            'op add sum a b',
            'op sub difference a b',
            'op mul product a b',
            'op div quotient a b'
        ].join('\n')
    }]
}

/** Урок «Арифметика»: одна операция в строке, поэтому скобки разворачиваются в две строки. */
export const STEPS = {
    width: 8, height: 5, floor: 'sand-floor',
    blocks: [{type: 'micro-processor', x: 2, y: 2}],
    processors: [{
        at: [2, 2],
        links: [],
        program: [
            'set a 12',
            'set b 5',
            'op add sum a b',
            'op mul total sum 2'
        ].join('\n')
    }]
}

/** Урок «Целые и точность»: деление нацело и остаток, в том числе от отрицательного. */
export const INTEGERS = {
    width: 8, height: 5, floor: 'sand-floor',
    blocks: [{type: 'micro-processor', x: 2, y: 2}],
    processors: [{
        at: [2, 2],
        links: [],
        program: [
            'op div exact 7 2',
            'op idiv whole 7 2',
            'op mod rest 7 2',
            'op idiv down -7 2',
            'op mod sign -7 3',
            'op emod always -7 3'
        ].join('\n')
    }]
}

/** Урок «Целые и точность»: три округления одного и того же числа. */
export const ROUNDING = {
    width: 8, height: 5, floor: 'sand-floor',
    blocks: [{type: 'micro-processor', x: 2, y: 2}],
    processors: [{
        at: [2, 2],
        links: [],
        program: [
            'op floor down 3.7',
            'op ceil up 3.2',
            'op round closer 2.5'
        ].join('\n')
    }]
}

/** Урок «Целые и точность»: сумма долей и два способа сравнить её с ожидаемым. */
export const PRECISION = {
    width: 8, height: 5, floor: 'sand-floor',
    blocks: [{type: 'micro-processor', x: 2, y: 2}],
    processors: [{
        at: [2, 2],
        links: [],
        program: [
            'op add sum 0.1 0.2',
            'op equal same sum 0.3',
            'op strictEqual strict sum 0.3'
        ].join('\n')
    }]
}

/** Урок «Сравнения и логика»: два условия про запас меди и их соединение. */
export const LOGIC = {
    width: 8, height: 5, floor: 'sand-floor',
    blocks: [{type: 'micro-processor', x: 2, y: 2}],
    processors: [{
        at: [2, 2],
        links: [],
        program: [
            'set copper 40',
            'set limit 100',
            'op lessThan low copper limit',
            'op greaterThan plenty copper limit',
            'op land both low plenty',
            'op or atLeastOne low plenty'
        ].join('\n')
    }]
}

/** Урок «Сравнения и логика»: `not` не отрицание, а инверсия битов. */
export const NEGATION = {
    width: 8, height: 5, floor: 'sand-floor',
    blocks: [{type: 'micro-processor', x: 2, y: 2}],
    processors: [{
        at: [2, 2],
        links: [],
        program: [
            'op not bitwise 1',
            'op equal logical 1 0'
        ].join('\n')
    }]
}

/** Урок «Битовые операции»: три операции над 12 и 10 и два сдвига. */
export const BITWISE = {
    width: 8, height: 5, floor: 'sand-floor',
    blocks: [{type: 'micro-processor', x: 2, y: 2}],
    processors: [{
        at: [2, 2],
        links: [],
        program: [
            'op and mask 12 10',
            'op or either 12 10',
            'op xor differ 12 10',
            'op shl shift 1 3',
            'op shr back 8 3',
            'op not flipped 5'
        ].join('\n')
    }]
}

/** Урок «Битовые операции»: три ответа, которых никто не ждёт. */
export const SHIFTS = {
    width: 8, height: 5, floor: 'sand-floor',
    blocks: [{type: 'micro-processor', x: 2, y: 2}],
    processors: [{
        at: [2, 2],
        links: [],
        program: [
            'op shl wrapped 1 64',
            'op shr sign -8 1',
            'op ushr unsigned -1 60'
        ].join('\n')
    }]
}

/** Урок «Углы и расстояния»: длина, угол, разница углов и синус. */
export const GEOMETRY = {
    width: 8, height: 5, floor: 'sand-floor',
    blocks: [{type: 'micro-processor', x: 2, y: 2}],
    processors: [{
        at: [2, 2],
        links: [],
        program: [
            'set dx 30',
            'set dy 40',
            'op len distance dx dy',
            'op angle angle dx dy',
            'op angleDiff gap 350 10',
            'op sin height 30'
        ].join('\n')
    }]
}

/** Урок «Углы и расстояния»: два ответа, которые чуть-чуть не те, что в учебнике. */
export const FLOAT = {
    width: 8, height: 5, floor: 'sand-floor',
    blocks: [{type: 'micro-processor', x: 2, y: 2}],
    processors: [{
        at: [2, 2],
        links: [],
        program: [
            'op len diagonal 1 1',
            'op angle behind -5 0'
        ].join('\n')
    }]
}

/** Урок «Случайность и шум»: бросок кубика от одного до шести. */
export const RANDOM = {
    width: 8, height: 5, floor: 'sand-floor',
    blocks: [{type: 'micro-processor', x: 2, y: 2}],
    processors: [{
        at: [2, 2],
        links: [],
        program: [
            'op rand throw 6',
            'op floor roll throw',
            'op add roll roll 1'
        ].join('\n')
    }]
}

/** Урок «Случайность и шум»: соседние точки шума похожи, дальние — нет. */
export const NOISE = {
    width: 8, height: 5, floor: 'sand-floor',
    blocks: [{type: 'micro-processor', x: 2, y: 2}],
    processors: [{
        at: [2, 2],
        links: [],
        program: [
            'op noise here 10 10',
            'op noise beside 10.01 10',
            'op noise away 40 10'
        ].join('\n')
    }]
}
