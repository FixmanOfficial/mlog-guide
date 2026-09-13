import {useState, useLayoutEffect, useRef} from 'preact/hooks'

import {assignLanes, curvePoints, gutterWidth, STROKE} from './jumps.js'
import {targetIndex} from './program.js'
import {JUMP_COLOR} from './theme.js'
import {NODE, nodePoints} from './JumpNode.jsx'

/**
 * Стрелки переходов справа от кода.
 *
 * Геометрию считает jumps.js — здесь только измерение строк и отрисовка. Рисуем в SVG,
 * а не отдельными узлами на стрелку: линий бывает много, и каждая лишняя обёртка в DOM
 * стоит дороже, чем весь путь целиком.
 *
 * Пока цель перехода выбирают, стрелка тянется к строке под курсором: в игре `JumpCurve.act`
 * берёт `canvas.hovered`, если цель ещё не задана. Отпустили мимо строк — цели нет.
 */
export function JumpArrows({statements, containerRef, selecting = null, hovered = null}) {
    const [rows, setRows] = useState([])

    useLayoutEffect(() => {
        const container = containerRef.current
        if (container === null) return

        const measure = () => {
            const base = container.getBoundingClientRect()

            /*
             * Стрелка приходит в середину строки ЦЕЛИКОМ, а не в её шапку: в игре точка входа
             * задаётся как `t.set(hover.getWidth(), hover.getHeight() / 2f)` на самом элементе
             * инструкции. LCanvas.JumpCurve.act
             */
            const centers = Array.from(container.querySelectorAll('.statement'))
                .map(row => {
                    const box = row.getBoundingClientRect()
                    return box.top - base.top + box.height / 2
                })

            /*
             * А выходит она из середины кнопки перехода, которая сидит в теле строки справа.
             * Если кнопки нет, берём середину строки.
             */
            const starts = Array.from(container.querySelectorAll('.statement')).map((row, index) => {
                const button = row.querySelector('.jump-target')
                if (button === null) return {y: centers[index], x: 0}

                const box = button.getBoundingClientRect()
                return {
                    y: box.top - base.top + box.height / 2,
                    // Начало отсчёта у полотна стрелок — правый край списка, поэтому
                    // до кнопки, сидящей внутри строки, смещение отрицательное
                    x: box.left - base.right + box.width / 2
                }
            })

            /*
             * `space` — ширина всего редактора вместе с полями, а не списка. Она не зависит
             * от поля под стрелки, которое ставится ниже, поэтому раскладка не может
             * заколебаться: узкая она или широкая, решается один раз.
             */
            const editor = container.parentElement ?? container

            setRows({
                centers,
                starts,
                width: base.width,
                height: base.height,
                space: editor.clientWidth
            })
        }

        measure()

        const observer = new ResizeObserver(measure)
        observer.observe(container)
        return () => observer.disconnect()
    }, [statements, containerRef])

    const selectingIndex = selecting === null
        ? -1
        : statements.findIndex(statement => statement.id === selecting)

    const jumps = assignLanes(statements
        .map((statement, index) => ({
            from: index,
            // Выбираемый переход тянется к строке под курсором, а не к своей цели
            to: index === selectingIndex
                ? (hovered ?? -1)
                : statement.opcode === 'jump' ? targetIndex(statements, statement) : -1
        }))
        .filter(jump => Number.isInteger(jump.to) && jump.to >= 0 && jump.to < statements.length))

    const narrow = (rows.space ?? rows.width ?? 0) < 600

    /*
     * Поле справа под стрелки. Считается той же меркой, что и ширина полотна, — иначе
     * самая дальняя стрелка обрезалась бы краем примера.
     *
     * Ширина строк от него не пляшет. У программы с переходом поле есть всегда, даже пока
     * цель не выбрана, — иначе строки менялись бы в ширине от того, задана она или нет.
     * А пока цель перетаскивают, поле ещё и не сужается: в игре нажатие сбрасывает старую
     * цель, стрелок на миг не остаётся вовсе, и всё поехало бы прямо под пальцем.
     */
    const least = statements.some(statement => statement.opcode === 'jump')
        ? gutterWidth([{lane: 0}], narrow)
        : gutterWidth([], narrow)

    const held = useRef(least)
    const gutter = Math.max(least, gutterWidth(jumps, narrow), selecting === null ? 0 : held.current)

    if (selecting === null) held.current = gutter

    useLayoutEffect(() => {
        const editor = containerRef.current?.parentElement
        if (editor === null || editor === undefined) return

        editor.style.setProperty('--jump-gutter', `${gutter}px`)
        return () => editor.style.removeProperty('--jump-gutter')
    }, [containerRef, gutter])

    if (rows.centers === undefined || rows.centers.length === 0) return null
    if (jumps.length === 0) return null

    return (
        <svg class="jumps" width={gutter} height={rows.height}>
            {jumps.map(jump => {
                const start = rows.starts[jump.from]
                const y2 = rows.centers[jump.to]
                if (start === undefined || y2 === undefined) return null

                const points = curvePoints(start.x, start.y, 0, y2, jump.lane, narrow)
                const line = points.map(([px, py]) => `${px},${py}`).join(' ')
                const head = arrowHead(y2)

                return (
                    <g key={`${jump.from}-${jump.to}`}>
                        {/*
                          * Линия и наконечник рисуются без обводки: в игре это `Lines.stroke(4)`
                          * цветом кнопки и спрайт `logic-node`, у которого все непрозрачные
                          * пиксели белые. LCanvas.JumpCurve.drawCurve
                          */}
                        <polyline points={line} fill="none" stroke={JUMP_COLOR}
                            stroke-width={STROKE} stroke-linejoin="miter" />
                        <polygon points={head} fill={JUMP_COLOR} />
                    </g>
                )
            })}
        </svg>
    )
}

/**
 * Наконечник у цели — тот же узел, что и кнопка на строке с переходом, только зеркальный.
 *
 * В игре: Tex.logicNode.draw(x + s * 0.75, y - s / 2, -s, s) при s = 30. Отрицательная ширина
 * зеркалит спрайт, поэтому остриё смотрит на код. Пересчёт координат спрайта в эту рамку даёт
 * остриё примерно на 4.7 пикселя ЗА точкой входа, внутрь строки, и плоское основание
 * на 10.3 после неё.
 */
function arrowHead(y) {
    const right = 10.3
    const left = right - NODE.width

    const top = y - NODE.height / 2

    return nodePoints(NODE.width, NODE.height, NODE.base, true)
        .map(([x, py]) => `${left + x},${top + py}`)
        .join(' ')
}
