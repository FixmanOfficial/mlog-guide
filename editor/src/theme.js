import metrics from '@mlog/core/data/metrics.json' with {type: 'json'}
import schema from '@mlog/core/data/instructions.json' with {type: 'json'}
import pal from '@mlog/core/data/pal.json' with {type: 'json'}

/**
 * Внешний вид редактора, снятый из игры.
 *
 * Цвета — graphics/Pal.java:59,124-129. Размеры — logic/LCanvas.java:418-500.
 * Менять эти числа «на глаз» нельзя: редактор должен быть узнаваем игроком с первого взгляда.
 */

/**
 * LCategory: цвет категории задаёт цвет всей строки инструкции. Пары «категория — имя
 * цвета в `Pal`» снимает `gen-instructions.mjs`, сами цвета — `gen-pal.mjs`: держать
 * значение в двух местах значит однажды их разойтись.
 */
export const CATEGORY_COLORS = Object.fromEntries(Object.entries(schema.categories)
    .map(([name, category]) => [name, pal.colors[category.color]]))

/**
 * Размеры интерфейса при масштабе 1. Снимает `tools/gen-metrics.mjs` прямо из исходников:
 * в Java это литералы вида `height(38)`, `t.margin(6f)`, `.size(24f).padRight(6)`.
 *
 * Раньше числа переносились глазами сразу в три места — сюда, в раскладки и в CSS. Теперь
 * место одно, а при обновлении версии игры генератор падает, если шаблон перестал совпадать.
 */
export const METRICS = metrics.metrics

/**
 * Стрелки переходов белые, а не в цвет категории: JumpButton ставит себе Color.white
 * и переключается на Pal.place при наведении. LCanvas.java:598, Pal.java:85
 */
export const JUMP_COLOR = '#ffffff'
export const JUMP_HOVER_COLOR = '#6335f8'

/**
 * Обводка текста и рамок. В игре это не чёрный, а darkGray — Color.darkGray из arc,
 * ширина 2. Fonts.java:249,266
 */
export const OUTLINE_COLOR = '#3f3f3f'
export const OUTLINE_WIDTH = 2

/** Порядок категорий в меню добавления — порядок объявления в `LCategory.all`. */
export const CATEGORY_ORDER = Object.keys(schema.categories)

/**
 * Значок категории. В игре это `Icon.logicSmall` и подобные — тот же глиф шрифта иконок,
 * что и `logic`, только меньшего размера, поэтому суффикс отбрасывается.
 */
export const CATEGORY_ICONS = Object.fromEntries(Object.entries(schema.categories)
    .map(([name, category]) => [name, category.icon?.replace(/Small$/, '') ?? null]))

export const categoryColor = (category) => CATEGORY_COLORS[category] ?? CATEGORY_COLORS.unknown

/**
 * Цвет имени инструкции и номера строки в шапке — ровно тот же, что у фона.
 *
 * Выглядит бессмысленно, но так и есть: `t.add(st.name()).color(color)` ставит метке цвет
 * категории, а шапка под ней залита им же. `Label.draw` в arc берёт от родителя только альфу,
 * цвета не перемножаются, поэтому текст сливался бы с фоном — читаемым его делает
 * исключительно тёмная обводка шрифта `Styles.outlineLabel`. Отсюда и «вырезанный» вид.
 *
 * LCanvas.java:428,434,437, arc/scene/ui/Label.java
 */
export const headerTextColor = (category) => categoryColor(category)

/** Кнопки строки чёрные: Styles.logici задаёт imageUpColor = Color.black. */
export const BUTTON_COLOR = '#000000'

/**
 * Имя инструкции в шапке. Игра берёт имя класса и разделяет слова пробелами
 * (`Strings.insertSpaces` в LStatement.name), поэтому PrintFlush становится «Print Flush».
 */
export function displayName(opcode) {
    const special = {
        printflush: 'Print Flush',
        drawflush: 'Draw Flush',
        printchar: 'Print Char',
        getlink: 'Get Link',
        packcolor: 'Pack Color',
        unpackcolor: 'Unpack Color',
        getblock: 'Get Block',
        setblock: 'Set Block',
        spawnwave: 'Spawn Wave',
        setrule: 'Set Rule',
        setrate: 'Set Rate',
        getflag: 'Get Flag',
        setflag: 'Set Flag',
        setprop: 'Set Prop',
        playsound: 'Play Sound',
        playmusic: 'Play Music',
        setmarker: 'Set Marker',
        makemarker: 'Make Marker',
        localeprint: 'Locale Print',
        weathersense: 'Weather Sense',
        weatherset: 'Weather Set',
        clientdata: 'Client Data',
        ubind: 'Unit Bind',
        ucontrol: 'Unit Control',
        uradar: 'Unit Radar',
        ulocate: 'Unit Locate'
    }

    return special[opcode] ?? opcode.charAt(0).toUpperCase() + opcode.slice(1)
}
