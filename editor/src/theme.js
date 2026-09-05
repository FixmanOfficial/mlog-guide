/**
 * Внешний вид редактора, снятый из игры.
 *
 * Цвета — graphics/Pal.java:59,124-129. Размеры — logic/LCanvas.java:418-500.
 * Менять эти числа «на глаз» нельзя: редактор должен быть узнаваем игроком с первого взгляда.
 */

/** LCategory: цвет категории задаёт цвет всей строки инструкции. */
export const CATEGORY_COLORS = {
    io: '#a08a8a',
    block: '#d4816b',
    operation: '#877bad',
    control: '#6bb2b2',
    unit: '#c7b59d',
    world: '#6b84d4',
    unknown: '#4d4d4d'
}

/** LCanvas: размеры в пикселях при масштабе 1. */
export const METRICS = {
    // Шапка строки: высота и внутренний отступ
    headerHeight: 38,
    headerPadding: 6,
    // Кнопки шапки: добавить, копировать, удалить
    buttonSize: 24,
    buttonGap: 6,
    // Тело строки
    bodyPadding: 4,
    bodyPaddingTop: 2,
    bodyMarginLeft: 4,
    // Расстояние между строками: DragLayout.space
    statementSpace: 10,
    // Ширина полотна: широкая раскладка и узкая
    canvasWidth: 900,
    canvasWidthNarrow: 400
}

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

/** Порядок категорий в меню добавления — как в LCategory.all. */
export const CATEGORY_ORDER = ['unknown', 'io', 'block', 'operation', 'control', 'unit', 'world']

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
