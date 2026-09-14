/**
 * Сцены примеров группы Draw.
 *
 * Дисплей в примере настоящий: команды копятся в буфере процессора, `drawflush` отдаёт их
 * блоку, а картинку на карте рисует тот же `DisplayView`, что и в песочнице.
 *
 * Дисплей везде большой — 176 точек: на мелком (80) не разглядеть ни фигур, ни текста.
 * Числа, которые уроки называют вслух, проверяет `web/test/course.test.js`.
 */

/** Общая карта: процессор слева, дисплей справа. */
const stand = (program, {type = 'micro-processor'} = {}) => ({
    width: 13, height: 9, floor: 'sand-floor',
    blocks: [
        {type, x: 1, y: 4},
        {type: 'large-logic-display', x: 7, y: 4}
    ],
    processors: [{
        at: [1, 4],
        links: ['display1'],
        program: program.join('\n')
    }]
})

/** Урок «Первый рисунок»: очистить, выбрать цвет, залить прямоугольник, отдать дисплею. */
export const FIRST = stand([
    'draw clear 40 40 50',
    'draw color 255 180 60 255',
    'draw rect 20 20 60 40',
    'drawflush display1',
    'stop'
])

/** Тот же урок: без `drawflush` дисплей остаётся пустым, сколько ни рисуй. */
export const FORGOTTEN = stand([
    'draw clear 40 40 50',
    'draw color 255 180 60 255',
    'draw rect 20 20 60 40',
    'stop'
])

/** Урок «Фигуры и линии»: все пять фигур разом, с толщиной линии. */
export const SHAPES = stand([
    'draw clear 20 20 30',
    'draw color 120 200 255 255',
    'draw rect 10 110 50 50',
    'draw lineRect 70 110 50 50',
    'draw stroke 4',
    'draw line 10 90 160 90',
    'draw color 255 180 60 255',
    'draw poly 32 45 6 26 0',
    'draw linePoly 88 45 3 26 0',
    'draw triangle 128 20 166 20 147 70',
    'drawflush display1',
    'stop'
])

/** Урок «Цвет и прозрачность»: три перекрытых квадрата с разной прозрачностью. */
export const COLORS = stand([
    'draw clear 30 30 40',
    'draw color 255 60 60 255',
    'draw rect 20 60 70 70',
    'draw color 60 255 120 128',
    'draw rect 55 90 70 70',
    'packcolor цвет 0.2 0.5 1 0.6',
    'draw col цвет',
    'draw rect 90 30 70 70',
    'drawflush display1',
    'stop'
])

/** Урок «Текст и картинки»: буфер печати уезжает на дисплей, рядом иконка предмета. */
export const TEXT = stand([
    'draw clear 20 25 35',
    'draw color 255 255 255 255',
    'print "Cu: "',
    'print 120',
    'draw print 20 140 @topLeft',
    'draw image 88 70 @copper 40 0',
    'drawflush display1',
    'stop'
])

/** Урок «Сдвиг, поворот, масштаб»: одна и та же фигура в трёх местах. */
export const TRANSFORM = stand([
    'draw clear 25 25 35',
    'draw color 255 180 60 255',
    'draw rect 0 0 40 40',
    'draw translate 88 88',
    'draw rotate 0 0 45',
    'draw rect 0 0 40 40',
    'draw reset',
    'draw color 120 200 255 255',
    'draw rect 136 136 40 40',
    'drawflush display1',
    'stop'
])

/**
 * Урок «Draw Flush»: команд ровно столько, сколько мест в буфере, — и двух клеток не хватает.
 *
 * Сетка 16 на 16 занимает дисплей целиком: 256 клеток при 176 точках стороны. Мест в буфере
 * тоже 256, но два из них уже заняты `clear` и `color`, поэтому последние две клетки
 * не рисуются. Пропажу видно глазом, и списать её на выход за край нельзя — вся сетка внутри.
 *
 * Процессор здесь гиперпроцессор: на микропроцессоре та же сетка рисовалась бы двадцать
 * секунд, и урок про предел буфера стал бы уроком про ожидание.
 */
export const OVERFLOW = stand([
    'draw clear 20 20 30',
    'draw color 255 180 60 255',
    'op mod столбец номер 16',
    'op idiv строка номер 16',
    'op mul x столбец 11',
    'op mul y строка 11',
    'draw rect x y 9 9',
    'op add номер номер 1',
    'jump 2 lessThan номер 256',
    'drawflush display1',
    'sensor команд display1 @bufferSize',
    'stop'
], {type: 'hyper-processor'})

/** Тот же урок: два дисплея, и каждому своя пачка команд. */
export const TWO = {
    width: 18, height: 9, floor: 'sand-floor',
    blocks: [
        {type: 'micro-processor', x: 1, y: 4},
        {type: 'large-logic-display', x: 5, y: 4},
        {type: 'large-logic-display', x: 12, y: 4}
    ],
    processors: [{
        at: [1, 4],
        links: ['display1', 'display2'],
        program: [
            'draw clear 60 30 30',
            'drawflush display1',
            'draw clear 30 60 30',
            'drawflush display2',
            'stop'
        ].join('\n')
    }]
}
