/**
 * Сцены части «Мировой процессор».
 *
 * Мировой процессор в песочнице настоящий: у него свои привилегии, своя дальность
 * и свой предел скорости. Обычный процессор рядом — чтобы разница была видна, а не
 * рассказана словами.
 *
 * Числа, которые уроки называют вслух, проверяет `web/test/course.test.js`.
 */

/** Урок «Что это такое»: мировой ставит блок, обычный — нет. */
export const PRIVILEGE = {
    width: 16, height: 10, floor: 'sand',
    blocks: [
        {type: 'world-processor', x: 2, y: 7},
        {type: 'micro-processor', x: 2, y: 2}
    ],
    processors: [
        {
            at: [2, 7],
            links: [],
            program: [
                'setblock block @router 8 7 @sharded 0',
                'getblock block поставил 8 7',
                'set скорость @ipt',
                'stop'
            ].join('\n')
        },
        {
            at: [2, 2],
            links: [],
            program: [
                'setblock block @router 8 2 @sharded 0',
                'set скорость @ipt',
                'stop'
            ].join('\n')
        }
    ]
}

/** Тот же урок: предел скорости у мирового процессора — тысяча инструкций за тик. */
export const FAST = {
    width: 12, height: 8, floor: 'sand',
    blocks: [{type: 'world-processor', x: 2, y: 4}],
    processors: [{
        at: [2, 4],
        links: [],
        program: [
            'set обычная @ipt',
            'setrate 1000',
            'set разогнанная @ipt',
            'stop'
        ].join('\n')
    }]
}
