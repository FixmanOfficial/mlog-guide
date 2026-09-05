/**
 * Песочница: редактор слева, мир и дисплей справа, переменные снизу.
 *
 * Остров склеивает три модуля, которые друг о друге не знают: `editor` собирает программу,
 * `core` её исполняет, `render` рисует мир и дисплей. Порядок кадра такой же, как в игре:
 * сначала тик мира, потом отрисовка — и дисплей вычерпывает очередь команд именно на ней.
 */

import {useEffect, useRef, useState} from 'preact/hooks'

import {Editor, createStatement, toText} from '@mlog/editor'
import {DisplayView} from '@mlog/render/src/display.js'
import {WorldView} from '@mlog/render/src/world.js'

// ?url обязателен: без него Astro пропускает картинку через свой конвейер и отдаёт объект
import atlasUrl from '@mlog/editor/assets/content.png?url'
import logicFontUrl from '@mlog/render/assets/logic.ttf'
import sprites from '@mlog/core/data/sprites.json'

import {createScene, attachProcessor} from './scene.js'
import {Variables} from './Variables.jsx'

/** Тайл мира в пикселях. Всё остальное рендер считает от него сам. */
const TILE = 40

/** Сколько тиков проходит между обновлениями таблицы переменных. LogicDialog: period 15 */
const VARS_PERIOD = 15

const withParams = (opcode, params) => {
    const statement = createStatement(opcode)
    return {...statement, params: {...statement.params, ...params}}
}

/** Программа, с которой открывается песочница: тут задействован каждый подключённый блок. */
const STARTER = [
    withParams('sensor', {to: 'открыт', type: '@enabled', from: 'switch1'}),
    withParams('control', {type: 'enabled', target: 'door1', p1: 'открыт'}),
    withParams('op', {op: 'add', dest: 'шаг', a: 'шаг', b: '1'}),
    withParams('op', {op: 'mod', dest: 'x', a: 'шаг', b: '68'}),
    withParams('draw', {type: 'clear', x: '0', y: '0', p1: '0'}),
    withParams('draw', {type: 'color', x: '255', y: '210', p1: '120', p2: '255'}),
    withParams('draw', {type: 'rect', x: 'x', y: '34', p1: '12', p2: '12'}),
    withParams('drawflush', {target: 'display1'}),
    withParams('print', {value: '"шаг: "'}),
    withParams('print', {value: 'шаг'}),
    withParams('printflush', {target: 'message1'}),
    withParams('write', {input: 'шаг', target: 'cell1', address: '0'})
]

export function Sandbox() {
    const worldCanvas = useRef(null)
    const displayCanvas = useRef(null)
    const stand = useRef(null)

    const [running, setRunning] = useState(true)
    const [speed, setSpeed] = useState(1)
    const [ready, setReady] = useState(false)
    const [beat, setBeat] = useState(0)
    const [errors, setErrors] = useState([])

    // Мир, процессор и виды живут вне состояния: перерисовка их не касается
    useEffect(() => {
        const scene = createScene()
        const processor = attachProcessor(scene, toText(STARTER))

        const atlas = new Image()
        atlas.src = atlasUrl

        const displayView = new DisplayView(displayCanvas.current, {
            size: scene.display.spec.displaySize,
            pixelRatio: 4,
            atlas,
            sprites
        })

        const worldView = new WorldView(worldCanvas.current, {
            world: scene.world,
            tile: TILE,
            atlas,
            sprites,
            font: 'Mindustry',
            displays: new Map([[scene.display, displayView.canvas]])
        })

        stand.current = {scene, processor, worldView, displayView}
        setErrors(processor.diagnostics)

        // Шрифт дисплея грузит страница: рендер только называет семейство
        const font = new FontFace('MlogLogic', `url(${logicFontUrl})`)
        document.fonts.add(font)

        const redraw = () => {
            displayView.draw(scene.display)
            worldView.draw({selected: scene.processorBuilding})
        }

        atlas.addEventListener('load', redraw)
        font.load().then(redraw, () => {})
        redraw()
        setReady(true)
    }, [])

    // Ход времени. Один кадр браузера — `speed` игровых тиков
    useEffect(() => {
        if (!running || !ready) return

        let frame = 0
        const step = () => {
            const {scene, worldView, displayView} = stand.current

            for (let i = 0; i < speed; i++) scene.world.step()

            displayView.draw(scene.display)
            worldView.draw({selected: scene.processorBuilding})

            if (scene.world.tick % VARS_PERIOD < speed) setBeat(scene.world.tick)

            frame = requestAnimationFrame(step)
        }

        frame = requestAnimationFrame(step)
        return () => cancelAnimationFrame(frame)
    }, [running, speed, ready])

    const rebuild = (text) => {
        if (stand.current === null) return

        const {scene, displayView, worldView} = stand.current
        const processor = attachProcessor(scene, text)

        stand.current.processor = processor
        scene.world.tick = 0
        displayView.reset()
        displayView.draw(scene.display)
        worldView.draw({selected: scene.processorBuilding})

        setErrors(processor.diagnostics)
        setBeat(beat + 1)
    }

    /** Шаг — одна инструкция, а не тик: именно так на программу и смотрят. */
    const stepInstruction = () => {
        const {scene, processor, displayView, worldView} = stand.current

        setRunning(false)
        processor.step()
        displayView.draw(scene.display)
        worldView.draw({selected: scene.processorBuilding})
        setBeat(scene.world.tick + Math.random())
    }

    const stepTick = () => {
        const {scene, displayView, worldView} = stand.current

        setRunning(false)
        scene.world.step()
        displayView.draw(scene.display)
        worldView.draw({selected: scene.processorBuilding})
        setBeat(scene.world.tick)
    }

    const reset = () => {
        const {scene, processor, displayView, worldView} = stand.current

        processor.reset()
        scene.world.tick = 0
        displayView.reset()
        displayView.draw(scene.display)
        worldView.draw({selected: scene.processorBuilding})
        setBeat(beat + 1)
    }

    // Тумблером щёлкают мышью: sensor должен это увидеть
    const clickWorld = (event) => {
        const {scene, worldView} = stand.current
        const box = worldView.canvas.getBoundingClientRect()
        const spot = worldView.at(event.clientX - box.left, event.clientY - box.top)
        const building = scene.world.at(spot.x, spot.y)

        if (building === scene.toggle) {
            building.enabled = !building.enabled
            worldView.draw({selected: scene.processorBuilding})
        }
    }

    const processor = stand.current?.processor ?? null
    const message = stand.current?.scene.message.message ?? ''
    const tick = stand.current?.scene.world.tick ?? 0

    return (
        <div class="sandbox" data-beat={beat}>
            <div class="sandbox__editor">
                <Editor initial={STARTER} onChange={rebuild} />
            </div>

            <div class="sandbox__side">
                <div class="sandbox__bar">
                    <button class="sandbox__button" onClick={() => setRunning(!running)}>
                        {running ? '⏸ пауза' : '▶ пуск'}
                    </button>
                    <button class="sandbox__button" onClick={stepInstruction}>инструкция</button>
                    <button class="sandbox__button" onClick={stepTick}>тик</button>
                    <button class="sandbox__button" onClick={reset}>сброс</button>

                    <label class="sandbox__speed">
                        скорость
                        <select value={speed} onChange={(event) => setSpeed(Number(event.currentTarget.value))}>
                            <option value="1">×1</option>
                            <option value="2">×2</option>
                            <option value="8">×8</option>
                        </select>
                    </label>
                </div>

                <canvas class="sandbox__world" ref={worldCanvas} onClick={clickWorld} />

                <div class="sandbox__row">
                    <div>
                        <div class="sandbox__title">Дисплей</div>
                        <canvas class="sandbox__display" ref={displayCanvas} />
                    </div>
                    <div class="sandbox__panel">
                        <div class="sandbox__title">Блок сообщений</div>
                        <div class="sandbox__message">{message || '—'}</div>
                        <div class="sandbox__meta">тик {tick}</div>
                    </div>
                </div>

                <div class="sandbox__title">Переменные</div>
                {processor !== null && <Variables processor={processor} key={beat} />}

                {errors.length > 0 && (
                    <div class="sandbox__errors">
                        {errors.map(error => (
                            <div key={`${error.line}-${error.code}`}>строка {error.line + 1}: {error.code}</div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
