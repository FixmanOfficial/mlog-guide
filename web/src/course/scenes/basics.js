/**
 * Сцены примеров группы `basics`.
 *
 * Мира в них нет вовсе: речь про значения, а не про блоки. Числа, которые называет урок,
 * проверяет `web/test/course.test.js`.
 */

/** Урок «Число, объект и null»: три вида значений и что с ними делает арифметика. */
export const VALUES = {
    width: 6, height: 4, floor: 'sand-floor',
    blocks: [{type: 'micro-processor', x: 2, y: 2}],
    processors: [{
        at: [2, 2],
        links: [],
        program: [
            'set number 5',
            'set text "copper"',
            'set item @copper',
            'set unset null'
        ].join('\n')
    }]
}

/** Урок «Пустота: null»: пустота в сравнениях и в арифметике. */
export const EMPTINESS = {
    width: 6, height: 4, floor: 'sand-floor',
    blocks: [{type: 'micro-processor', x: 2, y: 2}],
    processors: [{
        at: [2, 2],
        links: [],
        program: [
            'set unset null',
            'op equal same unset 0',
            'op strictEqual strict unset 0',
            'op add sum unset 1',
            'set item @copper',
            'op add itemPlusOne item 1'
        ].join('\n')
    }]
}

/**
 * Урок «Как работает процессор»: программа, которая просто считает свои проходы.
 *
 * Микропроцессор взят намеренно: у него две инструкции за тик, и на «пуске» видно,
 * что счётчик прибавляется не по кадру экрана, а по тику игры.
 */
export const PROCESSOR = {
    width: 7, height: 5, floor: 'sand-floor',
    blocks: [{type: 'micro-processor', x: 3, y: 2}],
    processors: [{
        at: [3, 2],
        links: [],
        program: [
            'set speed @ipt',
            'op add loops loops 1'
        ].join('\n')
    }]
}


/** Урок «Как писать в игре»: три строки, которые читатель переставляет и правит руками. */
export const EDITOR = {
    width: 7, height: 5, floor: 'sand-floor',
    blocks: [{type: 'micro-processor', x: 3, y: 2}],
    processors: [{
        at: [3, 2],
        links: [],
        program: [
            'set stock 10',
            'op mul doubled stock 2',
            'op add total doubled 5'
        ].join('\n')
    }]
}

/**
 * Урок «Окно переменных»: та же программа, что в уроке про редактор, но с опечаткой.
 *
 * `stok` вместо `stock` — имя, которого нигде не присваивали. Ошибки не будет: mlog заведёт
 * новую переменную со значением `null`, арифметика посчитает её нулём, и программа тихо
 * досчитает не то. Видно это только в таблице переменных, ради чего сцена и нужна.
 */
export const WATCH = {
    width: 7, height: 5, floor: 'sand-floor',
    blocks: [{type: 'micro-processor', x: 3, y: 2}],
    processors: [{
        at: [3, 2],
        links: [],
        program: [
            'set stock 10',
            'op mul doubled stok 2',
            'op add total doubled 5'
        ].join('\n')
    }]
}

/**
 * Урок «Когда не работает»: программа, в которой сразу две ошибки новичка.
 *
 * `count` растёт без остановки, потому что программа выполняется в бесконечном цикле, а `everything` никто
 * не заполнил — деление на пустую переменную даёт не ноль и не бесконечность, а `null`.
 * Обе видны только в таблице переменных: сама программа ни на что не жалуется.
 */
export const DEBUG = {
    width: 7, height: 5, floor: 'sand-floor',
    blocks: [{type: 'micro-processor', x: 3, y: 2}],
    processors: [{
        at: [3, 2],
        links: [],
        program: [
            'set aim 10',
            'op add count count 1',
            'op sub left aim count',
            'op div share count everything'
        ].join('\n')
    }]
}

/**
 * Урок «Переменные и имена»: регистр имени и попытка записать в занятое имя.
 *
 * `stock` и `Stock` — две разные переменные, а `set @copper 7` не делает ничего: имя занято
 * игрой, и присваивание в константу проходит мимо. В таблице его не видно вовсе — константы
 * туда не попадают.
 */
export const NAMES = {
    width: 7, height: 5, floor: 'sand-floor',
    blocks: [{type: 'micro-processor', x: 3, y: 2}],
    processors: [{
        at: [3, 2],
        links: [],
        program: [
            'set stock 100',
            'set Stock 5',
            'op add total stock Stock',
            'set @copper 7'
        ].join('\n')
    }]
}

/**
 * Урок «Связи и getlink»: два связанных блока и перебор связей по номеру.
 *
 * Контейнер и ячейка памяти подключены к процессору, поэтому у них есть имена — `container1`
 * и `cell1`. `@links` знает, сколько их, а `getlink` достаёт здание по номеру, начиная с нуля.
 */
export const LINKS = {
    width: 12, height: 7, floor: 'sand-floor',
    blocks: [
        {type: 'micro-processor', x: 2, y: 3},
        {type: 'container', x: 6, y: 4, items: {copper: 80}},
        {type: 'memory-cell', x: 6, y: 1}
    ],
    processors: [{
        at: [2, 3],
        links: ['container1', 'cell1'],
        program: [
            'set amount @links',
            'getlink first 0',
            'getlink second 1',
            'getlink third 2',
            'sensor copper container1 @copper'
        ].join('\n')
    }]
}
