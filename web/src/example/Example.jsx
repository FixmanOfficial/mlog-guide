/**
 * Живой пример для урока.
 *
 * Программа показана так, как её видит игрок: блоками из окна процессора, а не текстом.
 * Курс учит писать в игровом редакторе — значит и примеры должны быть им же. Текстовая
 * запись появится позже, отдельным разговором о том, чего редактор не умеет.
 *
 * Отсюда состав: полотно редактора (`editor`), окно переменных (`game`) и, если он нужен,
 * кусочек карты (`render`). Ни HUD, ни панели строительства, ни перемотки — они бы отвлекали
 * от одной инструкции, ради которой пример стоит на странице.
 *
 * Шаг — одна инструкция, а не тик: по тику ход программы не разглядеть. Мир при шаге стоит;
 * кому нужно время, тот нажимает «пуск».
 *
 * Править можно прямо в блоках, как в игре: поля, выпадающие списки, выбор содержимого,
 * кнопка «добавить». Задание урока в том и состоит, чтобы что-то в них поменять.
 */

import {useEffect, useRef, useState} from 'preact/hooks'

import {Editor, fromText, applyEasings, applyMetrics, applyNinePatches} from '@mlog/editor'
import {Icon} from '@mlog/editor/src/Icon.jsx'
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
import {Variables} from '../game/Variables.jsx'

import '@mlog/editor/src/styles.css'
import './example.css'

/** Пикселей на тайл. Меньше, чем в песочнице: пример стоит в тексте, а не занимает экран. */
const TILE = 28

/** Потолок разового скачка времени, как в игре: `Vars.maxDeltaClient`. */
const MAX_DELTA = 4

/**
 * Номер строки, которую процессор выполнит следующей.
 *
 * Счётчик увеличивается до запуска инструкции, поэтому на паузе он показывает именно
 * следующую, а не только что отработавшую. Выход за границы программы значит «сначала».
 */
function nextIndex(processor) {
    const value = Math.trunc(processor.counter.numval)
    return value >= 0 && value < processor.instructions.length ? value : 0
}

/**
 * @param scene описание сцены — те же данные, что у песочницы и у урока
 * @param world показывать ли карту: у примера про арифметику мира нет вовсе
 * @param tick  сколько тиков прокрутить до первого кадра: пример иногда должен начинаться
 *              с уже наполненного мира, а не с нулевого тика
 * @param allow какие инструкции доступны в меню добавления; по умолчанию все
 */
export function Example({scene: description, world = true, tick = 0, allow = true}) {
    const canvas = useRef(null)
    const stand = useRef(null)

    // Пересборка: «сначала» — это заново собранная сцена и заново собранный редактор
    const [generation, setGeneration] = useState(0)
    const [running, setRunning] = useState(false)
    const [ready, setReady] = useState(false)

    // Меняется, когда пора перечитать значения переменных
    const [beat, setBeat] = useState(0)

    // Текст программы: редактор отдаёт его при каждой правке блока
    const [program, setProgram] = useState(description.processors?.[0]?.program ?? '')

    // Меню добавления живёт в редакторе, а кнопка к нему в игре стоит в нижнем ряду окна
    const [addOpen, setAddOpen] = useState(false)

    // Размеры, девятипатчи и кривые интерфейса игры: без них редактор рисуется на глазок
    useEffect(() => {
        applyEasings()
        applyNinePatches()
        applyMetrics()
    }, [])

    useEffect(() => {
        const scene = createScene(description)

        // Первый процессор берёт текст из редактора: правка переживает и «пуск», и «шаг»
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

    return (
        // not-content — метка Starlight: внутри неё статья не навязывает свои стили,
        // а интерфейсу редактора они ломают раскладку
        <div class="example not-content" data-beat={beat}>
            <div class="example__toolbar">
                <button
                    class="game-button example__button"
                    title={running ? 'Пауза' : 'Пуск'}
                    onClick={() => setRunning(!running)}
                >
                    <Icon name={running ? 'pause' : 'play'} size={20} />
                </button>

                <button
                    class="game-button example__button"
                    title="Одна инструкция"
                    disabled={running}
                    onClick={single}
                >
                    шаг
                </button>

                <button class="game-button example__button" title="Сначала" onClick={reset}>
                    <Icon name="refresh-1" size={20} />
                </button>

                <button
                    class="game-button example__button"
                    title="Добавить инструкцию"
                    onClick={() => setAddOpen(true)}
                >
                    <Icon name="add" size={20} />
                </button>

                <span class="example__tick">
                    тик {ready ? Math.trunc(stand.current.scene.world.tick) : 0}
                </span>
            </div>

            <div class="example__panes">
                <div class="example__editor">
                    <Editor
                        key={generation}
                        initial={fromText(program)}
                        onChange={setProgram}
                        counter={processor === null ? null : nextIndex(processor)}
                        addOpen={addOpen}
                        onAddClose={() => setAddOpen(false)}
                        allow={allow}
                    />
                </div>

                {processor === null ? null : (
                    <div class="example__vars">
                        <Variables processor={processor} beat={beat} />
                    </div>
                )}
            </div>

            {world ? <canvas class="example__world" ref={canvas} /> : null}
        </div>
    )
}
