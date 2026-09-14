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

/** Урок «Сообщение игроку»: объявление держится три секунды, а программа ждёт своей очереди. */
export const TALK = {
    width: 14, height: 9, floor: 'sand',
    blocks: [{type: 'world-processor', x: 2, y: 4}],
    processors: [{
        at: [2, 4],
        links: [],
        program: [
            'print "Держите оборону!"',
            'message announce 3 @wait',
            'op add показов показов 1',
            'end'
        ].join('\n')
    }]
}

/** Тот же урок: со своей переменной отказ виден сразу, и программа не ждёт. */
export const BUSY = {
    width: 14, height: 9, floor: 'sand',
    blocks: [{type: 'world-processor', x: 2, y: 4}],
    processors: [{
        at: [2, 4],
        links: [],
        program: [
            'print "Волна на подходе"',
            'message announce 5 первое',
            'print "И ещё одна"',
            'message announce 5 второе',
            'stop'
        ].join('\n')
    }]
}

/** Урок «Правила партии»: добыча вчетверо быстрее — правило видно на глаз. */
export const RULES = {
    width: 16, height: 10, floor: 'sand',
    terrain: [{floor: 'sand', ore: 'ore-copper', rect: [8, 4, 2, 2]}],
    blocks: [{type: 'world-processor', x: 2, y: 5}],
    units: [{type: 'mono', x: 8, y: 5}],
    processors: [{
        at: [2, 5],
        links: [],
        program: [
            'setrule unitMineSpeed 4 0 0 0 0',
            'ubind @mono',
            'ucontrol mine 8 4 0 0 0',
            'sensor груз @unit @totalItems'
        ].join('\n')
    }]
}

/** Тот же урок: правило `unitHealth` не поднимает здоровье, а делит урон. */
export const TOUGH = {
    width: 20, height: 10, floor: 'sand',
    blocks: [
        {type: 'world-processor', x: 2, y: 5},
        {type: 'duo', x: 16, y: 5, team: 2, ammo: {copper: 10}}
    ],
    units: [{type: 'flare', x: 10, y: 5}],
    processors: [{
        at: [2, 5],
        links: [],
        program: [
            'setrule unitHealth 4 0 0 0 0',
            'ubind @flare',
            'sensor здоровье @unit @health',
            'sensor предел @unit @maxHealth'
        ].join('\n')
    }]
}

/** Урок «Флаги партии»: два процессора говорят через флаг. */
export const FLAGS = {
    width: 16, height: 10, floor: 'sand',
    blocks: [
        {type: 'world-processor', x: 2, y: 7},
        {type: 'world-processor', x: 2, y: 3},
        {type: 'message', x: 12, y: 5}
    ],
    processors: [
        {
            at: [2, 7],
            links: ['message1'],
            program: [
                'getflag тревога "тревога"',
                'jump 4 equal тревога 0',
                'print "Тревога!"',
                'printflush message1',
                'op add проверок проверок 1',
                'end'
            ].join('\n')
        },
        {
            at: [2, 3],
            links: [],
            program: [
                'jump 3 lessThan @time 2000',
                'setflag "тревога" true',
                'set подняли 1',
                'end'
            ].join('\n')
        }
    ]
}

/** Урок «Свойства напрямую»: `setprop` правит здоровье, команду и запасы мимо всякой физики. */
export const PROPS = {
    width: 16, height: 10, floor: 'sand',
    blocks: [
        {type: 'world-processor', x: 2, y: 5},
        {type: 'container', x: 8, y: 5},
        {type: 'duo', x: 12, y: 5, ammo: {copper: 5}}
    ],
    units: [{type: 'dagger', x: 6, y: 8}],
    processors: [{
        at: [2, 5],
        links: ['container1', 'duo1'],
        program: [
            'setprop @health duo1 50',
            'setprop @copper container1 120',
            'ubind @dagger',
            'setprop @team @unit @crux',
            'sensor здоровьеТурели duo1 @health',
            'sensor медиНаСкладе container1 @copper',
            'sensor чейКинжал @unit @team',
            'stop'
        ].join('\n')
    }]
}
