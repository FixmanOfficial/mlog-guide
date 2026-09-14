/**
 * Текст самих страниц справочника — тот, которого нет в игре: заголовки колонок, пометки,
 * подписи. Всё, что игра переводит сама, берётся из её бандлов и сюда не попадает.
 */

/**
 * «У 1 блока», но «у 9 блоков». В косвенном падеже с числительным существительное идёт
 * в родительном: единственного числа при единице и множественного при всём остальном.
 * Одиннадцать — исключение из правила про единицу, как и сто одиннадцать.
 */
const blocks = (count) => count % 10 === 1 && count % 100 !== 11 ? 'блока' : 'блоков'

export const STRINGS = {
    ru: {
        instructions: 'Инструкции',
        instructionsIntro: 'Все инструкции языка, как они называются в игре. '
            + 'Описания — официальные, из бандлов Mindustry',
        properties: 'Свойства',
        propertiesTitle: 'Свойства sensor',
        syntax: 'Как пишется',
        params: 'Параметры',
        param: 'Параметр',
        type: 'Тип',
        byDefault: 'По умолчанию',
        values: 'Значения',
        value: 'значение',
        category: 'Категория',
        worldOnly: 'только процессор мира',
        processorOnly: 'только обычный процессор',
        hidden: 'нет в меню',
        notImplemented: 'песочница не исполняет',
        noDescription: 'В игре описания нет.',
        property: 'Свойство',
        reads: 'Читается у',
        writes: 'Пишется',
        returns: 'Отдаёт',
        number: 'число',
        object: 'объект',
        blocksOnly: 'только у блоков:',
        andMore: (count) => `и ещё ${count}`,
        settable: 'setprop',
        source: 'Источник',
        sourceNote: (version) => `Данные сняты из Mindustry ${version} генераторами проекта.`,
        backToList: 'Все инструкции',
        controlled: 'Коды @controlled',
        propertiesIntro: 'Что спрашивает sensor и кому это можно записать. Игра отвечает '
            + 'на свойство не всегда: у типа блока, здания, юнита и предмета отвечают разные '
            + 'части кода, и таблица показывает, какие именно',
        description: 'Описание',
        variables: 'Переменные',
        variablesIntro: 'Всё, что процессор знает без спроса: константы, время, размеры карты. '
            + 'Список и описания — из самой игры, из окна «Переменные»',
        processorVars: 'Переменные процессора',
        processorVarsNote: 'В окне игры их нет: они заводятся не в общем списке, '
            + 'а в самом процессоре.',
        blocksCount: (count) => `только у ${count} ${blocks(count)}`,
        blocksOwn: (count) => `свой ответ у ${count} ${blocks(count)}`,
        seeProperties: 'Какие бывают свойства и у кого читаются — в таблице свойств sensor.',
        rules: 'Правила игры',
        rulesTitle: 'Правила игры',
        rulesIntro: 'Что меняет setrule и как это правило принимает значение: числом, '
            + 'выключателем, контентом или областью. Десяти множителям нужна ещё и команда '
            + 'в третьем поле — без неё строка не делает ничего',
        rule: 'Правило',
        takes: 'Как принимает',
        ofTeam: 'нужна команда',
        wholeOnly: 'только целое',
        atLeast: (value) => `не меньше ${value}`,
        between: (from, to) => `от ${from} до ${to}`,
        ruleKinds: {
            number: 'число',
            flag: 'да/нет',
            content: 'блок или юнит',
            area: 'четыре числа'
        },
        scales: {
            seconds: 'в секундах',
            tiles: 'в клетках'
        },
        statuses: 'Эффекты',
        statusesTitle: 'Эффекты состояния',
        statusesIntro: 'Всё, что накладывает инструкция status: сколько жжёт, что замедляет '
            + 'и что держится насовсем. Числа сняты из самой игры — списком она их нигде '
            + 'не показывает',
        effect: 'Эффект',
        damagePerSecond: 'Урон в секунду',
        changes: 'Что меняет',
        endless: 'без предела',
        permanent: 'держится насовсем',
        disarm: 'не даёт стрелять',
        everySeconds: (amount, seconds) => `${amount} урона раз в ${seconds} с`,
        heals: (amount) => `лечит ${amount}`,
        reactive: 'status его не наложит: только реакцией',
        factors: {
            speed: 'скорость',
            health: 'живучесть',
            damage: 'урон',
            reload: 'перезарядка',
            build: 'стройка',
            drag: 'трение'
        },
        noValue: 'null',
        holders: {
            block: 'тип блока',
            building: 'здание',
            unitType: 'тип юнита',
            unit: 'юнит',
            item: 'предмет',
            liquid: 'жидкость',
            team: 'команда',
            bullet: 'пуля'
        }
    },
    en: {
        instructions: 'Instructions',
        instructionsIntro: 'Every instruction of the language, named as in the game. '
            + 'Descriptions are official, from the Mindustry bundles',
        properties: 'Properties',
        propertiesTitle: 'Sensor properties',
        syntax: 'Syntax',
        params: 'Parameters',
        param: 'Parameter',
        type: 'Type',
        byDefault: 'Default',
        values: 'Values',
        value: 'value',
        category: 'Category',
        worldOnly: 'world processor only',
        processorOnly: 'ordinary processor only',
        hidden: 'not in the menu',
        notImplemented: 'the sandbox does not run it',
        noDescription: 'The game gives no description.',
        property: 'Property',
        reads: 'Read from',
        writes: 'Written to',
        returns: 'Returns',
        number: 'number',
        object: 'object',
        blocksOnly: 'only on blocks:',
        andMore: (count) => `and ${count} more`,
        settable: 'setprop',
        source: 'Source',
        sourceNote: (version) => `Data taken from Mindustry ${version} by the project generators.`,
        backToList: 'All instructions',
        controlled: '@controlled codes',
        propertiesIntro: 'What sensor asks for, and what setprop can write back. The game '
            + 'does not always answer: a block type, a building, a unit and an item are handled '
            + 'by different code, and the table shows which',
        description: 'Description',
        variables: 'Variables',
        variablesIntro: 'Everything a processor knows without asking: constants, time, map size. '
            + 'The list and the descriptions come from the game itself',
        processorVars: 'Processor variables',
        processorVarsNote: 'The in-game window does not list them: they live in the processor, '
            + 'not in the global list.',
        blocksCount: (count) => `only on ${count} block${count === 1 ? '' : 's'}`,
        blocksOwn: (count) => `answered differently by ${count} block${count === 1 ? '' : 's'}`,
        seeProperties: 'Which properties exist and what answers them — in the sensor property table.',
        rules: 'Game rules',
        rulesTitle: 'Game rules',
        rulesIntro: 'What setrule changes and how each rule takes its value: a number, '
            + 'a switch, a content item or an area. Ten multipliers also need a team in the '
            + 'third field — without it the line does nothing',
        rule: 'Rule',
        takes: 'Takes',
        ofTeam: 'needs a team',
        wholeOnly: 'whole numbers only',
        atLeast: (value) => `at least ${value}`,
        between: (from, to) => `from ${from} to ${to}`,
        ruleKinds: {
            number: 'number',
            flag: 'on/off',
            content: 'block or unit',
            area: 'four numbers'
        },
        scales: {
            seconds: 'in seconds',
            tiles: 'in tiles'
        },
        statuses: 'Status effects',
        statusesTitle: 'Status effects',
        statusesIntro: 'Everything the status instruction can apply: what burns, what slows '
            + 'down and what stays forever. The numbers come from the game itself — it never '
            + 'shows them as a list',
        effect: 'Effect',
        damagePerSecond: 'Damage per second',
        changes: 'What it changes',
        endless: 'no limit',
        permanent: 'stays forever',
        disarm: 'cannot shoot',
        everySeconds: (amount, seconds) => `${amount} damage every ${seconds}s`,
        heals: (amount) => `heals ${amount}`,
        reactive: 'status cannot apply it: only as a reaction',
        factors: {
            speed: 'speed',
            health: 'health',
            damage: 'damage',
            reload: 'reload',
            build: 'build speed',
            drag: 'drag'
        },
        noValue: 'null',
        holders: {
            block: 'block type',
            building: 'building',
            unitType: 'unit type',
            unit: 'unit',
            item: 'item',
            liquid: 'liquid',
            team: 'team',
            bullet: 'bullet'
        }
    }
}

export const strings = (locale) => STRINGS[locale] ?? STRINGS.en

/**
 * Корень справочника. Адрес одинаков у обоих языков — этого требует боковое меню
 * Starlight: там ссылка одна на все локали, а язык подставляется в начало пути.
 */
export const root = (locale) => `/${locale}/reference`
