/**
 * Сцены примеров группы Control — управление соседними блоками.
 *
 * Управлять можно только связанными блоками: `ControlI` проверяет связь, и здание, добытое
 * мимо неё, команды не принимает. Поэтому во всех сценах цель стоит в списке связей.
 *
 * Числа, которые уроки называют вслух, проверяет `web/test/course.test.js`.
 */

/** Урок «Включить и выключить»: бур работает, пока на складе мало меди. */
export const ENABLED = {
    width: 14, height: 9, floor: 'sand',
    terrain: [{floor: 'sand', ore: 'ore-copper', rect: [3, 2, 4, 4]}],
    blocks: [
        {type: 'micro-processor', x: 1, y: 6},
        {type: 'mechanical-drill', x: 4, y: 3},
        {type: 'container', x: 9, y: 3, items: {copper: 60}}
    ],
    processors: [{
        at: [1, 6],
        links: ['drill1', 'container1'],
        program: [
            'sensor медь container1 @copper',
            'op lessThan мало медь 100',
            'control enabled drill1 мало',
            'sensor работает drill1 @enabled'
        ].join('\n')
    }]
}

/** Урок «Настройка блока»: сортировщику назначают предмет. */
export const CONFIG = {
    width: 14, height: 9, floor: 'sand',
    blocks: [
        {type: 'micro-processor', x: 1, y: 6},
        {type: 'sorter', x: 6, y: 4},
        {type: 'container', x: 10, y: 3, items: {copper: 40, lead: 25}}
    ],
    processors: [{
        at: [1, 6],
        links: ['sorter1', 'container1'],
        program: [
            'sensor меди container1 @copper',
            'sensor свинца container1 @lead',
            'select предмет lessThan меди свинца @copper @lead',
            'control config sorter1 предмет',
            'sensor настройка sorter1 @config'
        ].join('\n')
    }]
}

/**
 * Тот же урок: командовать можно только связанным блоком.
 *
 * Второй бур подключён к соседнему процессору, и наш достаёт его оттуда — по имени связи
 * соседа. Здание настоящее, `sensor` его читает, а вот `control` до него не доходит:
 * связи с ним у нас нет.
 */
export const UNLINKED = {
    width: 16, height: 9, floor: 'sand',
    terrain: [{floor: 'sand', ore: 'ore-copper', rect: [3, 2, 8, 4]}],
    blocks: [
        {type: 'micro-processor', x: 1, y: 6},
        {type: 'micro-processor', x: 1, y: 2},
        {type: 'mechanical-drill', x: 4, y: 3},
        {type: 'mechanical-drill', x: 8, y: 3}
    ],
    processors: [
        {
            at: [1, 6],
            links: ['processor2', 'drill1'],
            program: [
                'read чужой processor2 "drill2"',
                'control enabled drill1 0',
                'control enabled чужой 0',
                'sensor свойРаботает drill1 @enabled',
                'sensor чужойРаботает чужой @enabled'
            ].join('\n')
        },
        {
            at: [1, 2],
            links: ['drill2'],
            program: 'stop'
        }
    ]
}

/**
 * Урок «Стрельба»: турель под управлением логики.
 *
 * Дуо заряжено медью и связано с процессором; враг стоит справа. Команда логики уводит турель
 * из-под собственного прицела на две секунды — ровно столько живёт `logicControlTime`.
 */
export const SHOOT = {
    width: 18, height: 9, floor: 'sand',
    blocks: [
        {type: 'micro-processor', x: 1, y: 4},
        {type: 'duo', x: 5, y: 4, ammo: {copper: 10}},
        {type: 'container', x: 5, y: 1, items: {copper: 40}}
    ],
    units: [{type: 'dagger', x: 13, y: 4, team: 2}],
    processors: [{
        at: [1, 4],
        links: ['duo1', 'container1'],
        program: [
            'control shoot duo1 13 4 1',
            'sensor стреляет duo1 @shooting',
            'sensor патронов duo1 @ammo',
            'sensor поворот duo1 @rotation'
        ].join('\n')
    }]
}

/** Тот же урок: стрельба по юниту с упреждением. */
export const SHOOTP = {
    width: 18, height: 9, floor: 'sand',
    blocks: [
        {type: 'micro-processor', x: 1, y: 4},
        {type: 'duo', x: 5, y: 4, ammo: {copper: 10}}
    ],
    units: [{type: 'flare', x: 13, y: 7, team: 2}],
    processors: [{
        at: [1, 4],
        links: ['duo1'],
        program: [
            'radar enemy any any distance duo1 1 цель',
            'control shootp duo1 цель 1',
            'sensor стреляет duo1 @shooting',
            'sensor патронов duo1 @ammo'
        ].join('\n')
    }]
}

