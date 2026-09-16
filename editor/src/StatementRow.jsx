import {useRef, useState} from 'preact/hooks'

import {INSTRUCTIONS, ENUMS, ENUM_SYMBOLS, SENSEABLE, visibleParams, targetIndex} from './program.js'
import {describeBody, CUSTOM_BODIES, DRAW_DEFAULTS} from './bodies.js'
import {categoryColor, headerTextColor, displayName} from './theme.js'
import {instructionTip, propertyTip, paramTip} from './tooltips.js'
import {tipProps, hideTip} from './tip.js'
import {statementName, tokenName, enumLabel, uiText, useLocalization} from './names.js'
import {SelectPopup} from './SelectPopup.jsx'
import {Icon} from './Icon.jsx'
import {ContentButton} from './ContentButton.jsx'
import {PencilButton} from './PencilButton.jsx'
import {JumpNode} from './JumpNode.jsx'

/**
 * Одна строка программы.
 *
 * Повторяет строение из LCanvas.StatementElem: шапка в цвете категории с именем, номером
 * и тремя кнопками, под ней тело с полями.
 *
 * Тело собирается по описанию из bodies.jsx — там раскладки инструкций, которые строят её
 * сами, с ветвлениями. Для остальных берётся подсказка, снятая генератором из игры.
 */
export function StatementRow({
    statement,
    full = false, index, statements, onParam, onAdd, onCopy, onRemove,
    onDragStart, onPickTarget, dragging, selecting, hovered = false, next = false
}) {
    const definition = INSTRUCTIONS.get(statement.opcode)
    const color = categoryColor(definition.category)

    // У перехода в заголовке видна его цель. В игре это буквально строка " -> " из двух
    // знаков ASCII, а не стрелка Unicode. LStatements.JumpStatement.build
    const destination = statement.opcode === 'jump' ? targetIndex(statements, statement) : -1
    /*
     * Название переводится, если перевод включён, — как `localizedName` в игре. Подписка
     * нужна затем, чтобы строка перерисовалась, когда тумблер щёлкнули на другой строке.
     */
    useLocalization()

    const name = statementName(displayName(statement.opcode))
    const title = destination >= 0 ? `${name} -> ${destination}` : name

    return (
        <div
            class={`statement${next ? ' statement--next' : ''}${hovered ? ' statement--hovered' : ''}${dragging ? ' statement--dragging' : ''}`}
            style={{'--category': color, '--header-text': headerTextColor(definition.category)}}
        >
            <div class="statement__header" onPointerDown={onDragStart}>
                <span class="statement__name" {...tipProps(instructionTip(statement.opcode))}>
                    {title}
                </span>
                <span class="statement__spacer" />
                <span class="statement__index">{index}</span>

                {/* LCanvas: обе кнопки гаснут, когда инструкций стало максимум */}
                <button class="statement__button" title={uiText('addBelow')} disabled={full} onClick={onAdd}>
                    <Icon name="add" size={20} />
                </button>
                <button class="statement__button" title={uiText('copy')} disabled={full} onClick={onCopy}>
                    <Icon name="copy" size={20} />
                </button>
                <button class="statement__button" title={uiText('delete')} onClick={onRemove}>
                    <Icon name="cancel" size={20} />
                </button>
            </div>

            <div class="statement__body">
                {CUSTOM_BODIES.has(statement.opcode)
                    ? renderDescribed(statement, definition, onParam)
                    : renderGeneric(definition, statement, onParam)}

                {statement.opcode === 'jump' && (
                    <>
                        <span class="statement__spacer" />
                        <button
                            class={`jump-target${selecting ? ' jump-target--active' : ''}`}
                            title={uiText('drag')}
                            onPointerDown={onPickTarget}
                        >
                            <JumpNode />
                        </button>
                    </>
                )}
            </div>
        </div>
    )
}

/** Собирает тело по описанию раскладки. */
function renderDescribed(statement, definition, onParam) {
    return (describeBody(statement) ?? []).map((item, position) => {
        if (item.break === true) return <div class="break" key={`break${position}`} />
        if (item.label !== undefined) {
            /*
             * Подсказка к подписи собирается из имени инструкции и самой подписи —
             * `radar.from`, `sensor.in`. Есть она не у всякой подписи: у знака равенства,
             * например, нет и в игре. LStatement.param
             */
            return (
                <span
                    class="label"
                    key={`label${position}`}
                    {...tipProps(paramTip(statement.opcode, item.label.trim()))}
                >
                    {tokenName(item.label)}
                </span>
            )
        }

        if (item.content !== undefined) {
            return (
                <ContentButton
                    key={`content${position}`}
                    value={statement.params[item.content] ?? ''}
                    onPick={(picked) => onParam(item.content, picked)}
                />
            )
        }

        if (item.pencil !== undefined) {
            return (
                <PencilButton
                    key={`pencil${position}`}
                    kind={item.pencil}
                    value={statement.params[item.param] ?? ''}
                    onPick={(picked) => onParam(item.param, picked)}
                />
            )
        }

        if (item.enum !== undefined) {
            const param = definition.params.find(candidate => candidate.name === item.enum)
            if (param === undefined) return null

            return (
                <EnumButton
                    key={param.name}
                    param={param}
                    statement={statement}
                    onParam={onParam}
                    values={item.values}
                    width={item.width}
                    columns={item.columns}
                    cellWidth={item.cell}
                />
            )
        }

        const param = definition.params.find(candidate => candidate.name === item.field)
        if (param === undefined) return null

        return (
            <Field key={param.name} param={param} statement={statement}
                onParam={onParam} width={item.width} />
        )
    })
}

/**
 * Размеры меню выбора у этого параметра — из снятой схемы.
 *
 * В игре они заданы прямо в вызове `showSelect`, и у каждой инструкции свои: у `ucontrol`
 * это два столбца по 120, у условия три по 95, у остальных умолчание — четыре по 60.
 * Раньше здесь всюду стояло умолчание, и длинные имена команд не влезали в кнопку.
 */
function selectLayout(definition, name) {
    const found = (definition.layoutHint?.items ?? [])
        .find(item => item.kind === 'select' && item.param === name)

    return found === undefined
        ? {}
        : {columns: found.columns, cellWidth: found.cellWidth, cellHeight: found.cellHeight}
}

/** Инструкции без своей раскладки: подсказка из игры, иначе поля подряд с подписями. */
function renderGeneric(definition, statement, onParam) {
    const hint = definition.layoutHint

    if (hint !== null && hint.complete) {
        return hint.items.map((item, position) => {
            if (item.kind === 'row') return <div class="break" key={`row${position}`} />
            if (item.kind === 'label') {
                return (
                    <span
                        class="label"
                        key={`label${position}`}
                        {...tipProps(paramTip(statement.opcode, item.text.trim()))}
                    >
                        {tokenName(item.text)}
                    </span>
                )
            }

            const param = definition.params.find(candidate => candidate.name === item.param)
            if (param === undefined) return null

            return <Field key={param.name} param={param} statement={statement} onParam={onParam} />
        })
    }

    return visibleParams(definition, statement)
        .filter(entry => !entry.hidden)
        .map(entry => (
            <span class="pair" key={entry.param.name}>
                <span class="label" {...tipProps(paramTip(statement.opcode, entry.label))}>
                    {tokenName(entry.label)}
                </span>
                {renderParam(entry.param, statement, onParam, definition)}
            </span>
        ))
}

function renderParam(param, statement, onParam, definition) {
    if (param.enum !== undefined && ENUMS[param.enum] !== undefined) {
        /*
         * Меню открывается не всегда по полному перечислению: у `setblock` игра показывает
         * `TileLayer.settable`, где нет слоя building — здание нельзя поставить, оно
         * появляется вместе с блоком. Такие подмножества лежат в `options` параметра.
         */
        const values = param.options ?? (param.enum === 'LAccess' ? SENSEABLE : ENUMS[param.enum])

        return (
            <EnumButton
                param={param}
                statement={statement}
                onParam={onParam}
                values={values}
                {...selectLayout(definition, param.name)}
            />
        )
    }

    return <Field param={param} statement={statement} onParam={onParam} />
}

/**
 * Ширина поля: число — пиксели, строка — запись CSS. Строкой она приходит там, где число
 * зависит от раскладки: у `sensor` поле свойства узкое на узком экране.
 */
const size = (width) => typeof width === 'number' ? `${width}px` : width

function Field({param, statement, onParam, width}) {
    return (
        <input
            class="field"
            style={width === undefined ? undefined : {width: size(width)}}
            value={statement.params[param.name] ?? ''}
            spellcheck={false}
            onInput={(event) => onParam(param.name, event.currentTarget.value)}
        />
    )
}

/** Кнопка со значением перечисления: нажатие открывает сетку выбора, как в игре. */
function EnumButton({param, statement, onParam, values, width, columns, cellWidth, cellHeight}) {
    const anchor = useRef(null)
    const [open, setOpen] = useState(false)

    const value = statement.params[param.name] ?? ''
    const symbols = ENUM_SYMBOLS[param.enum] ?? {}

    /** Смена вида отрисовки подставляет свои значения по умолчанию. DrawStatement.rebuild */
    const pick = (picked) => {
        onParam(param.name, picked)

        if (statement.opcode === 'draw') {
            for (const [name, fallback] of Object.entries(DRAW_DEFAULTS[picked] ?? {})) {
                onParam(name, fallback)
            }
        }

        setOpen(false)
    }

    return (
        <>
            <button
                class="enum"
                ref={anchor}
                style={width === undefined ? undefined : {width: `${width}px`, minWidth: `${width}px`}}
                {...tipProps(propertyTip(value))}
                onClick={() => { hideTip(); setOpen(!open) }}
            >
                {/* Переводится не имя значения, а его знак: у операций это `and`, а не `land` */}
                {enumLabel(param.enum, symbols[value] ?? value)}
            </button>

            {open && (
                <SelectPopup
                    values={values}
                    current={value}
                    enumName={param.enum}
                    columns={columns}
                    cellWidth={cellWidth}
                    cellHeight={cellHeight}
                    anchor={anchor}
                    onPick={pick}
                    onClose={() => setOpen(false)}
                />
            )}
        </>
    )
}
