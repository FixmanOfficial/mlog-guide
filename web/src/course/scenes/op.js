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
    width: 8, height: 5, floor: 'sand',
    blocks: [{type: 'micro-processor', x: 2, y: 2}],
    processors: [{
        at: [2, 2],
        links: [],
        program: [
            'set a 12',
            'set b 5',
            'op add сумма a b',
            'op sub разность a b',
            'op mul произведение a b',
            'op div частное a b'
        ].join('\n')
    }]
}

/** Урок «Арифметика»: одна операция в строке, поэтому скобки разворачиваются в две строки. */
export const STEPS = {
    width: 8, height: 5, floor: 'sand',
    blocks: [{type: 'micro-processor', x: 2, y: 2}],
    processors: [{
        at: [2, 2],
        links: [],
        program: [
            'set a 12',
            'set b 5',
            'op add сумма a b',
            'op mul итог сумма 2'
        ].join('\n')
    }]
}

/** Урок «Целые и точность»: деление нацело и остаток, в том числе от отрицательного. */
export const INTEGERS = {
    width: 8, height: 5, floor: 'sand',
    blocks: [{type: 'micro-processor', x: 2, y: 2}],
    processors: [{
        at: [2, 2],
        links: [],
        program: [
            'op div точно 7 2',
            'op idiv целое 7 2',
            'op mod остаток 7 2',
            'op idiv вниз -7 2',
            'op mod знак -7 3',
            'op emod всегда -7 3'
        ].join('\n')
    }]
}

/** Урок «Целые и точность»: три округления одного и того же числа. */
export const ROUNDING = {
    width: 8, height: 5, floor: 'sand',
    blocks: [{type: 'micro-processor', x: 2, y: 2}],
    processors: [{
        at: [2, 2],
        links: [],
        program: [
            'op floor вниз 3.7',
            'op ceil вверх 3.2',
            'op round ближе 2.5'
        ].join('\n')
    }]
}

/** Урок «Целые и точность»: сумма долей и два способа сравнить её с ожидаемым. */
export const PRECISION = {
    width: 8, height: 5, floor: 'sand',
    blocks: [{type: 'micro-processor', x: 2, y: 2}],
    processors: [{
        at: [2, 2],
        links: [],
        program: [
            'op add сумма 0.1 0.2',
            'op equal равно сумма 0.3',
            'op strictEqual строго сумма 0.3'
        ].join('\n')
    }]
}

/** Урок «Сравнения и логика»: два условия про запас меди и их соединение. */
export const LOGIC = {
    width: 8, height: 5, floor: 'sand',
    blocks: [{type: 'micro-processor', x: 2, y: 2}],
    processors: [{
        at: [2, 2],
        links: [],
        program: [
            'set медь 40',
            'set предел 100',
            'op lessThan мало медь предел',
            'op greaterThan много медь предел',
            'op land оба мало много',
            'op or хотяБы мало много'
        ].join('\n')
    }]
}

/** Урок «Сравнения и логика»: `not` не отрицание, а инверсия битов. */
export const NEGATION = {
    width: 8, height: 5, floor: 'sand',
    blocks: [{type: 'micro-processor', x: 2, y: 2}],
    processors: [{
        at: [2, 2],
        links: [],
        program: [
            'op not побитовое 1',
            'op equal логическое 1 0'
        ].join('\n')
    }]
}

/** Урок «Битовые операции»: три операции над 12 и 10 и два сдвига. */
export const BITWISE = {
    width: 8, height: 5, floor: 'sand',
    blocks: [{type: 'micro-processor', x: 2, y: 2}],
    processors: [{
        at: [2, 2],
        links: [],
        program: [
            'op and маска 12 10',
            'op or обе 12 10',
            'op xor разные 12 10',
            'op shl сдвиг 1 3',
            'op shr обратно 8 3',
            'op not инверт 5'
        ].join('\n')
    }]
}

/** Урок «Битовые операции»: три ответа, которых никто не ждёт. */
export const SHIFTS = {
    width: 8, height: 5, floor: 'sand',
    blocks: [{type: 'micro-processor', x: 2, y: 2}],
    processors: [{
        at: [2, 2],
        links: [],
        program: [
            'op shl перебор 1 64',
            'op shr знак -8 1',
            'op ushr беззнак -1 60'
        ].join('\n')
    }]
}
