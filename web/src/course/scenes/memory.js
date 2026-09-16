/**
 * Сцены примеров групп Read и Write — память в ячейке и банке.
 *
 * Ячейка в примерах приходит уже заполненной: на карте её содержимое лежит в сохранении,
 * и редактор карт умеет положить туда что угодно. Иначе первый же урок про чтение начинался
 * бы с записи, то есть с инструкции из следующей группы.
 *
 * Числа, которые уроки называют вслух, проверяет `web/test/course.test.js`.
 */

/**
 * Урок «Read»: три числа лежат в ячейке, программа достаёт их по адресам.
 *
 * В ячейке 64 места, заняты первые три; остальные нули, а за шестьдесят четвёртым — пусто.
 */
export const CELLS = {
    width: 12, height: 7, floor: 'sand-floor',
    blocks: [
        {type: 'micro-processor', x: 2, y: 3},
        {type: 'memory-cell', x: 6, y: 4, memory: [40, 12, 300]},
        {type: 'message', x: 9, y: 2}
    ],
    processors: [{
        at: [2, 3],
        links: ['cell1', 'message1'],
        program: [
            'read stock cell1 0',
            'read spend cell1 1',
            'read limit cell1 2',
            'print "stock "',
            'print stock',
            'print " of "',
            'print limit',
            'printflush message1'
        ].join('\n')
    }]
}

/**
 * Тот же урок: адрес усекается, а за границей ячейки лежит пустота.
 *
 * `read` берёт адрес через `numi()` — 2.9 это второе место, а не третье. Чтение за границей
 * отдаёт не ноль, а пустое значение: `MemoryBlock.read` говорит об этом отдельной строкой.
 */
export const BOUNDS = {
    width: 12, height: 7, floor: 'sand-floor',
    blocks: [
        {type: 'micro-processor', x: 2, y: 3},
        {type: 'memory-cell', x: 6, y: 4, memory: [40, 12, 300]}
    ],
    processors: [{
        at: [2, 3],
        links: ['cell1'],
        program: [
            'read fractional cell1 1.9',
            'read blank cell1 7',
            'read pastEnd cell1 64',
            'read negative cell1 -1',
            'sensor slots cell1 @memoryCapacity'
        ].join('\n')
    }]
}

/** Урок «Запись в ячейку»: счётчик живёт в памяти, а не в переменной. */
export const STORE = {
    width: 12, height: 7, floor: 'sand-floor',
    blocks: [
        {type: 'micro-processor', x: 2, y: 3},
        {type: 'memory-cell', x: 6, y: 4},
        {type: 'message', x: 9, y: 2}
    ],
    processors: [{
        at: [2, 3],
        links: ['cell1', 'message1'],
        program: [
            'read loops cell1 0',
            'op add loops loops 1',
            'write loops cell1 0',
            'print "loops: "',
            'print loops',
            'printflush message1',
            'wait 0.5'
        ].join('\n')
    }]
}

/**
 * Урок «Объект в ячейке»: память хранит не только числа.
 *
 * `MemoryBlock.write` кладёт объект объектом, а число числом; прочитанный объект остаётся
 * собой — его можно печатать, сравнивать и отдавать инструкциям.
 */
export const OBJECTS = {
    width: 13, height: 7, floor: 'sand-floor',
    blocks: [
        {type: 'micro-processor', x: 2, y: 3},
        {type: 'memory-cell', x: 6, y: 4},
        {type: 'container', x: 9, y: 4, items: {copper: 120}},
        {type: 'message', x: 9, y: 1}
    ],
    processors: [{
        at: [2, 3],
        links: ['cell1', 'container1', 'message1'],
        program: [
            'write @copper cell1 0',
            'write container1 cell1 1',
            'read item cell1 0',
            'read store cell1 1',
            'sensor amount store item',
            'print item',
            'print ": "',
            'print amount',
            'printflush message1'
        ].join('\n')
    }]
}

/**
 * Урок «Общая память»: два процессора и одна ячейка.
 *
 * Первый складывает в неё показания склада, второй берёт их оттуда и печатает. Связи
 * у каждого свои: общее у них только то, что оба подключены к одной ячейке.
 */
export const SHARED = {
    width: 14, height: 8, floor: 'sand-floor',
    blocks: [
        {type: 'micro-processor', x: 2, y: 5},
        {type: 'micro-processor', x: 2, y: 2},
        {type: 'memory-cell', x: 6, y: 4},
        {type: 'container', x: 10, y: 5, items: {copper: 120}},
        {type: 'message', x: 10, y: 1}
    ],
    processors: [
        {
            at: [2, 5],
            links: ['cell1', 'container1'],
            program: [
                'sensor copper container1 @copper',
                'write copper cell1 0'
            ].join('\n')
        },
        {
            at: [2, 2],
            links: ['cell1', 'message1'],
            program: [
                'read copper cell1 0',
                'print "in store "',
                'print copper',
                'printflush message1'
            ].join('\n')
        }
    ]
}

/**
 * Урок «Переменные другого процессора»: сосед читается по имени переменной.
 *
 * Верхний процессор считает итерации у себя, нижний достаёт его счётчик и печатает — ни ячейки,
 * ни уговора об адресах. Заодно берётся связь соседа по имени: своей связи со складом
 * у нижнего нет вовсе.
 */
export const NEIGHBOUR = {
    width: 14, height: 8, floor: 'sand-floor',
    blocks: [
        {type: 'micro-processor', x: 2, y: 5},
        {type: 'micro-processor', x: 2, y: 2},
        {type: 'container', x: 10, y: 5, items: {copper: 120}},
        {type: 'message', x: 10, y: 1}
    ],
    processors: [
        {
            at: [2, 2],
            links: ['processor1', 'message1'],
            program: [
                'read loops processor1 "loops"',
                'read enemyStore processor1 "container1"',
                'sensor copper enemyStore @copper',
                'print "loops "',
                'print loops',
                'print ", copper "',
                'print copper',
                'printflush message1'
            ].join('\n')
        },
        {
            at: [2, 5],
            links: ['container1'],
            program: [
                'op add loops loops 1',
                'wait 0.25'
            ].join('\n')
        }
    ]
}

/**
 * Урок «Символ из строки»: строка разбирается по символам.
 *
 * `read` у строки отдаёт код символа по номеру, а `printchar` собирает их обратно — в буфере
 * получается та же строка, только пройденная посимвольно.
 */
export const LETTERS = {
    width: 12, height: 7, floor: 'sand-floor',
    blocks: [
        {type: 'micro-processor', x: 2, y: 3},
        {type: 'message', x: 8, y: 2}
    ],
    processors: [{
        at: [2, 3],
        links: ['message1'],
        program: [
            'read code "mlog" index',
            'printchar code',
            'op add index index 1',
            'jump 0 lessThan index 4',
            'printflush message1',
            'stop'
        ].join('\n')
    }]
}

/**
 * Урок «Переменные соседа»: команда пишется прямо в переменную соседа.
 *
 * Нижний процессор ставит верхнему `needed` в единицу, тот по ней включает работу и сам же
 * сбрасывает признак обратно — так выглядит уговор «писать к себе, читать у других»,
 * нарушенный ради одной короткой команды.
 */
export const COMMAND = {
    width: 14, height: 8, floor: 'sand-floor',
    blocks: [
        {type: 'micro-processor', x: 2, y: 5},
        {type: 'micro-processor', x: 2, y: 2},
        {type: 'message', x: 10, y: 3}
    ],
    processors: [
        {
            at: [2, 2],
            links: ['processor1'],
            program: [
                'write 1 processor1 "needed"',
                'wait 1'
            ].join('\n')
        },
        {
            at: [2, 5],
            links: ['message1'],
            program: [
                'jump 0 equal needed 0',
                'op add done done 1',
                'set needed 0',
                'print "done "',
                'print done',
                'printflush message1'
            ].join('\n')
        }
    ]
}
