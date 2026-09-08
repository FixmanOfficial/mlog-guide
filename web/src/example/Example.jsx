/**
 * Живой пример для урока.
 *
 * Не песочница: ни миникарты, ни панели строительства, ни перемотки. Программа, кнопка
 * «шаг», таблица переменных и, если он нужен, кусочек мира — то, чем объясняют инструкцию,
 * и ничего сверх.
 *
 * Шаг — одна инструкция, а не тик. Тик у микропроцессора это две инструкции, у гипера
 * двадцать пять, и разглядеть по ним ход нельзя. Мир при шаге стоит: пример объясняет
 * программу, а не время. Кому нужно время, тот нажимает «пуск».
 *
 * Программу можно править: задания уроков в том и состоят, чтобы поменять строку и посмотреть,
 * что изменилось. В режиме правки подсветки следующей строки нет — она живёт на разметке,
 * а поле ввода разметку не держит; поэтому режима два, и переключаются они кнопкой.
 */

import {useEffect, useRef, useState} from 'preact/hooks'

import {valueText, typeName, TYPE_COLORS} from '@mlog/editor/src/variables.js'
import {WorldView} from '@mlog/render/src/world.js'

// ?url обязателен: иначе Astro пропускает картинку через свой конвейер и отдаёт объект
import atlasUrl from '@mlog/editor/assets/content.png?url'
import blocksUrl from '@mlog/render/assets/blocks.png?url'
import unitsUrl from '@mlog/render/assets/units.png?url'
import terrainUrl from '@mlog/render/assets/terrain.png?url'
import sprites from '@mlog/core/data/sprites.json'
import blockSprites from '@mlog/core/data/block-sprites.json'
import unitSprites from '@mlog/core/data/unit-sprites.json'
import terrainSprites from '@mlog/core/data/terrain-sprites.json'
import teams from '@mlog/core/data/teams.json'

import {createScene, attachProcessor} from '../sandbox/scene.js'

import './example.css'

/** Пикселей на тайл. Меньше, чем в песочнице: пример стоит в тексте, а не занимает экран. */
const TILE = 28

/** Потолок разового скачка времени, как в игре: `Vars.maxDeltaClient`. */
const MAX_DELTA = 4

/**
 * Строка, которую процессор выполнит следующей, считая с нуля — как их нумерует сборщик.
 *
 * Счётчик увеличивается до запуска инструкции, поэтому на паузе он показывает именно
 * следующую, а не только что отработавшую. Выход за границы программы значит «сначала».
 */
function nextLine(processor) {
    const value = Math.trunc(processor.counter.numval)
    const index = value >= 0 && value < processor.instructions.length ? value : 0

    return processor.instructions[index]?.line ?? 0
}

/**
 * @param scene описание сцены — те же данные, что у песочницы и у урока
 * @param world показывать ли карту: у примера про арифметику мира нет вовсе
 * @param watch какие переменные показывать и в каком порядке; по умолчанию все
 * @param tick  сколько тиков прокрутить до первого кадра: пример иногда должен начинаться
 *              с уже наполненного мира, а не с нулевого тика
 * @param editable можно ли править программу. По умолчанию можно: без этого задание урока
 *              выполнять негде
 */
export function Example({scene: description, world = true, watch = null, tick = 0,
    editable = true}) {
    const canvas = useRef(null)
    const stand = useRef(null)

    // Пересборка: «сброс» — это заново собранная сцена, а не откат состояния
    const [generation, setGeneration] = useState(0)
    const [running, setRunning] = useState(false)
    const [ready, setReady] = useState(false)

    // Меняется, когда пора перечитать значения переменных
    const [beat, setBeat] = useState(0)

    // Текст программы и режим правки: в правке вместо разметки поле ввода
    const [program, setProgram] = useState(description.processors?.[0]?.program ?? '')
    const [editing, setEditing] = useState(false)

    useEffect(() => {
        const scene = createScene(description)

        // Первый процессор берёт текст из поля: правка переживает и «пуск», и «шаг»
        scene.processors.forEach((entry, index) => {
            attachProcessor(scene, entry, index === 0 ? program : entry.program)
        })

        for (let i = 0; i < tick; i++) scene.world.step()

        stand.current = {scene, view: null}

        if (world) {
            const images = [atlasUrl, blocksUrl, unitsUrl, terrainUrl].map(url => {
                const image = new Image()
                image.src = url
                return image
            })

            const [atlas, blocks, units, terrain] = images

            const view = new WorldView(canvas.current, {
                world: scene.world,
                tile: TILE,
                blocks, blockSprites, units, unitSprites, terrain, terrainSprites,
                teams, atlas, sprites,
                font: 'Mindustry',
                displays: new Map()
            })

            stand.current.view = view

            // decode вместо события load: картинка из кеша успевает загрузиться раньше подписки
            const draw = () => view.draw({configured: null, cursor: null})
            for (const image of images) image.decode().then(draw, () => {})
            draw()
        }

        setReady(true)
        setBeat(beat => beat + 1)

        return () => setReady(false)
    }, [generation])

    /*
     * Правка программы. Сцена при этом не пересобирается: мир, картинки и холст остаются
     * теми же, меняется только машина первого процессора — как в игре, где программу
     * загружают в стоящий блок.
     */
    useEffect(() => {
        if (!ready) return

        const {scene, view} = stand.current
        const entry = scene.processors[0]
        if (entry === undefined) return

        attachProcessor(scene, entry, program)
        view?.draw({configured: null, cursor: null})
        setBeat(beat => beat + 1)
    }, [program, ready])

    // Ход времени. Пример идёт с обычной скоростью игры: замедлять — дело шага
    useEffect(() => {
        if (!running || !ready) return

        let frame = 0
        let last = performance.now()

        const step = (time) => {
            const {scene, view} = stand.current
            const delta = Math.min((time - last) / 1000 * 60, MAX_DELTA)
            last = time

            scene.world.step(delta)
            view?.draw({configured: null, cursor: null})
            setBeat(beat => beat + 1)

            frame = requestAnimationFrame(step)
        }

        frame = requestAnimationFrame(step)
        return () => cancelAnimationFrame(frame)
    }, [running, ready])

    const processor = ready ? stand.current.scene.processors[0]?.building.processor ?? null : null
    const lines = program.split('\n')
    const current = processor === null ? 0 : nextLine(processor)

    const single = () => {
        processor?.step()
        stand.current.view?.draw({configured: null, cursor: null})
        setBeat(beat => beat + 1)
    }

    const reset = () => {
        setRunning(false)
        setProgram(description.processors?.[0]?.program ?? '')
        setGeneration(generation => generation + 1)
    }

    const rows = processor === null ? [] : [...processor.vars.values()]
        .filter(variable => !variable.constant)
        .filter(variable => watch === null || watch.includes(variable.name))

    // Порядок: сначала те, что просил урок, и в его порядке — так читается сверху вниз
    if (watch !== null) rows.sort((a, b) => watch.indexOf(a.name) - watch.indexOf(b.name))

    return (
        <div class="example" data-beat={beat}>
            <div class="example__toolbar">
                <button class="example__button" onClick={single} disabled={running}>Шаг</button>
                <button class="example__button" onClick={() => setRunning(!running)}>
                    {running ? 'Пауза' : 'Пуск'}
                </button>
                <button class="example__button" onClick={reset}>Сброс</button>
                {editable ? (
                    <button class="example__button" onClick={() => setEditing(!editing)}>
                        {editing ? 'Готово' : 'Править'}
                    </button>
                ) : null}
                <span class="example__tick">
                    тик {ready ? Math.trunc(stand.current.scene.world.tick) : 0}
                </span>
            </div>

            <div class="example__panes">
                {editing ? (
                    <textarea
                        class="example__editor"
                        spellcheck={false}
                        rows={Math.max(lines.length + 1, 4)}
                        value={program}
                        onInput={event => {
                            setRunning(false)
                            setProgram(event.currentTarget.value)
                        }}
                    />
                ) : (
                    <ol class="example__code">
                        {lines.map((line, index) => (
                            <li class={index === current
                                ? 'example__line example__line--next'
                                : 'example__line'}>
                                <code>{line === '' ? ' ' : line}</code>
                            </li>
                        ))}
                    </ol>
                )}

                <table class="example__vars">
                    <tbody>
                        {rows.map(variable => (
                            <tr key={variable.name}>
                                <td class="example__name">{variable.name}</td>
                                <td class="example__value">{valueText(variable)}</td>
                                <td class="example__type" style={{color: TYPE_COLORS[typeName(variable)]}}>
                                    {typeName(variable)}
                                </td>
                            </tr>
                        ))}
                        {rows.length === 0 ? (
                            <tr><td class="example__empty" colspan="3">переменных пока нет</td></tr>
                        ) : null}
                    </tbody>
                </table>
            </div>

            {world ? <canvas class="example__world" ref={canvas} /> : null}
        </div>
    )
}
