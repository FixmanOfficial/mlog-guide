import {useState, useLayoutEffect} from 'preact/hooks'

import {assignLanes, curvePoints, laneOffset, STROKE} from './jumps.js'
import {targetIndex} from './program.js'
import {JUMP_COLOR, OUTLINE_COLOR, OUTLINE_WIDTH} from './theme.js'
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

            setRows({centers, starts, width: base.width, height: base.height})
        }

        measure()

        const observer = new ResizeObserver(measure)
        observer.observe(container)
        return () => observer.disconnect()
    }, [statements, containerRef])

    if (rows.centers === undefined || rows.centers.length === 0) return null

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

    if (jumps.length === 0) return null

    const narrow = rows.width < 600
    const widest = Math.max(...jumps.map(jump => laneOffset(jump.lane, narrow)))

    return (
        <svg
            class="jumps"
            width={widest + STROKE * 2}
            height={rows.height}
            style={{left: `${rows.width}px`}}
        >
            {jumps.map(jump => {
                const start = rows.starts[jump.from]
                const y2 = rows.centers[jump.to]
                if (start === undefined || y2 === undefined) return null

                const points = curvePoints(start.x, start.y, 0, y2, jump.lane, narrow)
                const line = points.map(([px, py]) => `${px},${py}`).join(' ')
                const head = arrowHead(y2)

                return (
                    <g key={`${jump.from}-${jump.to}`}>
                        {/* Тёмная подложка даёт обводку, как у спрайтов игры */}
                        <polyline points={line} fill="none" stroke={OUTLINE_COLOR}
                            stroke-width={STROKE + OUTLINE_WIDTH * 2} stroke-linejoin="miter" />
                        <polyline points={line} fill="none" stroke={JUMP_COLOR}
                            stroke-width={STROKE} stroke-linejoin="miter" />
                        {/* Наконечник у точки входа, повёрнут к коду — Tex.logicNode в игре */}
                        <polygon points={head} fill={JUMP_COLOR}
                            stroke={OUTLINE_COLOR} stroke-width={OUTLINE_WIDTH} stroke-linejoin="miter" />
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
