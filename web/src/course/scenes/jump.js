/**
 * Сцены примеров группы `jump`.
 *
 * Цель перехода в тексте программы — номер строки, а в блоках её задают стрелкой. Номера
 * здесь считаются с нуля, как в игре: `jump 4` ведёт на пятую сверху строку.
 */

/** Урок «Условие и ветвление»: одна проверка и две дороги. */
export const BRANCH = {
    width: 7, height: 5, floor: 'sand',
    blocks: [{type: 'micro-processor', x: 3, y: 2}],
    processors: [{
        at: [3, 2],
        links: [],
        program: [
            'set запас 7',
            'jump 4 greaterThanEq запас 10',
            'set мало 1',
            'end',
            'set мало 0'
        ].join('\n')
    }]
}

/** Урок «Циклы»: складывает числа от нуля до четырёх и останавливается. */
export const LOOP = {
    width: 7, height: 5, floor: 'sand',
    blocks: [{type: 'micro-processor', x: 3, y: 2}],
    processors: [{
        at: [3, 2],
        links: [],
        program: [
            'set счёт 0',
            'set итог 0',
            'op add итог итог счёт',
            'op add счёт счёт 1',
            'jump 2 lessThan счёт 5',
            'end'
        ].join('\n')
    }]
}

/** Урок «@counter, always и strictEqual»: переход записью в счётчик. */
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
