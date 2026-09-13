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
    width: 12, height: 7, floor: 'sand',
    blocks: [
        {type: 'micro-processor', x: 2, y: 3},
        {type: 'memory-cell', x: 6, y: 4, memory: [40, 12, 300]},
        {type: 'message', x: 9, y: 2}
    ],
    processors: [{
        at: [2, 3],
        links: ['cell1', 'message1'],
        program: [
            'read запас cell1 0',
            'read расход cell1 1',
            'read предел cell1 2',
            'print "запас "',
            'print запас',
            'print " из "',
            'print предел',
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
    width: 12, height: 7, floor: 'sand',
    blocks: [
        {type: 'micro-processor', x: 2, y: 3},
        {type: 'memory-cell', x: 6, y: 4, memory: [40, 12, 300]}
    ],
    processors: [{
        at: [2, 3],
        links: ['cell1'],
        program: [
            'read дробный cell1 1.9',
            'read пустое cell1 7',
            'read заГраницей cell1 64',
            'read отрицательный cell1 -1',
            'sensor мест cell1 @memoryCapacity'
        ].join('\n')
    }]
}

/** Урок «Запись в ячейку»: счётчик живёт в памяти, а не в переменной. */
export const STORE = {
    width: 12, height: 7, floor: 'sand',
    blocks: [
        {type: 'micro-processor', x: 2, y: 3},
        {type: 'memory-cell', x: 6, y: 4},
        {type: 'message', x: 9, y: 2}
    ],
    processors: [{
        at: [2, 3],
        links: ['cell1', 'message1'],
        program: [
            'read кругов cell1 0',
            'op add кругов кругов 1',
            'write кругов cell1 0',
            'print "кругов: "',
            'print кругов',
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
    width: 13, height: 7, floor: 'sand',
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
            'read предмет cell1 0',
            'read склад cell1 1',
            'sensor сколько склад предмет',
            'print предмет',
            'print ": "',
            'print сколько',
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
    width: 14, height: 8, floor: 'sand',
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
                'sensor медь container1 @copper',
                'write медь cell1 0'
            ].join('\n')
        },
        {
            at: [2, 2],
            links: ['cell1', 'message1'],
            program: [
                'read медь cell1 0',
                'print "на складе "',
                'print медь',
                'printflush message1'
            ].join('\n')
        }
    ]
}
