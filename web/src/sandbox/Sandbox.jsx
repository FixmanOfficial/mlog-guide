/**
 * Песочница: сцена главная, редактор открывается щелчком по процессору — как в игре.
 *
 * Остров склеивает три модуля, которые друг о друге не знают: `core` исполняет, `render`
 * рисует мир и дисплей, `editor` правит программу. Порядок кадра такой же, как в игре:
 * сначала тик мира, потом отрисовка — и дисплей вычерпывает очередь команд именно на ней.
 */

import {useEffect, useRef, useState} from 'preact/hooks'

import {GlobalsDialog, LogicDialog, toText} from '@mlog/editor'
import {Icon} from '@mlog/editor/src/Icon.jsx'
import {DisplayView} from '@mlog/render/src/display.js'
import {WorldView} from '@mlog/render/src/world.js'

// ?url обязателен: без него Astro пропускает картинку через свой конвейер и отдаёт объект
import atlasUrl from '@mlog/editor/assets/content.png?url'
import logicFontUrl from '@mlog/render/assets/logic.ttf'
import sprites from '@mlog/core/data/sprites.json'

import {createScene, attachProcessor} from './scene.js'
import {PAINTER, COUNTER} from './programs.js'
import {Variables} from './Variables.jsx'

/** Тайл мира в пикселях. Всё остальное рендер считает от него сам. */
const TILE = 40

/** Двойная стрелка перематывает на секунду — 60 тиков. */
const SECOND = 60

/**
 * Через сколько кадров таблица переменных перечитывает значения. `LogicDialog`: `period = 15f`,
 * а копится в него `Time.delta`, то есть счёт идёт по кадрам, а не по игровым тикам.
 */
const VARS_PERIOD = 15

/** Подпись скорости: степень двойки от 1/256 до 256. */
const speedLabel = (power) => power >= 0 ? `×${2 ** power}` : `×1/${2 ** -power}`

export function Sandbox() {
    const worldCanvas = useRef(null)
    const displayCanvas = useRef(null)
    const stand = useRef(null)

    const [running, setRunning] = useState(true)

    // Скорость степенями двойки от 1/256 до 256, как в моде time control:
    // в игре такого нет, но без этого пошаговый разбор превращается в пытку
    const [power, setPower] = useState(0)

    const [ready, setReady] = useState(false)
    const [beat, setBeat] = useState(0)
    const [selected, setSelected] = useState(0)
    const [editing, setEditing] = useState(null)
    const [globalsOpen, setGlobalsOpen] = useState(false)

    /** Выбранный процессор: его связи подсвечены в мире, его переменные в таблице. */
    const current = () => stand.current.scene.processors[selected]

    // Мир, процессоры и виды живут вне состояния: перерисовка их не касается
    useEffect(() => {
        const scene = createScene()

        scene.processors[0].program = PAINTER
        scene.processors[1].program = COUNTER
        for (const entry of scene.processors) attachProcessor(scene, entry, toText(entry.program))

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

        stand.current = {scene, worldView, displayView}

        // Шрифт дисплея грузит страница: рендер только называет семейство
        const font = new FontFace('MlogLogic', `url(${logicFontUrl})`)
        document.fonts.add(font)

        const first = () => {
            displayView.draw(scene.display)
            worldView.draw({selected: scene.processors[0].building})
        }

        // decode вместо события load: картинка из кеша успевает загрузиться раньше подписки,
        // и тогда события не будет вовсе — а мир останется без иконок до первого кадра
        atlas.decode().then(first, () => {})
        font.load().then(first, () => {})
        first()
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

            worldView.draw({selected: current().building})

            // Значения переменных перечитываются раз в 15 кадров, как в игре
            if (++counter >= VARS_PERIOD) {
                counter = 0
                setBeat(scene.world.tick)
            }

            frame = requestAnimationFrame(step)
        }

        frame = requestAnimationFrame(step)
        return () => cancelAnimationFrame(frame)
    }, [running, power, ready, selected])

    const redraw = () => {
        const {scene, displayView, worldView} = stand.current

        displayView.draw(scene.display)
        worldView.draw({selected: current().building})
        setBeat(scene.world.tick + Math.random())
    }

    /** Программа поменялась: пересобираем именно этот процессор, остальные не трогаем. */
    const rebuild = (entry) => (text, statements) => {
        entry.program = statements
        attachProcessor(stand.current.scene, entry, text)
        redraw()
    }

    /** Шаг — одна инструкция выбранного процессора, а не тик: так на программу и смотрят. */
    const stepInstruction = () => {
        setRunning(false)
        current().building.processor.step()
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

    /**
     * Щелчок по миру. По процессору — открыть его программу, как в игре открывается настройка
     * блока. По тумблеру — переключить: `sensor` должен это увидеть.
     */
    const clickWorld = (event) => {
        const {scene, worldView} = stand.current
        const box = worldView.canvas.getBoundingClientRect()
        const spot = worldView.at(event.clientX - box.left, event.clientY - box.top)
        const building = scene.world.at(spot.x, spot.y)

        if (building === undefined) return

        const index = scene.processors.findIndex(entry => entry.building === building)
        if (index !== -1) {
            setSelected(index)
            setEditing(index)
            return
        }

        if (building === scene.toggle) {
            building.enabled = !building.enabled
            worldView.draw({selected: current().building})
        }
    }

    const scene = stand.current?.scene ?? null
    const processor = scene === null ? null : scene.processors[selected].building.processor
    const editingEntry = editing === null || scene === null ? null : scene.processors[editing]

    return (
        // not-content — метка Starlight: внутри неё статья не навязывает свои отступы и стили,
        // а интерфейсу редактора они ломают раскладку
        <div class="sandbox not-content" data-beat={beat}>
            <div class="sandbox__scene">
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

                <div class="sandbox__hint">
                    Щёлкните по процессору, чтобы открыть его программу; по тумблеру — чтобы
                    переключить его.
                </div>
            </div>

            <div class="sandbox__side">
                <div class="sandbox__row">
                    <div>
                        <div class="sandbox__title">Дисплей</div>
                        <canvas class="sandbox__display" ref={displayCanvas} />
                    </div>
                    <div class="sandbox__panel">
                        <div class="sandbox__title">Блок сообщений</div>
                        <div class="sandbox__message">{scene?.message.message || '—'}</div>
                        <div class="sandbox__meta">тик {scene?.world.tick ?? 0}</div>
                    </div>
                </div>

                <div class="sandbox__title sandbox__title--row">
                    <span>Переменные</span>

                    <span class="sandbox__tabs">
                        {scene?.processors.map((item, index) => (
                            <button
                                key={item.building.name}
                                class={`sandbox__tab${index === selected ? ' sandbox__tab--current' : ''}`}
                                onClick={() => setSelected(index)}
                            >
                                {item.building.name}
                            </button>
                        ))}
                    </span>

                    {/* В игре эта кнопка стоит в самом окне переменных: LogicDialog, "@logic.globals" */}
                    <button class="sandbox__link" onClick={() => setGlobalsOpen(true)}>
                        <Icon name="list" size={16} />
                        встроенные
                    </button>
                </div>

                {processor !== null && <Variables processor={processor} beat={beat} />}

                {processor !== null && processor.diagnostics.length > 0 && (
                    <div class="sandbox__errors">
                        {processor.diagnostics.map(error => (
                            <div key={`${error.line}-${error.code}`}>строка {error.line + 1}: {error.code}</div>
                        ))}
                    </div>
                )}
            </div>

            {globalsOpen && <GlobalsDialog onClose={() => setGlobalsOpen(false)} />}

            {editingEntry !== null && (
                <LogicDialog
                    key={editingEntry.building.name}
                    title={editingEntry.building.name}
                    initial={editingEntry.program}
                    onChange={rebuild(editingEntry)}
                    onClose={() => setEditing(null)}
                />
            )}
        </div>
    )
}
