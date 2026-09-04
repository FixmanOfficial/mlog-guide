import {INSTRUCTIONS, ENUMS, SENSEABLE, CONTROLS, visibleParams} from './program.js'
import {categoryColor, displayName} from './theme.js'

/**
 * Одна строка программы.
 *
 * Повторяет строение из LCanvas.StatementElem: шапка в цвете категории с именем, номером
 * и тремя кнопками, под ней тело с полями. Раскладка тела берётся из подсказки, снятой
 * из игры; там, где подсказка неполна (инструкции с ветвлениями), поля выкладываются подряд.
 */
export function StatementRow({statement, index, onParam, onAdd, onCopy, onRemove, onDragStart, dragging}) {
    const definition = INSTRUCTIONS.get(statement.opcode)
    const color = categoryColor(definition.category)

    return (
        <div
            class={`statement${dragging ? ' statement--dragging' : ''}`}
            style={{'--category': color}}
        >
            <div class="statement__header" onPointerDown={onDragStart}>
                <span class="statement__name">{displayName(statement.opcode)}</span>
                <span class="statement__spacer" />
                <span class="statement__index">{index}</span>

                <button class="statement__button" title="Добавить после" onClick={onAdd}>+</button>
                <button class="statement__button" title="Копировать" onClick={onCopy}>⧉</button>
                <button class="statement__button" title="Удалить" onClick={onRemove}>✕</button>
            </div>

            <div class="statement__body">
                {renderBody(definition, statement, onParam)}
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
        .filter(entry => !entry.hidden)
        .map(entry => (
            <span class="pair" key={entry.param.name}>
                <span class="label">{entry.label}</span>
                {renderParam(entry.param, statement, onParam)}
            </span>
        ))
}

function renderItem(item, definition, statement, onParam, position) {
    if (item.kind === 'row') return <div class="break" key={`row${position}`} />
    if (item.kind === 'label') return <span class="label" key={`label${position}`}>{item.text}</span>

    const param = definition.params.find(candidate => candidate.name === item.param)
    if (param === undefined) return null

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
