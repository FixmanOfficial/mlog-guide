import {useState, useCallback, useRef} from 'preact/hooks'

import {StatementRow} from './StatementRow.jsx'
import {AddDialog} from './AddDialog.jsx'
import {JumpArrows} from './JumpArrows.jsx'
import {createStatement, operations, toText} from './program.js'

/**
 * Редактор блоков.
 *
 * Держит список инструкций и отдаёт текст mlog наружу через onChange. Про виртуальную машину
 * не знает ничего: её запускает страница, получив текст.
 */
export function Editor({initial = [], onChange}) {
    const [statements, setStatements] = useState(initial)
    const [adding, setAdding] = useState(null)
    const [dragIndex, setDragIndex] = useState(null)
    const [selecting, setSelecting] = useState(null)
    const listRef = useRef(null)

    const update = useCallback((next) => {
        setStatements(next)
        onChange?.(toText(next), next)
    }, [onChange])

    const addAt = (index, opcode) => {
        update(operations.insert(statements, index, createStatement(opcode)))
        setAdding(null)
    }

    const onDragStart = (index) => (event) => {
        // Кнопки шапки не должны начинать перетаскивание
        if (event.target.closest('.statement__button') !== null) return
        setDragIndex(index)
    }

    const onDragOver = (index) => () => {
        if (dragIndex === null || dragIndex === index) return
        update(operations.move(statements, dragIndex, index))
        setDragIndex(index)
    }

    /**
     * Выбор цели перехода в два касания: сначала стрелка на переходе, потом строка-цель.
     * В игре это перетаскивание за ту же кнопку, но по клику попасть проще, а результат тот же.
     */
    const onRowClick = (statement) => () => {
        if (selecting === null || selecting === statement.id) return
        update(operations.setTarget(statements, selecting, statement.id))
        setSelecting(null)
    }

    return (
        <div class="editor" onPointerUp={() => setDragIndex(null)} onPointerLeave={() => setDragIndex(null)}>
            <div class={`editor__list${selecting !== null ? ' editor__list--selecting' : ''}`} ref={listRef}>
                {statements.map((statement, index) => (
                    <div
                        key={statement.id}
                        onPointerEnter={onDragOver(index)}
                        onClick={onRowClick(statement)}
                    >
                        <StatementRow
                            statement={statement}
                            statements={statements}
                            index={index}
                            dragging={dragIndex === index}
                            selecting={selecting === statement.id}
                            onDragStart={onDragStart(index)}
                            onPickTarget={() =>
                                setSelecting(selecting === statement.id ? null : statement.id)}
                            onParam={(name, value) =>
                                update(operations.setParam(statements, statement.id, name, value))}
                            onAdd={() => setAdding(index + 1)}
                            onCopy={() => update(operations.duplicate(statements, statement.id))}
                            onRemove={() => update(operations.remove(statements, statement.id))}
                        />
                    </div>
                ))}
                <JumpArrows statements={statements} containerRef={listRef} />
            </div>

            <button class="editor__add" onClick={() => setAdding(statements.length)}>
                Добавить инструкцию
            </button>

            {adding !== null && (
                <AddDialog
                    onPick={(opcode) => addAt(adding, opcode)}
                    onClose={() => setAdding(null)}
                />
            )}
        </div>
    )
}
