/**
 * Раскладки тела строки для инструкций, которые строят его сами.
 *
 * Большинство инструкций выкладывает поля линейно, и подсказку для них снимает генератор.
 * Но десяток строит раскладку кодом, с ветвлениями по выбранному значению, и статическим
 * разбором такое не берётся. Здесь они перенесены вручную, каждая со ссылкой на исходник.
 *
 * Имена параметров при этом не выдуманы: они приходят из сгенерированной схемы, и тест
 * следит, чтобы каждая упомянутая здесь ячейка в схеме существовала.
 */

import {INSTRUCTIONS, ENUMS, ENUM_PARAMS} from './program.js'

/**
 * Поля инструкции draw для каждого вида отрисовки, из DrawStatement.rebuild.
 * Пустая строка в подписи означает поле без неё, `null` — перенос строки.
 */
export const DRAW_FIELDS = {
    clear: [['r', 'x'], ['g', 'y'], ['b', 'p1']],
    color: [['r', 'x'], ['g', 'y'], ['b', 'p1'], null, ['a', 'p2']],
    col: [['color', 'x']],
    stroke: [['', 'x']],
    line: [['x', 'x'], ['y', 'y'], null, ['x2', 'p1'], ['y2', 'p2']],
    rect: [['x', 'x'], ['y', 'y'], null, ['width', 'p1'], ['height', 'p2']],
    lineRect: [['x', 'x'], ['y', 'y'], null, ['width', 'p1'], ['height', 'p2']],
    poly: [['x', 'x'], ['y', 'y'], null, ['sides', 'p1'], ['radius', 'p2'], null, ['rotation', 'p3']],
    linePoly: [['x', 'x'], ['y', 'y'], null, ['sides', 'p1'], ['radius', 'p2'], null, ['rotation', 'p3']],
    triangle: [['x', 'x'], ['y', 'y'], null, ['x2', 'p1'], ['y2', 'p2'], null, ['x3', 'p3'], ['y3', 'p4']],
    image: [['x', 'x'], ['y', 'y'], null, ['image', 'p1'], ['size', 'p2'], null, ['rotation', 'p3']],
    print: [['x', 'x'], ['y', 'y'], null, ['align', 'p1']],
    translate: [['x', 'x'], ['y', 'y']],
    scale: [['x', 'x'], ['y', 'y']],
    rotate: [['degrees', 'p1']],
    reset: []
}

/**
 * Значения по умолчанию, которые игра подставляет при смене вида отрисовки.
 * Без них `draw image` появляется с пустой картинкой, а `draw color` — с нулевой прозрачностью.
 */
export const DRAW_DEFAULTS = {
    color: {p2: '255'},
    image: {p1: '@copper', p2: '32', p3: '0'},
    print: {p1: '@bottomLeft'}
}

/**
 * Порядок выравниваний из `LStatement.aligns`. Он не алфавитный: это сетка три на три,
 * от левого верхнего угла, и по три кнопки в ряд её и рисуют.
 */
export const ALIGNS = [
    'topLeft', 'top', 'topRight',
    'left', 'center', 'right',
    'bottomLeft', 'bottom', 'bottomRight'
]

/** Инструкции, у которых раскладка своя. Остальные идут общим путём. */
export const CUSTOM_BODIES = new Set([
    'op', 'jump', 'draw', 'control', 'select', 'lookup', 'packcolor', 'unpackcolor',
    'printchar', 'sensor'
])

/**
 * Описание раскладки: список элементов, которые нарисует StatementRow.
 * Возвращается данными, а не готовой разметкой, чтобы это можно было проверить тестом.
 *
 * Элементы: `{label}` — подпись, `{field, label, width}` — поле, `{enum, width, columns,
 * cell}` — кнопка выбора, `{pencil, param}` — карандаш с табличкой значений,
 * `{break: true}` — перенос строки.
 */
export function describeBody(statement) {
    const build = LAYOUTS[statement.opcode]
    return build === undefined ? null : build(statement)
}

const label = (text) => ({label: text})
const field = (name, width) => ({field: name, width})
const named = (text, name, width) => [{label: text}, {field: name, width}]
const lineBreak = {break: true}

const LAYOUTS = {
    /** LStatements.OperationStatement.rebuild */
    op: (statement) => {
        const operation = statement.params.op
        const button = {enum: 'op', values: ENUMS.LogicOp, width: 64, cell: 64}

        if (UNARY_OPS.has(operation)) {
            return [field('dest'), label(' = '), button, field('a')]
        }

        if (FUNC_OPS.has(operation)) {
            return [field('dest'), label(' = '), button, field('a'), field('b')]
        }

        return [field('dest'), label(' = '), lineBreak, field('a'), button, field('b')]
    },

    /** LStatements.JumpStatement.build плюс addOp */
    jump: (statement) => [label('if '), ...condition(statement, 'op', 'value', 'compare')],

    /**
     * LStatements.SelectStatement.rebuild: два ряда. Сверху условие, снизу — что выбрать.
     * Поля «then» и «else» шире обычных, 130.
     */
    select: (statement) => [
        field('result'), label(' = if '), lineBreak,
        ...condition(statement, 'op', 'comp0', 'comp1'),
        lineBreak,
        label('then '), field('a', 130), label(' else '), field('b', 130)
    ],

    /** LStatements.DrawStatement.rebuild */
    draw: (statement) => {
        const type = statement.params.type
        const items = [{enum: 'type', values: ENUMS.GraphicsType, width: 90, columns: 2, cell: 100}]

        // Перенос ставится после кнопки для всех видов, кроме stroke
        if (type !== 'stroke') items.push(lineBreak)

        for (const entry of DRAW_FIELDS[type] ?? []) {
            if (entry === null) items.push(lineBreak)
            else items.push(...(entry[0] === '' ? [field(entry[1])] : named(entry[0], entry[1])))
        }

        // LStatements.DrawStatement.rebuild: у print рядом с выравниванием стоит карандаш
        if (type === 'print') items.push({pencil: 'align', param: 'p1'})

        return items
    },

    /**
     * LStatements.ControlStatement.rebuild. Поля берутся из выбранного свойства: их имена
     * несёт само перечисление LAccess, и переносы ставятся через каждые два.
     */
    control: (statement) => {
        const names = ENUM_PARAMS.LAccess[statement.params.type] ?? []

        const items = [
            label(' set '),
            {enum: 'type', values: CONTROL_VALUES, width: 90, columns: 2, cell: 100},
            label(' of '),
            field('target')
        ]

        if (names.length > 0) items.push(lineBreak)

        names.forEach((name, index) => {
            items.push(...named(name, `p${index + 1}`))
            if ((index + 1) % 2 === 0 && index + 1 < names.length) items.push(lineBreak)
        })

        return items
    },

    /** LStatements.LookupStatement.build */
    lookup: () => [
        field('result', 120), label(' = lookup '), lineBreak,
        {enum: 'type', values: LOOKUP_TYPES, width: 64, cell: 64},
        label(' # '), field('id')
    ],

    /** LStatements.PackColorStatement.build */
    packcolor: () => [
        field('result'), label(' = pack '), lineBreak,
        field('r'), field('g'), field('b'), field('a')
    ],

    /** LStatements.UnpackColorStatement.build */
    unpackcolor: () => [
        field('r'), field('g'), field('b'), field('a'), lineBreak,
        label(' = unpack '), field('value')
    ],

    /**
     * LStatements.SensorStatement.build. Рядом с полем свойства стоит кнопка-карандаш,
     * открывающая большое меню контента: предметы, жидкости, блоки и юниты иконками.
     */
    sensor: () => [
        field('to'), label(' = '), lineBreak,
        field('type'), {content: 'type'},
        label(' in '), field('from')
    ],

    /** LStatements.PrintCharStatement.build: поле и карандаш с таблицей ASCII */
    printchar: () => [label(' char '), field('value', 144), {pencil: 'char', param: 'value'}]
}

/**
 * Общая часть условия у jump и select — LStatements.JumpStatement.addOp.
 * При условии `always` поля сравнения пропадают, а кнопка расширяется с 48 до 80.
 */
function condition(statement, name, first, second) {
    const always = statement.params[name] === 'always'
    const button = {enum: name, values: ENUMS.ConditionOp, width: always ? 80 : 48}

    return always ? [button] : [field(first), button, field(second)]
}

/** Унарные операции: второй аргумент не используется и поля для него нет. */
const UNARY_OPS = new Set([
    'not', 'abs', 'sign', 'log', 'log10', 'floor', 'ceil', 'round', 'sqrt', 'rand',
    'sin', 'cos', 'tan', 'asin', 'acos', 'atan'
])

/** Операции, записываемые функцией: max(a, b), а не a max b. */
const FUNC_OPS = new Set(['max', 'min', 'angle', 'angleDiff', 'len', 'noise'])

/** control предлагает только управляемые свойства — те, у которых есть параметры. */
const CONTROL_VALUES = ENUMS.LAccess.filter(value => (ENUM_PARAMS.LAccess[value] ?? []).length > 0)

/** lookup ищет по тем типам, что перечислены в GlobalVars.lookableContent. */
const LOOKUP_TYPES = ['block', 'unit', 'item', 'liquid', 'team']

/** Все ячейки, на которые ссылаются раскладки: нужно тесту, чтобы сверить их со схемой. */
export function referencedParams(opcode) {
    const definition = INSTRUCTIONS.get(opcode)
    if (definition === undefined) return []

    const seen = new Set()

    // Прогоняем раскладку по всем значениям ведущего перечисления: у каждого свой набор полей
    const driver = definition.params.find(param => param.enum !== undefined)
    const variants = driver === undefined
        ? [{}]
        : (driver.options ?? ENUMS[driver.enum]).map(value => ({[driver.name]: value}))

    for (const variant of variants) {
        const statement = {opcode, params: {...defaults(definition), ...variant}}

        for (const item of describeBody(statement) ?? []) {
            if (item.field !== undefined) seen.add(item.field)
            if (item.content !== undefined) seen.add(item.content)
            if (item.enum !== undefined) seen.add(item.enum)
        }
    }

    return [...seen]
}

const defaults = (definition) =>
    Object.fromEntries(definition.params.map(param => [param.name, param.default ?? '0']))
