import {INSTRUCTIONS, ENUMS, SENSEABLE, CONTROLS, visibleParams, targetIndex} from './program.js'
import {categoryColor, headerTextColor, displayName} from './theme.js'
import {instructionTip, propertyTip} from './tooltips.js'

/**
 * Одна строка программы.
 *
 * Повторяет строение из LCanvas.StatementElem: шапка в цвете категории с именем, номером
 * и тремя кнопками, под ней тело с полями. Раскладка тела берётся из подсказки, снятой
 * из игры; там, где подсказка неполна (инструкции с ветвлениями), поля выкладываются подряд.
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

                <button class="statement__button" title="Добавить после" onClick={onAdd}>+</button>
                <button class="statement__button" title="Копировать" onClick={onCopy}>⧉</button>
                <button class="statement__button" title="Удалить" onClick={onRemove}>✕</button>
            </div>

            <div class="statement__body">
                {renderBody(definition, statement, onParam)}

                {statement.opcode === 'jump' && (
                    <>
                        <span class="statement__spacer" />
                        <button
                            class={`jump-target${selecting ? ' jump-target--active' : ''}`}
                            title="Выбрать, куда прыгать"
                            onClick={onPickTarget}
                        >
                            ➤
                        </button>
                    </>
                )}
            </div>
        </div>
    )
}

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
    const value = statement.params[param.name] ?? ''

    // Параметр с перечислением — выпадающий список: свободный ввод там смысла не имеет
    if (param.enum !== undefined && ENUMS[param.enum] !== undefined) {
        const options = optionsFor(param, statement)

        return (
            <select
                class="select"
                value={value}
                title={propertyTip(value) ?? ''}
                onChange={(event) => onParam(param.name, event.currentTarget.value)}
            >
                {options.map(option => <option key={option} value={option}>{option}</option>)}
            </select>
        )
    }

    return (
        <input
            class="field"
            value={value}
            spellcheck={false}
            onInput={(event) => onParam(param.name, event.currentTarget.value)}
        />
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
