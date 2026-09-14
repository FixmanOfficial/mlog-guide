/**
 * Сцены урока «Вложенные условия и ранний выход».
 *
 * В mlog нет ни `else`, ни скобок, ни «и» в условии: всё это собирается из нескольких
 * `jump` подряд. Уроку нужно показать три приёма — охрану, выход из цикла и пропуск шага.
 *
 * Номера строк в программах считаются с нуля, как в игре.
 */

/** Ранний выход: две проверки в начале отсекают случаи, когда работать не надо. */
export const GUARD = {
    width: 7, height: 5, floor: 'sand-floor',
    blocks: [{type: 'micro-processor', x: 3, y: 2}],
    processors: [{
        at: [3, 2],
        links: [],
        program: [
            'set включено 1',
            'set запас 40',
            'jump 8 equal включено 0',
            'jump 8 lessThan запас 10',
            'set выдать 5',
            'op sub запас запас выдать',
            'set сделано 1',
            'stop',
            'set сделано 0'
        ].join('\n')
    }]
}

/** Выход из цикла: перебор ячейки прекращается на первом непустом месте. */
export const BREAK = {
    width: 12, height: 7, floor: 'sand-floor',
    blocks: [
        {type: 'micro-processor', x: 2, y: 3},
        {type: 'memory-cell', x: 7, y: 3, memory: [0, 0, 0, 42]}
    ],
    processors: [{
        at: [2, 3],
        links: ['cell1'],
        program: [
            'set адрес 0',
            'read значение cell1 адрес',
            'jump 7 notEqual значение 0',
            'op add адрес адрес 1',
            'jump 1 lessThan адрес 64',
            'set найдено -1',
            'stop',
            'set найдено адрес',
            'stop'
        ].join('\n')
    }]
}

/** Пропуск шага: в сумму идут только чётные числа, остальные цикл проматывает. */
export const SKIP = {
    width: 7, height: 5, floor: 'sand-floor',
    blocks: [{type: 'micro-processor', x: 3, y: 2}],
    processors: [{
        at: [3, 2],
        links: [],
        program: [
            'set счёт 0',
            'op mod остаток счёт 2',
            'jump 4 notEqual остаток 0',
            'op add итог итог счёт',
            'op add счёт счёт 1',
            'jump 1 lessThan счёт 10',
            'stop'
        ].join('\n')
    }]
}
