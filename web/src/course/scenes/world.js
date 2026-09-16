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
    width: 16, height: 10, floor: 'sand-floor',
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
                'getblock block placed 8 7',
                'set speed @ipt',
                'stop'
            ].join('\n')
        },
        {
            at: [2, 2],
            links: [],
            program: [
                'setblock block @router 8 2 @sharded 0',
                'set speed @ipt',
                'stop'
            ].join('\n')
        }
    ]
}

/** Тот же урок: предел скорости у мирового процессора — тысяча инструкций за тик. */
export const FAST = {
    width: 12, height: 8, floor: 'sand-floor',
    blocks: [{type: 'world-processor', x: 2, y: 4}],
    processors: [{
        at: [2, 4],
        links: [],
        program: [
            'set plain @ipt',
            'setrate 1000',
            'set boosted @ipt',
            'stop'
        ].join('\n')
    }]
}

/** Урок «Что стоит в клетке»: четыре слоя одной и той же карты. */
export const LAYERS = {
    width: 16, height: 10, floor: 'sand-floor',
    terrain: [
        {floor: 'metal-floor', rect: [6, 4, 2, 2]},
        {floor: 'sand-floor', ore: 'ore-copper', rect: [9, 4, 2, 2]},
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
            'getblock floor floor 6 4',
            'getblock ore ore 9 4',
            'getblock block wall 12 4',
            'getblock block block 6 7',
            'getblock building building 6 7',
            'getblock block empty 14 2',
            'getblock ore noOre 2 2',
            'stop'
        ].join('\n')
    }]
}

/** Урок «Поставить и снести»: три слоя ставятся и убираются. */
export const PAINT = {
    width: 16, height: 10, floor: 'sand-floor',
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
            'getblock floor floor 6 4',
            'getblock ore ore 6 4',
            'getblock block wall 8 4',
            'getblock block removed 12 4',
            'stop'
        ].join('\n')
    }]
}

/** Тот же урок: дробные координаты усекаются у `setblock` и округляются у `getblock`. */
export const ROUNDING = {
    width: 14, height: 9, floor: 'sand-floor',
    blocks: [{type: 'world-processor', x: 2, y: 6}],
    processors: [{
        at: [2, 6],
        links: [],
        program: [
            'setblock block @copper-wall 7.9 4.9 @sharded 0',
            'getblock block wherePlaced 7 4',
            'getblock block sameNumbers 7.9 4.9',
            'stop'
        ].join('\n')
    }]
}

/** Урок «Сообщение игроку»: объявление держится три секунды, а программа ждёт своей очереди. */
export const TALK = {
    width: 14, height: 9, floor: 'sand-floor',
    blocks: [{type: 'world-processor', x: 2, y: 4}],
    processors: [{
        at: [2, 4],
        links: [],
        program: [
            'print "Hold the line!"',
            'message announce 3 @wait',
            'op add frames frames 1',
            'end'
        ].join('\n')
    }]
}

/** Тот же урок: со своей переменной отказ виден сразу, и программа не ждёт. */
export const BUSY = {
    width: 14, height: 9, floor: 'sand-floor',
    blocks: [{type: 'world-processor', x: 2, y: 4}],
    processors: [{
        at: [2, 4],
        links: [],
        program: [
            'print "Wave incoming"',
            'message announce 5 firstText',
            'print "And one more"',
            'message announce 5 secondText',
            'stop'
        ].join('\n')
    }]
}

/** Урок «Правила игры»: добыча вчетверо быстрее — правило видно на глаз. */
export const RULES = {
    width: 16, height: 10, floor: 'sand-floor',
    terrain: [{floor: 'sand-floor', ore: 'ore-copper', rect: [8, 4, 2, 2]}],
    blocks: [{type: 'world-processor', x: 2, y: 5}],
    units: [{type: 'mono', x: 8, y: 5}],
    processors: [{
        at: [2, 5],
        links: [],
        program: [
            'setrule unitMineSpeed 4 @sharded 0 0 0',
            'ubind @mono',
            'ucontrol mine 8 4 0 0 0',
            'sensor cargo @unit @totalItems'
        ].join('\n')
    }]
}

/** Тот же урок: правило `unitHealth` не поднимает здоровье, а делит урон. */
export const TOUGH = {
    width: 20, height: 10, floor: 'sand-floor',
    blocks: [
        {type: 'world-processor', x: 2, y: 5},
        {type: 'duo', x: 16, y: 5, team: 2, ammo: {copper: 10}}
    ],
    units: [{type: 'flare', x: 10, y: 5}],
    processors: [{
        at: [2, 5],
        links: [],
        program: [
            'setrule unitHealth 4 @sharded 0 0 0',
            'ubind @flare',
            'sensor health @unit @health',
            'sensor limit @unit @maxHealth'
        ].join('\n')
    }]
}

/** Урок «Глобальные флаги»: два процессора говорят через флаг. */
export const FLAGS = {
    width: 16, height: 10, floor: 'sand-floor',
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
                'getflag alarm "alarm"',
                'jump 4 equal alarm 0',
                'print "Alarm!"',
                'printflush message1',
                'op add checks checks 1',
                'end'
            ].join('\n')
        },
        {
            at: [2, 3],
            links: [],
            program: [
                'jump 3 lessThan @time 2000',
                'setflag "alarm" true',
                'set lifted 1',
                'end'
            ].join('\n')
        }
    ]
}

/** Урок «Свойства напрямую»: `setprop` правит здоровье, команду и запасы мимо всякой физики. */
export const PROPS = {
    width: 16, height: 10, floor: 'sand-floor',
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
            'sensor turretHealth duo1 @health',
            'sensor copperInStore container1 @copper',
            'sensor whoseDagger @unit @team',
            'stop'
        ].join('\n')
    }]
}

/** Урок «Всё, что есть у команды»: перебор юнитов и зданий через `fetch`. */
export const FETCH = {
    width: 18, height: 11, floor: 'sand-floor',
    blocks: [
        {type: 'world-processor', x: 2, y: 5},
        {type: 'core-shard', x: 7, y: 5, items: {copper: 200}},
        {type: 'duo', x: 12, y: 7, ammo: {copper: 10}},
        {type: 'duo', x: 12, y: 3, ammo: {copper: 10}}
    ],
    units: [
        {type: 'poly', x: 10, y: 9},
        {type: 'poly', x: 14, y: 9},
        {type: 'dagger', x: 15, y: 2, team: 2}
    ],
    processors: [{
        at: [2, 5],
        links: [],
        program: [
            'fetch unitCount ourUnits @sharded 0 0',
            'fetch buildCount ourBuildings @sharded 0 0',
            'fetch buildCount turrets @sharded 0 @duo',
            'fetch unitCount theirUnits @crux 0 0',
            'fetch core core @sharded 0 0',
            'sensor copperInCore core @copper',
            'fetch unit firstUnit @sharded 0 0',
            'sensor firstKind firstUnit @type',
            'stop'
        ].join('\n')
    }]
}

/** Урок «Взрыв»: удар по площади там, где никакой турели нет. */
export const BOOM = {
    width: 18, height: 11, floor: 'sand-floor',
    blocks: [{type: 'world-processor', x: 2, y: 5}],
    units: [
        {type: 'dagger', x: 10, y: 5, team: 2},
        {type: 'dagger', x: 15, y: 9, team: 2}
    ],
    processors: [{
        at: [2, 5],
        links: [],
        program: [
            'jump 3 notEqual blown 0',
            'explosion @sharded 10 5 3 200 1 1 0 0',
            'set blown 1',
            'fetch unitCount enemies @crux 0 0',
            'stop'
        ].join('\n')
    }]
}

/** Урок «Метки на карте»: три метки разных видов появляются и живут своей жизнью. */
export const MARKERS = {
    width: 18, height: 11, floor: 'sand-floor',
    blocks: [{type: 'world-processor', x: 2, y: 5}],
    processors: [{
        at: [2, 5],
        links: [],
        program: [
            'jump 9 notEqual wasPlaced 0',
            'makemarker shape 1 8 7 1',
            'setmarker color 1 %ff5555 0 0',
            'setmarker radius 1 20 0 0',
            'makemarker text 2 8 3 1',
            'print "Build here"',
            'setmarker flushText 2 0 0 0',
            'makemarker line 3 4 5 1',
            'set wasPlaced 1',
            'setmarker rotation 1 @time 0 0'
        ].join('\n')
    }]
}

/** Урок «Текст по ключу»: словарь карты вместо строк в программе. */
export const LOCALE = {
    width: 16, height: 9, floor: 'sand-floor',
    locales: {
        'task.drill': 'Build a drill',
        'task.done': 'Task complete'
    },
    blocks: [
        {type: 'world-processor', x: 2, y: 4},
        {type: 'message', x: 11, y: 4}
    ],
    processors: [{
        at: [2, 4],
        links: ['message1'],
        program: [
            'localeprint "task.drill"',
            'print " — "',
            'localeprint "task.nothing"',
            'print "?"',
            'printflush message1',
            'stop'
        ].join('\n')
    }]
}

/** Урок «Погода»: мировой включает дождь через две секунды и сам же его видит. */
export const WEATHER = {
    width: 16, height: 10, floor: 'sand-floor',
    blocks: [
        {type: 'world-processor', x: 2, y: 5},
        {type: 'message', x: 11, y: 5}
    ],
    processors: [{
        at: [2, 5],
        links: ['message1'],
        program: [
            'jump 3 lessThan @second 2',
            'weatherset @rain true',
            'set switched 1',
            'weathersense @rain rain',
            'weathersense @sandstorm storm',
            'print "rain: "',
            'print rain',
            'printflush message1'
        ].join('\n')
    }]
}

/** Урок «Пуля из ниоткуда»: выстрел без турели, раз в секунду. */
export const SHOT = {
    width: 20, height: 11, floor: 'sand-floor',
    blocks: [{type: 'world-processor', x: 2, y: 5}],
    units: [{type: 'dagger', x: 14, y: 5, team: 2}],
    processors: [{
        at: [2, 5],
        links: [],
        program: [
            'jump 5 lessThan @second deadline',
            'op add deadline @second 1',
            'bullet shot @duo @graphite 5 5 0 @sharded null -1 1 1 0 0',
            'op add shots shots 1',
            'end'
        ].join('\n')
    }]
}
