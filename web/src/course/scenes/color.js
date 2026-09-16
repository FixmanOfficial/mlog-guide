/**
 * Сцены групп Pack Color и Unpack Color.
 *
 * Цвет в mlog бывает двух видов: четыре числа в `draw color` и одно упакованное число
 * в `draw col`. `packcolor` делает второе из первого, `unpackcolor` — обратно.
 *
 * Числа, которые уроки называют вслух, проверяет `web/test/course.test.js`.
 */

/** Общая карта: процессор, дисплей и табло. */
const stand = (program) => ({
    width: 15, height: 9, floor: 'sand-floor',
    blocks: [
        {type: 'micro-processor', x: 1, y: 4},
        {type: 'large-logic-display', x: 6, y: 4},
        {type: 'message', x: 12, y: 4}
    ],
    processors: [{
        at: [1, 4],
        links: ['display1', 'message1'],
        program: program.join('\n')
    }]
})

/** Урок «Цвет одним числом»: каналы в долях, готовый цвет в переменной. */
export const PACK = stand([
    'packcolor red 1 0 0 1',
    'packcolor blue 0 0.6 1 0.5',
    'draw clear 30 30 40',
    'draw col red',
    'draw rect 20 40 70 70',
    'draw col blue',
    'draw rect 60 70 70 70',
    'drawflush display1',
    'print red',
    'printflush message1',
    'stop'
])

/** Тот же урок: цвет как обычное число — его можно хранить и выбирать. */
export const CHOICE = stand([
    'packcolor alarm 1 0.2 0.2 1',
    'packcolor calm 0.2 1 0.4 1',
    'set stock 30',
    'select colour lessThan stock 50 alarm calm',
    'draw clear 20 20 25',
    'draw col colour',
    'draw rect 38 38 100 100',
    'drawflush display1',
    'stop'
])

/** Урок «Разбор цвета»: цвет предмета в каналы. */
export const UNPACK = stand([
    'sensor colour @copper @color',
    'unpackcolor R G B A colour',
    'op mul R R 255',
    'op mul G G 255',
    'op mul B B 255',
    'op floor R R',
    'op floor G G',
    'op floor B B',
    'print "copper colour: "',
    'print R',
    'print " "',
    'print G',
    'print " "',
    'print B',
    'printflush message1',
    'stop'
])
