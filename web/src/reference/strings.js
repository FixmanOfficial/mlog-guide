/**
 * Текст самих страниц справочника — тот, которого нет в игре: заголовки колонок, пометки,
 * подписи. Всё, что игра переводит сама, берётся из её бандлов и сюда не попадает.
 */

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
        blocksCount: (count) => `только у блоков: ${count}`,
        blocksOwn: (count) => `свой ответ у ${count} блоков`,
        seeProperties: 'Какие бывают свойства и у кого читаются — в таблице свойств sensor.',
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
        blocksCount: (count) => `blocks only: ${count}`,
        blocksOwn: (count) => `answered differently by ${count} blocks`,
        seeProperties: 'Which properties exist and what answers them — in the sensor property table.',
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
