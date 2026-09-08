import {useState, useCallback, useEffect, useRef} from 'preact/hooks'

import {StatementRow} from './StatementRow.jsx'
import {AddDialog} from './AddDialog.jsx'
import {JumpArrows} from './JumpArrows.jsx'
import {createStatement, operations, toText, MAX_INSTRUCTIONS} from './program.js'
import {METRICS} from './theme.js'

/**
 * Редактор блоков.
 *
 * Держит список инструкций и отдаёт текст mlog наружу через onChange. Про виртуальную машину
 * не знает ничего: её запускает страница, получив текст.
 *
 * Кнопки «добавить» у редактора своей нет: в игре она стоит в нижнем ряду окна процессора
 * (`LogicDialog`, `buttons.button("@add", Icon.add, …)`), а не под списком. Полотно открывает
 * меню добавления по внешнему сигналу `addOpen` и сообщает о закрытии через `onAddClose`.
 *
 * `counter` — номер строки, которую процессор выполнит следующей. В игре такого нет: там
 * программа не подсвечивается вовсе. Нам это нужно для пошагового разбора, поэтому подсветка
 * своя и намеренно неяркая, чтобы её не приняли за часть игры.
 *
 * Перетаскивание устроено как в `LCanvas.DragLayout`: строка следует за указателем, место
 * вставки считается по координате — сколько прочих строк осталось выше, — а остальные
 * расступаются. Перестановка «по наведению» промахивалась при быстром движении мыши.
 */
export function Editor({initial = [], onChange, counter = null, addOpen = false, onAddClose,
    privileged = false, unitControl = true, allow = true}) {
    const [statements, setStatements] = useState(initial)
    const [adding, setAdding] = useState(null)
    const [selecting, setSelecting] = useState(null)
    const [hovered, setHovered] = useState(null)

    // Тащимая строка: откуда взяли, куда встанет и на сколько сдвинута от исходного места
    const [drag, setDrag] = useState(null)
    const listRef = useRef(null)
    const dragState = useRef(null)

    const update = useCallback((next) => {
        setStatements(next)
        onChange?.(toText(next), next)
    }, [onChange])

    const addAt = (index, opcode) => {
        update(operations.insert(statements, index, createStatement(opcode)))
        closeAdd()
    }

    const closeAdd = () => {
        setAdding(null)
        onAddClose?.()
    }

    // Кнопка окна просит добавить в конец: LogicDialog.showAddDialog() без позиции
    useEffect(() => {
        if (addOpen) setAdding(statements.length)
    }, [addOpen])

    /** LExecutor.maxInstructions: за тысячей инструкций кнопки добавления гаснут. */
    const full = statements.length >= MAX_INSTRUCTIONS

    const onDragStart = (index) => (event) => {
        // Кнопки шапки не должны начинать перетаскивание
        if (event.target.closest('.statement__button') !== null) return

        const rows = [...listRef.current.querySelectorAll('.statement')]
        const box = rows[index].getBoundingClientRect()

        dragState.current = {
            index,
            insert: index,
            startY: event.clientY,
            height: box.height,
            // Верх каждой строки на момент захвата: по ним ищется место вставки
            tops: rows.map(row => row.getBoundingClientRect().top)
        }

        setDrag({index, insert: index, offset: 0, height: box.height})
        capture(event)
    }

    const onPointerMove = (event) => {
        if (selecting !== null) {
            setHovered(rowUnder(event))
            return
        }

        const state = dragState.current
        if (state === null) return

        const offset = event.clientY - state.startY
        const middle = state.tops[state.index] + offset + state.height / 2

        /*
         * Место вставки считается по прочим строкам, без тащимой: столько из них осталось выше.
         * `DragLayout.layout` ищет то же самое, только через координаты arc, где ось Y смотрит
         * вверх. Строки при этом остаются на своих местах — сдвиг рисуется стилем.
         */
        let insert = 0
        state.tops.forEach((rowTop, index) => {
            if (index !== state.index && rowTop + state.height / 2 < middle) insert++
        })

        state.insert = insert
        setDrag({index: state.index, insert, offset, height: state.height})

        scrollNearEdge(listRef.current, event.clientY)
    }

    const onPointerUp = (event) => {
        if (selecting !== null) {
            finishTarget(event)
            return
        }

        const state = dragState.current
        if (state === null) return

        dragState.current = null
        setDrag(null)

        if (state.insert !== state.index) {
            update(operations.move(statements, state.index, state.insert))
        }
    }

    /**
     * Жест отменили — системным свайпом, звонком, чем угодно. Строка возвращается на место:
     * бросить её там, где палец пропал, было бы неожиданностью.
     */
    const onPointerCancel = () => {
        if (dragState.current === null) return

        dragState.current = null
        setDrag(null)
    }

    /**
     * Цель перехода выбирается перетаскиванием узла на строку — `LCanvas.JumpButton`.
     *
     * Нажатие сразу снимает старую цель (`setter.get(null)` в `touchDown`), пока тащат, стрелка
     * тянется к строке под курсором, а отпускание мимо строк оставляет переход без цели.
     * На свою же строку указать нельзя: в игре это проверка `!isDescendantOf(elem)`.
     */
    const onPickTarget = (statement) => (event) => {
        update(operations.setTarget(statements, statement.id, null))
        setSelecting(statement.id)
        setHovered(null)
        capture(event)
        event.stopPropagation()
    }

    const rowUnder = (event) => {
        const rows = [...listRef.current.querySelectorAll('.statement')]
        const index = rows.findIndex(row => {
            const box = row.getBoundingClientRect()
            return event.clientY >= box.top && event.clientY <= box.bottom
                && event.clientX >= box.left && event.clientX <= box.right
        })

        return index === -1 ? null : index
    }

    const finishTarget = (event) => {
        const index = rowUnder(event)
        const own = statements.findIndex(statement => statement.id === selecting)

        if (index !== null && index !== own) {
            update(operations.setTarget(statements, selecting, statements[index].id))
        }

        setSelecting(null)
        setHovered(null)
    }

    // Строка, которую тащат, следует за указателем; на её месте остаётся пустота
    const shift = (index) => {
        if (drag === null || index === drag.index) return null

        const down = drag.index < drag.insert
        const inside = down
            ? index > drag.index && index <= drag.insert
            : index >= drag.insert && index < drag.index

        if (!inside) return null

        const step = (drag.height + METRICS.statementSpace) * (down ? -1 : 1)
        return `translateY(${step}px)`
    }

    return (
        <div
            class="editor"
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
        >
            <div class={`editor__list${selecting !== null ? ' editor__list--selecting' : ''}`} ref={listRef}>
                {statements.map((statement, index) => (
                    <div
                        key={statement.id}
                        class="editor__slot"
                        style={index === drag?.index
                            ? {transform: `translateY(${drag.offset}px)`, zIndex: 5, position: 'relative'}
                            : {transform: shift(index)}}
                    >
                        <StatementRow
                            statement={statement}
                            statements={statements}
                            index={index}
                            dragging={drag?.index === index}
                            next={counter === index}
                            selecting={selecting === statement.id}
                            hovered={selecting !== null && hovered === index}
                            full={full}
                            onDragStart={onDragStart(index)}
                            onPickTarget={onPickTarget(statement)}
                            onParam={(name, value) =>
                                update(operations.setParam(statements, statement.id, name, value))}
                            onAdd={() => setAdding(index + 1)}
                            onCopy={() => update(operations.duplicate(statements, statement.id))}
                            onRemove={() => update(operations.remove(statements, statement.id))}
                        />
                    </div>
                ))}
                <JumpArrows
                    statements={statements}
                    containerRef={listRef}
                    selecting={selecting}
                    hovered={hovered}
                />
            </div>

            {adding !== null && (
                <AddDialog
                    privileged={privileged}
                    unitControl={unitControl}
                    allow={allow}
                    onPick={(opcode) => addAt(adding, opcode)}
                    onClose={closeAdd}
                />
            )}
        </div>
    )
}

/**
 * Захват указателя, чтобы движение доходило даже за пределами кнопки. Не всякий указатель
 * это умеет, а падать из-за такого нельзя — отсюда try.
 */
function capture(event) {
    try {
        event.currentTarget.setPointerCapture?.(event.pointerId)
    } catch {
        // указателя с таким номером уже нет: тащить всё равно можно
    }
}

/**
 * Прокрутка, пока тащишь строку у края. `LCanvas.act`: если указатель ближе 100 пикселей
 * к краю, полотно едет на 15 пикселей за тик.
 */
function scrollNearEdge(list, pointerY) {
    const pane = list?.closest('.logic-dialog__canvas, .editor, .sandbox__editor')
    if (pane === null || pane === undefined) return

    const box = pane.getBoundingClientRect()
    const margin = 100

    if (pointerY - box.top < margin) pane.scrollTop -= 15
    else if (box.bottom - pointerY < margin) pane.scrollTop += 15
}
