import {useState, useCallback, useEffect, useRef} from 'preact/hooks'

import {StatementRow} from './StatementRow.jsx'
import {AddDialog} from './AddDialog.jsx'
import {JumpArrows} from './JumpArrows.jsx'
import {createStatement, operations, toText, MAX_INSTRUCTIONS} from './program.js'
import {METRICS} from './theme.js'

/** Кадр при шестидесяти в секунду: к нему привязана скорость прокрутки, как в игре. */
const FRAME_MS = 1000 / 60

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
    const scrollFrame = useRef(0)

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

        const scroller = scrollerFor(listRef.current)

        dragState.current = {
            index,
            insert: index,
            startY: event.clientY,
            pointerY: event.clientY,
            height: box.height,

            /*
             * Кто поедет, когда потянут к краю, и на сколько он уже уехал. В окне игры это
             * само полотно, на странице урока — страница: строку тащат мимо текста, а его
             * может быть на десять экранов.
             */
            scroller,
            startScroll: scrollOf(scroller),
            lastScroll: 0,

            // Верх каждой строки на момент захвата: по ним ищется место вставки
            tops: rows.map(row => row.getBoundingClientRect().top)
        }

        setDrag({index, insert: index, offset: 0, height: box.height})
        capture(event)
        startScrolling()
    }

    /**
     * Пока строку держат у края, страница едет сама, а строка остаётся под пальцем.
     *
     * Прокрутка не рождает событий указателя, поэтому положение пересчитывается кадром:
     * иначе палец стоит на месте, текст уезжает, а строка остаётся висеть где была.
     */
    const startScrolling = () => {
        if (scrollFrame.current !== 0) return

        const tick = () => {
            const state = dragState.current

            if (state === null) {
                scrollFrame.current = 0
                return
            }

            maybeScroll(state)
            applyDrag(state)

            scrollFrame.current = requestAnimationFrame(tick)
        }

        scrollFrame.current = requestAnimationFrame(tick)
    }

    const stopScrolling = () => {
        cancelAnimationFrame(scrollFrame.current)
        scrollFrame.current = 0
    }

    /**
     * Прокрутка у края — не чаще раза в кадр, откуда бы её ни попросили.
     *
     * Просят двое: кадр, пока палец стоит на месте, и само движение пальца. Без счёта времени
     * они складывались бы, и у края страница ехала бы вдвое быстрее, чем в игре.
     */
    const maybeScroll = (state) => {
        const now = performance.now()
        if (now - state.lastScroll < FRAME_MS) return

        state.lastScroll = now
        scrollNearEdge(state.scroller, state.pointerY)
    }

    /**
     * Считает сдвиг строки и место вставки по последнему положению пальца.
     *
     * Сдвиг берётся вместе с прокруткой: строка стоит на месте документа, а место это едет
     * вместе с текстом — без поправки строка отставала бы от пальца ровно на прокрученное.
     * Место вставки от прокрутки не зависит: и строки, и тащимая уезжают одинаково.
     */
    const applyDrag = (state) => {
        const scrolled = scrollOf(state.scroller) - state.startScroll
        const offset = state.pointerY - state.startY + scrolled

        let insert = 0
        state.tops.forEach((rowTop, index) => {
            if (index !== state.index && rowTop + state.height / 2 < state.tops[state.index] + offset + state.height / 2) {
                insert++
            }
        })

        state.insert = insert
        setDrag({index: state.index, insert, offset, height: state.height})
    }

    const onPointerMove = (event) => {
        if (selecting !== null) {
            setHovered(rowUnder(event))
            return
        }

        const state = dragState.current
        if (state === null) return

        /*
         * Место вставки считается по прочим строкам, без тащимой: столько из них осталось выше.
         * `DragLayout.layout` ищет то же самое, только через координаты arc, где ось Y смотрит
         * вверх. Строки при этом остаются на своих местах — сдвиг рисуется стилем.
         */
        state.pointerY = event.clientY
        maybeScroll(state)
        applyDrag(state)
    }

    const onPointerUp = (event) => {
        if (selecting !== null) {
            finishTarget(event)
            return
        }

        const state = dragState.current
        if (state === null) return

        dragState.current = null
        stopScrolling()
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
        stopScrolling()
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
 * Кто прокручивается, когда строку тянут к краю.
 *
 * В окне игры это полотно с программой, на странице урока полотно не прокручивается вовсе —
 * едет сама страница. Поэтому ищется ближайший предок, которому есть куда ехать, а если
 * такого нет, берётся окно.
 */
function scrollerFor(list) {
    for (let node = list; node !== null && node !== undefined; node = node.parentElement) {
        const style = getComputedStyle(node)
        const scrolls = /auto|scroll|overlay/.test(style.overflowY)

        if (scrolls && node.scrollHeight > node.clientHeight) return node
    }

    return globalThis
}

const scrollOf = (scroller) => scroller === globalThis
    ? globalThis.scrollY ?? 0
    : scroller.scrollTop

function scrollBy(scroller, delta) {
    if (scroller === globalThis) globalThis.scrollBy(0, delta)
    else scroller.scrollTop += delta
}

/**
 * Прокрутка, пока тащишь строку у края. `LCanvas.act`: если указатель ближе 100 пикселей
 * к краю, полотно едет на 15 пикселей за тик. Те же числа сняты в `metrics.json`.
 */
function scrollNearEdge(scroller, pointerY) {
    if (scroller === null || scroller === undefined) return

    const box = scroller === globalThis
        ? {top: 0, bottom: globalThis.innerHeight ?? 0}
        : scroller.getBoundingClientRect()

    const margin = METRICS.scrollMargin
    const speed = METRICS.scrollSpeed

    if (pointerY - box.top < margin) scrollBy(scroller, -speed)
    else if (box.bottom - pointerY < margin) scrollBy(scroller, speed)
}
