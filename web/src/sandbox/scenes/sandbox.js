/**
 * Сцена песочницы — теперь данными, а не кодом.
 *
 * Карта нарисована строками: первая строка — верхний ряд, как на экране. Раньше её выкладывал
 * шум `Simplex`, и это было красиво ровно до первого урока: подобрать частоту под нужную
 * картинку нельзя, а нарисовать — можно. Здесь та самая раскладка, снятая с шума один раз
 * и записанная как есть.
 *
 * Программы лежат текстом mlog — тем же, что в игре внутри процессора. Блоками их собирал
 * редактор, но блоки это его внутреннее дело: обратно текст читается `fromText`.
 */

export const SANDBOX = {
    width: 20,
    height: 11,
    floor: 'darksand',

    /*
     * Песочница и есть песочница: `Gamemode.sandbox` ставит `infiniteResources`, а вместе
     * с `instantBuild` блок встаёт сразу и ничего не стоит.
     */
    rules: {infiniteResources: true, instantBuild: true},

    terrain: {
        legend: {
            '.': {floor: 'darksand'},
            's': {floor: 'sand-floor'},
            '#': {floor: 'stone'},
            'o': {floor: 'darksand', ore: 'ore-copper'},
            'q': {floor: 'sand-floor', ore: 'ore-copper'},
            'O': {floor: 'stone', ore: 'ore-copper'},
            'W': {floor: 'stone', wall: 'stone-wall'}
        },
        rows: [
            'O#########.sssssssss',
            '##########..sss.....',
            '##.....###..ss......',
            '##.ss..###......####',
            '..sss.#####.....####',
            'WWsss.#O####..ss.###',
            'W..ss.######.sss.##W',
            'O#.....#####.ssq..WW',
            '#OO#..######.sqs....',
            '#OO#########..qs....',
            '.##########..sssssss'
        ]
    },

    blocks: [
        {type: 'logic-display', x: 15, y: 7},
        {type: 'memory-cell', x: 4, y: 3},
        {type: 'message', x: 7, y: 3},
        {type: 'switch', x: 4, y: 8},
        {type: 'door', x: 7, y: 8},

        // Рисующий процессор стоит у дисплея, считающий — у памяти и тумблера,
        // а пилот ни к чему не подключён: юнитам связи не нужны, их находит `ubind`
        {type: 'logic-processor', x: 11, y: 7},
        {type: 'micro-processor', x: 5, y: 5},
        {type: 'micro-processor', x: 1, y: 1},

        // Процессор мира: в игре его не поставить, он есть только в редакторе карт,
        // а инструкции мира работают лишь у него — `Block.privileged`
        {type: 'world-processor', x: 13, y: 1},

        // Контейнер, куда поли носит добытое: без него `ucontrol itemDrop` некуда целить
        {type: 'container', x: 17, y: 4},

        /*
         * Живая добыча: бур стоит на медной жиле, лента везёт добытое в тот же контейнер.
         * Это не украшение — на ней видно то, чего не покажет ни один текст: предметы едут
         * с задержкой, лента забивается, а `sensor @totalItems` растёт сам собой.
         */
        {type: 'mechanical-drill', x: 14, y: 1},
        {type: 'conveyor', x: 16, y: 1, rotation: 1},
        {type: 'conveyor', x: 16, y: 2, rotation: 1},
        {type: 'conveyor', x: 16, y: 3, rotation: 1},
        {type: 'conveyor', x: 16, y: 4, rotation: 0},

        // Ядро: по нему HUD показывает запасы команды, а цели читают предметы
        {type: 'core-shard', x: 2, y: 8, items: {copper: 1250, lead: 480, graphite: 95}}
    ],

    // Три юнита разных типов: `ubind` выбирает по типу, и один процессор водит всех.
    // Кинжал наземный и ходит ногами — на нём видно, что шаг считается по пройденному пути
    units: [
        {type: 'poly', x: 4, y: 1},
        {type: 'mono', x: 12, y: 9},
        {type: 'dagger', x: 10, y: 5}
    ],

    processors: [
        {
            at: [11, 7],
            links: ['display1', 'cell1'],
            program: [
                'read step cell1 0',
                'op mod x step 68',
                'draw clear 0 0 0 0 0 0',
                'draw color 255 210 120 255 0 0',
                'draw rect x 34 12 12 0 0',
                'drawflush display1'
            ].join('\n')
        },
        {
            at: [5, 5],
            links: ['cell1', 'message1', 'switch1', 'door1'],
            program: [
                'op add step step 1',
                'write step cell1 0',
                'sensor open switch1 @enabled',
                'control enabled door1 open 0 0 0',
                'print "step: "',
                'print step',
                'printflush message1'
            ].join('\n')
        },
        {
            at: [1, 1],
            links: ['container1'],

            // Поли копает ближайшую медь и несёт её в контейнер, моно и кинжал ходят
            // между двумя точками. `ucontrol move` повторяется каждый круг: без новых
            // команд юнит через 600 тиков уходит из-под контроля
            program: [
                'ubind @poly',
                'sensor cargo @unit @totalItems',
                'jump 7 greaterThanEq cargo 30',
                'ulocate ore core true @copper oreX oreY found building',
                'ucontrol move oreX oreY 0 0 0',
                'ucontrol mine oreX oreY 0 0 0',
                'jump 9 always x false',
                'ucontrol move 17 5 0 0 0',
                'ucontrol itemDrop container1 30 0 0 0',
                'op idiv phase @tick 240',
                'op mod phase phase 2',
                'op mul aim phase 13',
                'op add aim aim 3',
                'ubind @mono',
                'ucontrol move aim 9 0 0 0',
                'ubind @dagger',
                'ucontrol move aim 5 0 0 0'
            ].join('\n')
        },
        {
            at: [13, 1],
            links: ['container1'],

            // Метки заводятся один раз: без `replace` повторный круг их не пересоздаёт.
            // Последние три строки — единственный мостик от логики к целям карты
            program: [
                'makemarker shapetext 1 17 6 false',
                'print "store"',
                'setmarker flushText 1 0 0 0',
                'makemarker line 2 13 1 false',
                'setmarker endPos 2 17 4 0',
                'setmarker colori 2 0 %ffd37f 0',
                'setmarker colori 2 1 %84f491 0',
                'makemarker point 3 4 1 false',
                'ubind @poly',
                'sensor unitX @unit @x',
                'sensor unitY @unit @y',
                'op div unitX unitX 8',
                'op div unitY unitY 8',
                'setmarker pos 3 unitX unitY 0',
                'sensor copper container1 @copper',
                'jump 0 lessThan copper 10',
                'setflag "store" true'
            ].join('\n')
        }
    ],

    /*
     * Цели: первая выполнена с самого начала — поли на карте есть; вторая ждёт времени;
     * третья ждёт флага, который поднимает процессор мира. Текст у таймера и флага свой:
     * строки под них в игре нет, её задаёт карта, а `{0}` у таймера — остаток времени.
     */
    objectives: [
        {kind: 'unitCount', unit: 'poly', count: 1},
        {kind: 'timer', duration: 60 * 20, text: '[accent]Hold out: []{0}'},
        {
            kind: 'flag',
            flag: 'store',
            text: '[accent]Haul to the store: []10 copper',
            markers: [{type: 'shape', pos: [17, 4], radius: 14, shape: 6, color: '#84f491'}]
        }
    ]
}
