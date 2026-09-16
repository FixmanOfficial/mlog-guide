/**
 * Сцены примеров группы `jump`.
 *
 * Цель перехода в тексте программы — номер строки, а в блоках её задают стрелкой. Номера
 * здесь считаются с нуля, как в игре: `jump 4` ведёт на пятую сверху строку.
 */

/** Урок «Условие и ветвление»: одна проверка и две дороги. */
export const BRANCH = {
    width: 7, height: 5, floor: 'sand-floor',
    blocks: [{type: 'micro-processor', x: 3, y: 2}],
    processors: [{
        at: [3, 2],
        links: [],
        program: [
            'set stock 7',
            'jump 4 greaterThanEq stock 10',
            'set low 1',
            'end',
            'set low 0'
        ].join('\n')
    }]
}

/** Урок «Циклы»: складывает числа от нуля до четырёх и останавливается. */
export const LOOP = {
    width: 7, height: 5, floor: 'sand-floor',
    blocks: [{type: 'micro-processor', x: 3, y: 2}],
    processors: [{
        at: [3, 2],
        links: [],
        program: [
            'set count 0',
            'set total 0',
            'op add total total count',
            'op add count count 1',
            'jump 2 lessThan count 5',
            'end'
        ].join('\n')
    }]
}
