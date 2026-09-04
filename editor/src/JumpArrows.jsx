import {useState, useLayoutEffect} from 'preact/hooks'

import {assignLanes, curvePoints, laneOffset, STROKE} from './jumps.js'
import {JUMP_COLOR, OUTLINE_COLOR, OUTLINE_WIDTH} from './theme.js'

/**
 * Стрелки переходов справа от кода.
 *
 * Геометрию считает jumps.js — здесь только измерение строк и отрисовка. Рисуем в SVG,
 * а не отдельными узлами на стрелку: линий бывает много, и каждая лишняя обёртка в DOM
 * стоит дороже, чем весь путь целиком.
 */
export function JumpArrows({statements, containerRef}) {
    const [rows, setRows] = useState([])

    useLayoutEffect(() => {
        const container = containerRef.current
        if (container === null) return

        const measure = () => {
            const base = container.getBoundingClientRect()

            // Стрелка выходит из середины шапки: там же, где в игре сидит её кнопка
            const centers = Array.from(container.querySelectorAll('.statement__header'))
                .map(header => {
                    const box = header.getBoundingClientRect()
                    return box.top - base.top + box.height / 2
                })

            setRows({centers, width: base.width, height: base.height})
        }

        measure()

        const observer = new ResizeObserver(measure)
        observer.observe(container)
        return () => observer.disconnect()
    }, [statements, containerRef])

    if (rows.centers === undefined || rows.centers.length === 0) return null

    const jumps = assignLanes(statements
        .map((statement, index) => ({
            from: index,
            to: statement.opcode === 'jump' ? Number.parseInt(statement.params.destIndex, 10) : NaN
        }))
        .filter(jump => Number.isInteger(jump.to) && jump.to < statements.length))

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
                const y = rows.centers[jump.from]
                const y2 = rows.centers[jump.to]
                if (y === undefined || y2 === undefined) return null

                const points = curvePoints(0, y, 0, y2, jump.lane, narrow)
                const line = points.map(([px, py]) => `${px},${py}`).join(' ')
                const head = `0,${y2} 11,${y2 - 7} 11,${y2 + 7}`

                return (
                    <g key={`${jump.from}-${jump.to}`}>
                        {/* Тёмная подложка даёт обводку, как у спрайтов игры */}
                        <polyline points={line} fill="none" stroke={OUTLINE_COLOR}
                            stroke-width={STROKE + OUTLINE_WIDTH * 2} stroke-linejoin="miter" />
                        <polyline points={line} fill="none" stroke={JUMP_COLOR}
                            stroke-width={STROKE} stroke-linejoin="miter" />
                        {/* Наконечник у точки входа, повёрнут к коду — Tex.logicNode в игре */}
                        <polygon points={head} fill={JUMP_COLOR}
                            stroke={OUTLINE_COLOR} stroke-width={OUTLINE_WIDTH} />
                    </g>
                )
            })}
        </svg>
    )
}
