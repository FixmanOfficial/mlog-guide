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

/** Урок «Что стоит в клетке»: четыре слоя одной и той же карты. */
export const LAYERS = {
    width: 16, height: 10, floor: 'sand',
    terrain: [
        {floor: 'metal-floor', rect: [6, 4, 2, 2]},
        {floor: 'sand', ore: 'ore-copper', rect: [9, 4, 2, 2]},
        {wall: 'stone-wall', rect: [12, 4, 1, 2]}
    ],
    blocks: [
        {type: 'world-processor', x: 2, y: 7},
        {type: 'router', x: 6, y: 7}
    ],
    processors: [{
        at: [2, 7],
        links: [],
        program: [
            'getblock floor пол 6 4',
            'getblock ore руда 9 4',
            'getblock block стена 12 4',
            'getblock block блок 6 7',
            'getblock building здание 6 7',
            'getblock block пусто 14 2',
            'getblock ore безРуды 2 2',
            'stop'
        ].join('\n')
    }]
}

/** Урок «Поставить и снести»: три слоя ставятся и убираются. */
export const PAINT = {
    width: 16, height: 10, floor: 'sand',
    blocks: [
        {type: 'world-processor', x: 2, y: 7},
        {type: 'router', x: 12, y: 4}
    ],
    processors: [{
        at: [2, 7],
        links: [],
        program: [
            'setblock floor @metal-floor 6 4 @sharded 0',
            'setblock ore @ore-titanium 6 4 @sharded 0',
            'setblock block @copper-wall 8 4 @sharded 0',
            'setblock block @air 12 4 @sharded 0',
            'getblock floor пол 6 4',
            'getblock ore руда 6 4',
            'getblock block стена 8 4',
            'getblock block снесли 12 4',
            'stop'
        ].join('\n')
    }]
}

/** Тот же урок: дробные координаты усекаются у `setblock` и округляются у `getblock`. */
export const ROUNDING = {
    width: 14, height: 9, floor: 'sand',
    blocks: [{type: 'world-processor', x: 2, y: 6}],
    processors: [{
        at: [2, 6],
        links: [],
        program: [
            'setblock block @copper-wall 7.9 4.9 @sharded 0',
            'getblock block гдеПоставили 7 4',
            'getblock block поТемЖеЧислам 7.9 4.9',
            'stop'
        ].join('\n')
    }]
}
