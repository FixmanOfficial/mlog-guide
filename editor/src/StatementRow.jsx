import {useRef, useState} from 'preact/hooks'

import {
    INSTRUCTIONS, ENUMS, ENUM_SYMBOLS, ENUM_FLAGS,
    SENSEABLE, CONTROLS, visibleParams, targetIndex
} from './program.js'
import {categoryColor, headerTextColor, displayName} from './theme.js'
import {instructionTip, propertyTip} from './tooltips.js'
import {SelectPopup} from './SelectPopup.jsx'
import {Icon} from './Icon.jsx'
import {JumpNode} from './JumpNode.jsx'

/**
 * Одна строка программы.
 *
 * Повторяет строение из LCanvas.StatementElem: шапка в цвете категории с именем, номером
 * и тремя кнопками, под ней тело с полями. Раскладка тела берётся из подсказки, снятой
 * из игры; у инструкций с ветвлениями — своя, здесь.
 */
export function StatementRow({
    statement, index, statements, onParam, onAdd, onCopy, onRemove,
    onDragStart, onPickTarget, dragging, selecting
}) {
    const definition = INSTRUCTIONS.get(statement.opcode)
    const color = categoryColor(definition.category)

    // У перехода в заголовке видна его цель: «Jump -> 3». LStatements.JumpStatement.build
    const destination = statement.opcode === 'jump' ? targetIndex(statements, statement) : -1
    const title = destination >= 0
        ? `${displayName(statement.opcode)} → ${destination}`
        : displayName(statement.opcode)

    return (
        <div
            class={`statement${dragging ? ' statement--dragging' : ''}`}
            style={{'--category': color, '--header-text': headerTextColor(definition.category)}}
        >
            <div class="statement__header" onPointerDown={onDragStart}>
                <span class="statement__name" title={instructionTip(statement.opcode) ?? ''}>
                    {title}
                </span>
                <span class="statement__spacer" />
                <span class="statement__index">{index}</span>

                <button class="statement__button" title="Добавить после" onClick={onAdd}>
                    <Icon name="add" size={20} />
                </button>
                <button class="statement__button" title="Копировать" onClick={onCopy}>
                    <Icon name="copy" size={20} />
                </button>
                <button class="statement__button" title="Удалить" onClick={onRemove}>
                    <Icon name="cancel" size={20} />
                </button>
            </div>

            <div class="statement__body">
                {statement.opcode === 'op' && <OperationBody statement={statement} onParam={onParam} />}
                {statement.opcode === 'jump' && <JumpBody statement={statement} onParam={onParam} />}
                {statement.opcode !== 'op' && statement.opcode !== 'jump' &&
                    renderBody(definition, statement, onParam)}

                {statement.opcode === 'jump' && (
                    <>
                        <span class="statement__spacer" />
                        <button
                            class={`jump-target${selecting ? ' jump-target--active' : ''}`}
                            title="Выбрать, куда прыгать"
                            onClick={onPickTarget}
                        >
                            <JumpNode />
                        </button>
                    </>
                )}
            </div>
        </div>
    )
}

/**
 * Операция строится не как остальные инструкции. LStatements.OperationStatement.rebuild:
 *
 *   унарная    dest = <оп> a
 *   функция    dest = <оп> a b
 *   остальные  dest =  /  a <оп> b
 *
 * Символ операции стоит на кнопке, открывающей сетку выбора, а не в выпадающем списке.
 */
function OperationBody({statement, onParam}) {
    const definition = INSTRUCTIONS.get('op')
    const operation = statement.params.op
    const unary = UNARY_OPS.has(operation)
    const func = ENUM_FLAGS.LogicOp?.[operation]?.func === true

    const button = (
        <EnumButton
            param={definition.params[0]}
            statement={statement}
            onParam={onParam}
            values={ENUMS.LogicOp}
            cellWidth={64}
            wide
        />
    )

    const field = (name) => (
        <Field param={definition.params.find(candidate => candidate.name === name)}
            statement={statement} onParam={onParam} />
    )

    if (unary) {
        return <>{field('dest')}<span class="label"> = </span>{button}{field('a')}</>
    }

    if (func) {
        return <>{field('dest')}<span class="label"> = </span>{button}{field('a')}{field('b')}</>
    }

    return (
        <>
            {field('dest')}<span class="label"> = </span>
            <div class="break" />
            {field('a')}{button}{field('b')}
        </>
    )
}

/**
 * Условный переход. LStatements.JumpStatement.build и addOp:
 *
 *   if <value> <условие> <compare>
 *
 * Подписей у полей нет вовсе — вместо них слово «if» в начале. А при условии `always`
 * оба поля пропадают, потому что сравнивать нечего, и кнопка условия становится шире:
 * 80 вместо 48.
 */
function JumpBody({statement, onParam}) {
    const definition = INSTRUCTIONS.get('jump')
    const always = statement.params.op === 'always'

    const field = (name) => (
        <Field param={definition.params.find(candidate => candidate.name === name)}
            statement={statement} onParam={onParam} />
    )

    return (
        <>
            <span class="label">if </span>
            {!always && field('value')}
            <EnumButton
                param={definition.params.find(candidate => candidate.name === 'op')}
                statement={statement}
                onParam={onParam}
                values={ENUMS.ConditionOp}
                className={always ? 'enum enum--always' : 'enum enum--condition'}
            />
            {!always && field('compare')}
        </>
    )
}

/** Унарные операции: у них второй аргумент не используется и поля для него нет. */
const UNARY_OPS = new Set([
    'not', 'abs', 'sign', 'log', 'log10', 'floor', 'ceil', 'round', 'sqrt', 'rand',
    'sin', 'cos', 'tan', 'asin', 'acos', 'atan'
])

function renderBody(definition, statement, onParam) {
    const hint = definition.layoutHint

    // Полная подсказка повторяет расположение полей из игры
    if (hint !== null && hint.complete) {
        return hint.items.map((item, position) => renderItem(item, definition, statement, onParam, position))
    }

    // Иначе выкладываем поля подряд. Скрытые не рисуем вовсе: у control enabled видно
    // одно поле, у control shoot — три, и подписаны они по-человечески, как в игре
    return visibleParams(definition, statement)
        .filter(entry => !entry.hidden && !isJumpAddress(statement, entry.param))
        .map(entry => (
            <span class="pair" key={entry.param.name}>
                <span class="label" title={propertyTip(entry.label) ?? ''}>{entry.label}</span>
                {renderParam(entry.param, statement, onParam)}
            </span>
        ))
}

/** Адрес перехода не редактируется вручную: его задают кнопкой-стрелкой, как в игре. */
const isJumpAddress = (statement, param) =>
    statement.opcode === 'jump' && param.name === 'destIndex'

function renderItem(item, definition, statement, onParam, position) {
    if (item.kind === 'row') return <div class="break" key={`row${position}`} />
    if (item.kind === 'label') return <span class="label" key={`label${position}`}>{item.text}</span>

    const param = definition.params.find(candidate => candidate.name === item.param)
    if (param === undefined || isJumpAddress(statement, param)) return null

    return <span key={param.name}>{renderParam(param, statement, onParam)}</span>
}

function renderParam(param, statement, onParam) {
    if (param.enum !== undefined && ENUMS[param.enum] !== undefined) {
        return (
            <EnumButton
                param={param}
                statement={statement}
                onParam={onParam}
                values={optionsFor(param, statement)}
            />
        )
    }

    return <Field param={param} statement={statement} onParam={onParam} />
}

function Field({param, statement, onParam}) {
    return (
        <input
            class="field"
            value={statement.params[param.name] ?? ''}
            spellcheck={false}
            onInput={(event) => onParam(param.name, event.currentTarget.value)}
        />
    )
}

/** Кнопка со значением перечисления: нажатие открывает сетку выбора, как в игре. */
function EnumButton({param, statement, onParam, values, cellWidth, wide, className}) {
    const anchor = useRef(null)
    const [open, setOpen] = useState(false)

    const value = statement.params[param.name] ?? ''
    const symbols = ENUM_SYMBOLS[param.enum] ?? {}

    return (
        <>
            <button
                class={className ?? `enum${wide ? ' enum--wide' : ''}`}
                ref={anchor}
                title={propertyTip(value) ?? ''}
                onClick={() => setOpen(!open)}
            >
                {symbols[value] ?? value}
            </button>

            {open && (
                <SelectPopup
                    values={values}
                    current={value}
                    enumName={param.enum}
                    cellWidth={cellWidth}
                    anchor={anchor}
                    onPick={(picked) => {
                        onParam(param.name, picked)
                        setOpen(false)
                    }}
                    onClose={() => setOpen(false)}
                />
            )}
        </>
    )
}

/**
 * Игра сужает список свойств по инструкции: sensor читает только те, у которых не больше
 * одного параметра, а control управляет только теми, у которых параметры есть.
 * LAccess.senseable и LAccess.controls.
 */
function optionsFor(param, statement) {
    if (param.enum !== 'LAccess') return ENUMS[param.enum]
    return statement.opcode === 'control' ? CONTROLS : SENSEABLE
}
