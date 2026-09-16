/**
 * Надписи песочницы.
 *
 * Игровых среди них почти нет: в Mindustry песочницы с перемоткой и подсветкой строки не
 * существует вовсе, и кнопки эти наши. Те, что игра всё-таки пишет сама, — «Переменные»,
 * «Встроенные переменные», «Назад» — берутся из её бандлов через `uiText` редактора,
 * а не отсюда.
 *
 * Язык приходит со страницы: `/ru/` и `/en/` собираются одним и тем же островом.
 */

import {uiLocale} from '@mlog/editor/src/names.js'

const SANDBOX = {
    ru: {
        reset: 'Сбросить мир',
        restore: 'Вернуть исходные программы',
        backSecond: 'Назад на секунду',
        backTick: 'Назад на тик',
        pause: 'Пауза',
        play: 'Пуск',
        forwardTick: 'Вперёд на тик',
        forwardSecond: 'Вперёд на секунду',
        instruction: 'инструкция',
        hide: 'Скрыть интерфейс (C)',
        show: 'Показать интерфейс (C)',
        localizeTitle: 'Надписи в блоках как в игре: с переводом или по-английски',
        localize: 'перевод',
        highlightTitle: 'Подсвечивать строку, которую процессор выполнит следующей',
        highlight: 'подсветка',
        speed: 'Скорость времени',
        editMessage: 'Править сообщение',
        viewMemory: 'Посмотреть память',
        editProgram: 'Править программу',
        hint: 'Щёлкните по процессору, чтобы открыть его программу; по тумблеру — чтобы '
            + 'переключить его.',
        display: 'Дисплей',
        message: 'Блок сообщений',
        tick: 'тик',
        line: 'строка',
        breaking: 'Снос',
        rightButton: 'правая кнопка',
        blockHelp: 'Справочник блока появится вместе со справочником'
    },
    en: {
        reset: 'Reset the world',
        restore: 'Bring back the original programs',
        backSecond: 'Back a second',
        backTick: 'Back a tick',
        pause: 'Pause',
        play: 'Run',
        forwardTick: 'Forward a tick',
        forwardSecond: 'Forward a second',
        instruction: 'instruction',
        hide: 'Hide the interface (C)',
        show: 'Show the interface (C)',
        localizeTitle: 'Labels in the blocks as in the game: translated or in English',
        localize: 'labels',
        highlightTitle: 'Highlight the line the processor will run next',
        highlight: 'highlight',
        speed: 'The speed of time',
        editMessage: 'Edit the message',
        viewMemory: 'Look at the memory',
        editProgram: 'Edit the program',
        hint: 'Click a processor to open its program; click the switch to toggle it.',
        display: 'Display',
        message: 'Message block',
        tick: 'tick',
        line: 'line',
        breaking: 'Break',
        rightButton: 'right button',
        blockHelp: 'A block reference will arrive together with the reference section'
    }
}

/**
 * Набор надписей на языке страницы.
 *
 * Без довода язык берётся оттуда же, откуда его берёт редактор, — из подключённого набора
 * текстов. Так надписи находят вложенные куски вроде панели строительства, которым пропа
 * не докинуть, не протащив его через полдесятка узлов.
 */
export const strings = (locale = uiLocale()) => SANDBOX[locale] ?? SANDBOX.ru
