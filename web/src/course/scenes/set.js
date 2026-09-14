/**
 * Сцены примеров группы `set`.
 *
 * Числа, которые урок называет вслух, проверяет `web/test/course.test.js`: пример и текст
 * расходятся молча, и заметить это можно только тестом.
 */

/** Урок «Присваивание и копирование»: копия не следит за оригиналом. */
export const ASSIGN = {
    width: 7, height: 5, floor: 'sand-floor',
    blocks: [{type: 'micro-processor', x: 3, y: 2}],
    processors: [{
        at: [3, 2],
        links: [],
        program: [
            'set запас 5',
            'set текст "медь"',
            'set копия запас',
            'set запас 99'
        ].join('\n')
    }]
}

/**
 * Урок «Константы контента»: предмет, блок и юнит лежат в переменных, а `@this` — сам
 * процессор. Последняя строка спрашивает у контейнера медь, но имя свойства берёт
 * из переменной: для `sensor` нет разницы, откуда пришёл `@copper`.
 */
export const CONTENT = {
    width: 11, height: 6, floor: 'sand-floor',
    blocks: [
        {type: 'micro-processor', x: 2, y: 2},
        {type: 'container', x: 7, y: 3, items: {copper: 120, lead: 40}}
    ],
    processors: [{
        at: [2, 2],
        links: ['container1'],
        program: [
            'set предмет @copper',
            'set блок @router',
            'set юнит @poly',
            'set сам @this',
            'sensor сколько container1 предмет'
        ].join('\n')
    }]
}
