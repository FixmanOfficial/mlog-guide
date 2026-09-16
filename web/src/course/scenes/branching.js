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
            'set on 1',
            'set stock 40',
            'jump 8 equal on 0',
            'jump 8 lessThan stock 10',
            'set give 5',
            'op sub stock stock give',
            'set done 1',
            'stop',
            'set done 0'
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
            'set address 0',
            'read value cell1 address',
            'jump 7 notEqual value 0',
            'op add address address 1',
            'jump 1 lessThan address 64',
            'set wasFound -1',
            'stop',
            'set wasFound address',
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
            'set count 0',
            'op mod rest count 2',
            'jump 4 notEqual rest 0',
            'op add total total count',
            'op add count count 1',
            'jump 1 lessThan count 10',
            'stop'
        ].join('\n')
    }]
}
