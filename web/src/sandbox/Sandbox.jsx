/**
 * Песочница: редактор слева, мир и дисплей справа, переменные снизу.
 *
 * Остров склеивает три модуля, которые друг о друге не знают: `editor` собирает программу,
 * `core` её исполняет, `render` рисует мир и дисплей. Порядок кадра такой же, как в игре:
 * сначала тик мира, потом отрисовка — и дисплей вычерпывает очередь команд именно на ней.
 */

import {useEffect, useRef, useState} from 'preact/hooks'

import {Editor, GlobalsDialog, createStatement, toText} from '@mlog/editor'
import {Icon} from '@mlog/editor/src/Icon.jsx'
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

/** Двойная стрелка перематывает на секунду — 60 тиков. */
const SECOND = 60

/** Подпись скорости: степень двойки от 1/256 до 256. */
const speedLabel = (power) => power >= 0 ? `×${2 ** power}` : `×1/${2 ** -power}`

/**
 * Через сколько кадров таблица переменных перечитывает значения. `LogicDialog`: `period = 15f`,
 * а копится в него `Time.delta`, то есть счёт идёт по кадрам, а не по игровым тикам.
 *
 * Выборка редкая, и это заметно: программа из 12 инструкций при 8 за тик каждые 15 кадров
 * возвращает счётчик в одно и то же место, поэтому @counter выглядит застывшим. В игре ровно
 * так же — потому и оставлено. Видно, что значение живое, по вспышке при изменении.
 */
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

    // Скорость степенями двойки от 1/256 до 256, как в моде time control:
    // в игре такого нет, но без этого пошаговый разбор превращается в пытку
    const [power, setPower] = useState(0)
    const [ready, setReady] = useState(false)
    const [globalsOpen, setGlobalsOpen] = useState(false)
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

        // decode вместо события load: картинка из кеша успевает загрузиться раньше подписки,
        // и тогда события не будет вовсе — а мир останется без иконок до первого кадра
        atlas.decode().then(redraw, () => {})
        font.load().then(redraw, () => {})
        redraw()
        setReady(true)
    }, [])

    // Ход времени. Один кадр браузера — `speed` игровых тиков
    useEffect(() => {
        if (!running || !ready) return

        let frame = 0
        let counter = 0
        let pending = 0

        const speed = 2 ** power

        const step = () => {
            const {scene, worldView, displayView} = stand.current

            // Дробная скорость копится: при 1/256 тик случается раз в 256 кадров
            pending += speed
            while (pending >= 1) {
                scene.world.step()
                // Дисплей вычерпывает очередь на каждом тике, как при отрисовке кадра в игре
                displayView.draw(scene.display)
                pending--
            }

            worldView.draw({selected: scene.processorBuilding})

            // Значения переменных перечитываются раз в 15 кадров, как в игре
            if (++counter >= VARS_PERIOD) {
                counter = 0
                setBeat(scene.world.tick)
            }

            frame = requestAnimationFrame(step)
        }

        frame = requestAnimationFrame(step)
        return () => cancelAnimationFrame(frame)
    }, [running, power, ready])

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

    const redraw = () => {
        const {scene, displayView, worldView} = stand.current

        displayView.draw(scene.display)
        worldView.draw({selected: scene.processorBuilding})
        setBeat(scene.world.tick + Math.random())
    }

    /** Шаг — одна инструкция, а не тик: именно так на программу и смотрят. */
    const stepInstruction = () => {
        setRunning(false)
        stand.current.processor.step()
        redraw()
    }

    /** Прокрутка вперёд. Дисплей вычерпывается на каждом тике, как при отрисовке кадра. */
    const forward = (ticks) => {
        const {scene, displayView} = stand.current

        setRunning(false)
        for (let i = 0; i < ticks; i++) {
            scene.world.step()
            displayView.draw(scene.display)
        }
        redraw()
    }

    /**
     * Назад. Истории у нас нет и не нужно: симуляция детерминированная, поэтому состояние
     * на тике N — это сброс и N шагов вперёд.
     */
    const rewind = (ticks) => {
        const {scene, displayView} = stand.current
        const target = Math.max(0, scene.world.tick - ticks)

        setRunning(false)
        scene.world.reset()
        displayView.reset()

        for (let i = 0; i < target; i++) {
            scene.world.step()
            displayView.draw(scene.display)
        }
        redraw()
    }

    const reset = () => {
        const {scene, displayView} = stand.current

        setRunning(false)
        scene.world.reset()
        displayView.reset()
        redraw()
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

    // not-content — метка Starlight: внутри неё статья не навязывает свои отступы и стили,
    // а интерфейсу редактора они ломают раскладку
    return (
        <div class="sandbox not-content" data-beat={beat}>
            <div class="sandbox__editor">
                <Editor initial={STARTER} onChange={rebuild} />
            </div>

            <div class="sandbox__side">
                <div class="sandbox__bar">
                    <button class="sandbox__button" title="Сбросить мир" onClick={reset}>
                        <Icon name="refresh-1" size={20} />
                    </button>

                    <button class="sandbox__button" title="Назад на секунду" onClick={() => rewind(SECOND)}>
                        <Icon name="left" size={20} /><Icon name="left" size={20} />
                    </button>
                    <button class="sandbox__button" title="Назад на тик" onClick={() => rewind(1)}>
                        <Icon name="left" size={20} />
                    </button>

                    <button
                        class="sandbox__button"
                        title={running ? 'Пауза' : 'Пуск'}
                        onClick={() => setRunning(!running)}
                    >
                        <Icon name={running ? 'pause' : 'play'} size={20} />
                    </button>

                    <button class="sandbox__button" title="Вперёд на тик" onClick={() => forward(1)}>
                        <Icon name="right" size={20} />
                    </button>
                    <button class="sandbox__button" title="Вперёд на секунду" onClick={() => forward(SECOND)}>
                        <Icon name="right" size={20} /><Icon name="right" size={20} />
                    </button>

                    <button class="sandbox__button" onClick={stepInstruction}>инструкция</button>

                    <label class="sandbox__speed" title="Скорость времени">
                        <input
                            type="range"
                            min={-8}
                            max={8}
                            step={1}
                            value={power}
                            onInput={(event) => setPower(Number(event.currentTarget.value))}
                        />
                        <span class="sandbox__speed-value">{speedLabel(power)}</span>
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

                <div class="sandbox__title sandbox__title--row">
                    <span>Переменные</span>
                    {/* В игре эта кнопка стоит в самом окне переменных: LogicDialog, "@logic.globals" */}
                    <button class="sandbox__link" onClick={() => setGlobalsOpen(true)}>
                        <Icon name="list" size={16} />
                        встроенные
                    </button>
                </div>
                {processor !== null && <Variables processor={processor} beat={beat} />}

                {globalsOpen && <GlobalsDialog onClose={() => setGlobalsOpen(false)} />}

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
