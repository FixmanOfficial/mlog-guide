/**
 * Сцены примеров группы `basics`.
 *
 * Мира в них нет вовсе: речь про значения, а не про блоки. Числа, которые называет урок,
 * проверяет `web/test/course.test.js`.
 */

/** Урок «Число, объект и null»: три вида значений и что с ними делает арифметика. */
export const VALUES = {
    width: 6, height: 4, floor: 'sand',
    blocks: [{type: 'micro-processor', x: 2, y: 2}],
    processors: [{
        at: [2, 2],
        links: [],
        program: [
            'set число 5',
            'set текст "медь"',
            'set предмет @copper',
            'set безЗначения null'
        ].join('\n')
    }]
}

/** Тот же урок, вторая половина: `null` в сравнениях и в арифметике. */
export const EMPTINESS = {
    width: 6, height: 4, floor: 'sand',
    blocks: [{type: 'micro-processor', x: 2, y: 2}],
    processors: [{
        at: [2, 2],
        links: [],
        program: [
            'set безЗначения null',
            'op equal равно безЗначения 0',
            'op strictEqual строго безЗначения 0',
            'op add сумма безЗначения 1',
            'set предмет @copper',
            'op add объектПлюсОдин предмет 1'
        ].join('\n')
    }]
}

/**
 * Урок «Как работает процессор»: программа, которая просто считает свои проходы.
 *
 * Микропроцессор взят намеренно: у него две инструкции за такт, и на «пуске» видно,
 * что счётчик прибавляется не по кадру экрана, а по такту игры.
 */
export const PROCESSOR = {
    width: 7, height: 5, floor: 'sand',
    blocks: [{type: 'micro-processor', x: 3, y: 2}],
    processors: [{
        at: [3, 2],
        links: [],
        program: [
            'set скорость @ipt',
            'op add кругов кругов 1'
        ].join('\n')
    }]
}


/** Урок «Как писать в игре»: три строки, которые читатель переставляет и правит руками. */
export const EDITOR = {
    width: 7, height: 5, floor: 'sand',
    blocks: [{type: 'micro-processor', x: 3, y: 2}],
    processors: [{
        at: [3, 2],
        links: [],
        program: [
            'set запас 10',
            'op mul удвоено запас 2',
            'op add итог удвоено 5'
        ].join('\n')
    }]
}

/**
 * Урок «Окно переменных»: та же программа, что в уроке про редактор, но с опечаткой.
 *
 * `запс` вместо `запас` — имя, которого нигде не присваивали. Ошибки не будет: mlog заведёт
 * новую переменную со значением `null`, арифметика посчитает её нулём, и программа тихо
 * досчитает не то. Видно это только в таблице переменных, ради чего сцена и нужна.
 */
export const WATCH = {
    width: 7, height: 5, floor: 'sand',
    blocks: [{type: 'micro-processor', x: 3, y: 2}],
    processors: [{
        at: [3, 2],
        links: [],
        program: [
            'set запас 10',
            'op mul удвоено запс 2',
            'op add итог удвоено 5'
        ].join('\n')
    }]
}

/**
 * Урок «Когда не работает»: программа, в которой сразу две ошибки новичка.
 *
 * `счёт` растёт без остановки, потому что программа идёт по кругу, а `всего` никто
 * не заполнил — деление на пустую переменную даёт не ноль и не бесконечность, а `null`.
 * Обе видны только в таблице переменных: сама программа ни на что не жалуется.
 */
export const DEBUG = {
    width: 7, height: 5, floor: 'sand',
    blocks: [{type: 'micro-processor', x: 3, y: 2}],
    processors: [{
        at: [3, 2],
        links: [],
        program: [
            'set цель 10',
            'op add счёт счёт 1',
            'op sub осталось цель счёт',
            'op div доля счёт всего'
        ].join('\n')
    }]
}

/**
 * Урок «Переменные и имена»: регистр имени и попытка записать в занятое имя.
 *
 * `запас` и `Запас` — две разные переменные, а `set @copper 7` не делает ничего: имя занято
 * игрой, и присваивание в константу проходит мимо. В таблице его не видно вовсе — константы
 * туда не попадают.
 */
export const NAMES = {
    width: 7, height: 5, floor: 'sand',
    blocks: [{type: 'micro-processor', x: 3, y: 2}],
    processors: [{
        at: [3, 2],
        links: [],
        program: [
            'set запас 100',
            'set Запас 5',
            'op add итог запас Запас',
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
    width: 12, height: 7, floor: 'sand',
    blocks: [
        {type: 'micro-processor', x: 2, y: 3},
        {type: 'container', x: 6, y: 4, items: {copper: 80}},
        {type: 'memory-cell', x: 6, y: 1}
    ],
    processors: [{
        at: [2, 3],
        links: ['container1', 'cell1'],
        program: [
            'set сколько @links',
            'getlink первый 0',
            'getlink второй 1',
            'getlink третий 2',
            'sensor медь container1 @copper'
        ].join('\n')
    }]
}
