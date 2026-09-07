/**
 * Песочница: сцена главная, редактор открывается щелчком по процессору — как в игре.
 *
 * Остров склеивает три модуля, которые друг о друге не знают: `core` исполняет, `render`
 * рисует мир и дисплей, `editor` правит программу. Порядок кадра такой же, как в игре:
 * сначала тик мира, потом отрисовка — и дисплей вычерпывает очередь команд именно на ней.
 */

import {useEffect, useRef, useState} from 'preact/hooks'

import {
    GlobalsDialog, LogicDialog, applyEasings, applyMetrics, applyNinePatches, toText
} from '@mlog/editor'
import {Icon} from '@mlog/editor/src/Icon.jsx'
import {mod} from '@mlog/core/src/arc.js'
import {DisplayView} from '@mlog/render/src/display.js'
import {WorldView} from '@mlog/render/src/world.js'

// ?url обязателен: без него Astro пропускает картинку через свой конвейер и отдаёт объект
import atlasUrl from '@mlog/editor/assets/content.png?url'
import blocksUrl from '@mlog/render/assets/blocks.png?url'
import unitsUrl from '@mlog/render/assets/units.png?url'
import terrainUrl from '@mlog/render/assets/terrain.png?url'
import logicFontUrl from '@mlog/render/assets/logic.ttf'
import sprites from '@mlog/core/data/sprites.json'
import blockSprites from '@mlog/core/data/block-sprites.json'
import unitSprites from '@mlog/core/data/unit-sprites.json'
import terrainSprites from '@mlog/core/data/terrain-sprites.json'
import teams from '@mlog/core/data/teams.json'
import {Hud, HideHint} from './Hud.jsx'
import {permissions, canEdit} from './permissions.js'

import {createScene, attachProcessor} from './scene.js'
import {MessageDialog, MemoryDialog} from './BlockDialogs.jsx'
import {PAINTER, COUNTER, PILOT, MARKER} from './programs.js'
import {Variables} from './Variables.jsx'

/** Тайл мира в пикселях. Всё остальное рендер считает от него сам. */
const TILE = 40

/** Двойная стрелка перематывает на секунду — 60 тиков. */
const SECOND = 60

/**
 * Блоки, у которых есть что настроить. Сообщение правится и в игре, память — наша добавка:
 * посмотреть содержимое ячейки в Mindustry нельзя вовсе.
 */
const CONFIGURABLE = new Set(['message', 'memory-cell', 'memory-bank'])

/** BlockConfigFragment.hideConfig: ряд настройки сжимается за 0.06 секунды. */
const HIDE_MS = 60

/**
 * Через сколько тиков таблица переменных перечитывает значения. `LogicDialog`: `period = 15f`,
 * а копится в него `Time.delta`.
 */
const VARS_PERIOD = 15

/**
 * Потолок для разового скачка времени. `Vars.maxDeltaClient`: как бы надолго ни застряла
 * отрисовка, за один кадр мир не проживёт больше четырёх тиков.
 */
const MAX_DELTA = 4

/**
 * Номер строки, которую процессор выполнит следующей.
 *
 * Счётчик увеличивается ДО запуска инструкции, поэтому на паузе он показывает именно
 * следующую, а не только что отработавшую. Выход за границы программы возвращает к нулю —
 * так же, как это делает сама машина на следующем шаге.
 */
function nextIndex(processor) {
    const value = Math.trunc(processor.counter.numval)
    return value >= 0 && value < processor.instructions.length ? value : 0
}

/**
 * Ключ, под которым запоминается подсветка следующей строки. В игре подсветки нет вовсе,
 * и по умолчанию её нет и здесь: при идущем мире рамка перескакивает каждый тик, а это
 * мельтешение, от которого людям с светочувствительностью плохо в буквальном смысле.
 * Для пошагового разбора она включается кнопкой и запоминается.
 */
const HIGHLIGHT_KEY = 'mlog.sandbox.highlight'

function storedHighlight() {
    try {
        return globalThis.localStorage?.getItem(HIGHLIGHT_KEY) === 'on'
    } catch {
        // Приватное окно и запрет на хранилище — не повод падать
        return false
    }
}

/** Подпись скорости: степень двойки от 1/256 до 256. */
const speedLabel = (power) => power >= 0 ? `×${2 ** power}` : `×1/${2 ** -power}`

/**
 * @param allow что разрешено в этой песочнице. По умолчанию всё: страница песочницы
 *              ничего не передаёт, а урок сужает — правку одного процессора, набор
 *              инструкций, строительство, время. См. `permissions.js`
 */
export function Sandbox({allow = {}} = {}) {
    const rights = permissions(allow)

    const worldCanvas = useRef(null)
    const displayCanvas = useRef(null)
    const stand = useRef(null)

    const [running, setRunning] = useState(true)

    // Подсветка следующей строки: наша добавка к окну игры, поэтому выключаемая
    const [highlight, setHighlight] = useState(storedHighlight)

    // Клетка под курсором: её показывает HUD под миникартой, как настройка «mouseposition»
    const [hover, setHover] = useState(null)

    // Показан ли HUD. В игре это `HudFragment.shown`, и переключает его клавиша C
    const [hudShown, setHudShown] = useState(true)

    // Подсказка про клавишу: игра показывает её один раз, когда интерфейс скрыли впервые
    const [hintShown, setHintShown] = useState(false)

    // Выбранный в панели блок: `control.input.block` в игре
    const [block, setBlock] = useState(null)

    // Здание под курсором: панель показывает его состояние, а мир — уголки выделения
    const [hoveredBuilding, setHoveredBuilding] = useState(null)

    // Режим сноса и поворот будущего блока: `MobileInput.mode` и `rotation`
    const [breaking, setBreaking] = useState(false)
    const [rotation, setRotation] = useState(0)

    /*
     * Те же три значения ссылками. Обработчики холста живут дольше одного кадра, а
     * перерисовка идёт по `requestAnimationFrame` — в скрытой вкладке она не идёт вовсе,
     * и обработчик остался бы с тем, что было при последнем кадре.
     */
    const blockRef = useRef(null)
    const breakingRef = useRef(false)
    const rotationRef = useRef(0)

    const chooseBlock = (next) => {
        blockRef.current = next
        breakingRef.current = false

        setBlock(next)
        setBreaking(false)
    }

    const toggleBreaking = () => {
        breakingRef.current = !breakingRef.current
        blockRef.current = null

        setBreaking(breakingRef.current)
        setBlock(null)
    }

    const turn = () => {
        rotationRef.current = mod(rotationRef.current + 1, 4)
        setRotation(rotationRef.current)
    }

    /** Снос: `world.remove` плюс уборка за процессором, если сносят его. */
    const breakBuilding = (building) => {
        const scene = stand.current.scene
        if (!scene.world.canBreak(building)) return false

        const index = scene.processors.findIndex(entry => entry.building === building)
        if (index !== -1) {
            scene.processors.splice(index, 1)
            setSelected(current => Math.max(0, Math.min(current, scene.processors.length - 1)))
            setEditing(null)
        }

        hideConfig()
        scene.world.remove(building)

        if (hoveredRef.current === building) hoveredRef.current = null
        setHoveredBuilding(null)

        return true
    }

    /**
     * Постановка блока. Процессор при этом заводится по-настоящему: пустая программа,
     * своя скорость из спеки и место в списке — иначе поставленный процессор оставался бы
     * картинкой, которую нельзя открыть.
     */
    const placeBlock = (type, spot) => {
        const scene = stand.current.scene

        const building = scene.world.place(type, spot.x, spot.y, {
            team: scene.world.rules.defaultTeam, rotation: rotationRef.current
        })

        if (building === null) return null

        // `LogicBlock.instructionsPerTick` есть только у процессоров — по нему их и видно
        if (building.spec.ipt !== undefined) {
            const entry = {building, links: [], program: []}
            scene.processors.push(entry)
            attachProcessor(scene, entry, '')
        }

        return building
    }

    // Скорость степенями двойки от 1/256 до 256, как в моде time control:
    // в игре такого нет, но без этого пошаговый разбор превращается в пытку
    const [power, setPower] = useState(0)

    const [ready, setReady] = useState(false)
    const [beat, setBeat] = useState(0)
    const [selected, setSelected] = useState(0)

    // Блок, у которого открыта настройка: в игре щелчок по блоку показывает под ним ряд кнопок,
    // а у процессора там карандаш — он и открывает программу (LogicBlock.buildConfiguration)
    const [configured, setConfigured] = useState(null)

    // Ряд не пропадает мгновенно: `hideConfig` сначала сжимает его за 0.06 секунды,
    // и только потом убирает. Рамка вокруг блока при этом гаснет сразу
    const [closing, setClosing] = useState(null)
    const [editing, setEditing] = useState(null)
    const [blockDialog, setBlockDialog] = useState(null)
    const [globalsOpen, setGlobalsOpen] = useState(false)

    /** Процессор, чьи переменные показывает таблица. */
    const current = () => stand.current.scene.processors[selected]

    // Цикл отрисовки живёт вне состояния, поэтому наведённое и настраиваемое нужны ссылкой
    const hoveredRef = useRef(null)
    const configuredRef = useRef(null)
    configuredRef.current = configured

    /*
     * Поворот будущего блока — `Binding.rotatePlaced`, по умолчанию R. В игре крутится
     * ещё и колесом (`Binding.rotate` — ось), но колесо на странице листает статью.
     */
    useEffect(() => {
        const onKey = (event) => {
            if (event.key !== 'r' && event.key !== 'R' && event.key !== 'к' && event.key !== 'К') return
            if (event.ctrlKey || event.metaKey || event.altKey) return

            const active = document.activeElement
            const typing = active !== null && (active.tagName === 'INPUT'
                || active.tagName === 'TEXTAREA' || active.isContentEditable)

            if (typing || document.querySelector('.overlay') !== null) return

            turn()
        }

        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [])

    /*
     * Клавиша, скрывающая интерфейс. В игре это `Binding.toggleMenus`, по умолчанию C,
     * и срабатывает она только когда нет открытого окна и курсор не стоит в поле ввода:
     * `!Core.scene.hasDialog() && !Core.scene.hasField()`.
     */
    useEffect(() => {
        const onKey = (event) => {
            if (event.key !== 'c' && event.key !== 'C' && event.key !== 'с' && event.key !== 'С') return
            if (event.ctrlKey || event.metaKey || event.altKey) return

            const active = document.activeElement
            const typing = active !== null
                && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)

            if (typing || document.querySelector('.overlay') !== null) return

            setHudShown(shown => {
                if (shown) setHintShown(true)
                return !shown
            })
        }

        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [])

    // Мир, процессоры и виды живут вне состояния: перерисовка их не касается
    useEffect(() => {
        applyEasings()
        applyNinePatches()
        applyMetrics()

        const scene = createScene()

        scene.processors[0].program = PAINTER
        scene.processors[1].program = COUNTER
        scene.processors[2].program = PILOT
        scene.processors[3].program = MARKER
        for (const entry of scene.processors) attachProcessor(scene, entry, toText(entry.program))

        const atlas = new Image()
        atlas.src = atlasUrl

        // Блоки рисуются своим атласом: там они в родном разрешении и не расплываются
        const blocks = new Image()
        blocks.src = blocksUrl

        const units = new Image()
        units.src = unitsUrl

        const terrain = new Image()
        terrain.src = terrainUrl

        const displayView = new DisplayView(displayCanvas.current, {
            size: scene.display.spec.displaySize,
            pixelRatio: 4,
            atlas,
            sprites
        })

        const worldView = new WorldView(worldCanvas.current, {
            world: scene.world,
            tile: TILE,
            blocks,
            blockSprites,
            units,
            unitSprites,
            teams,
            terrain,
            terrainSprites,
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
            worldView.draw({configured: null, hovered: hoveredRef.current})
        }

        // decode вместо события load: картинка из кеша успевает загрузиться раньше подписки,
        // и тогда события не будет вовсе — а мир останется без иконок до первого кадра
        atlas.decode().then(first, () => {})
        blocks.decode().then(first, () => {})
        units.decode().then(first, () => {})
        terrain.decode().then(first, () => {})
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
        let last = performance.now()

        const speed = 2 ** power

        const step = (time) => {
            const {scene, worldView, displayView} = stand.current

            // Тик — это 1/60 реальной секунды, а не кадр: `Time.setDeltaProvider` в игре считает
            // ровно так, иначе на мониторе 144 герца мир побежит в два с лишним раза быстрее
            const delta = Math.min((time - last) / 1000 * 60, MAX_DELTA)
            last = time

            if (speed <= 1) {
                /*
                 * Замедление — это дробный тик, а не редкий целый. Так же ведёт себя игра при
                 * низком кадре: `accumulator += delta * ipt`, и при delta 1/8 у процессора на
                 * восемь инструкций в тик исполняется ровно одна. Иначе на любой скорости
                 * счётчик прыгал бы через восемь строк разом, и разглядеть ход было бы нельзя.
                 */
                scene.world.step(delta * speed)
                displayView.draw(scene.display)
            } else {
                pending += delta * speed
                while (pending >= 1) {
                    scene.world.step()
                    // Дисплей вычерпывает очередь на каждом тике, как при отрисовке кадра
                    displayView.draw(scene.display)
                    pending--
                }
            }

            worldView.draw({configured: configuredRef.current, hovered: hoveredRef.current})

            // Значения переменных перечитываются раз в 15 тиков времени, как в игре
            /*
             * На полном ходу значения перечитываются раз в 15 тиков, как в игре: чаще их всё
             * равно не разглядеть. На замедлении — каждый кадр, иначе смысл замедления теряется.
             */
            counter += delta
            if (speed <= 1 || counter >= VARS_PERIOD) {
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
        worldView.draw({configured: configuredRef.current, hovered: hoveredRef.current})
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
        // Тик бывает дробным: на замедлении мир идёт долями. Отматываем к целому
        const target = Math.max(0, Math.floor(scene.world.tick) - ticks)

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
     * Щелчок по миру. По процессору — показать под ним ряд настройки, как в игре: там появляется
     * карандаш, и уже он открывает программу. По тумблеру — переключить: `sensor` это увидит.
     */
    const clickWorld = (event) => {
        if (!rights.interact && !rights.build) return

        const {scene, worldView} = stand.current
        const box = worldView.canvas.getBoundingClientRect()
        const spot = worldView.at(event.clientX - box.left, event.clientY - box.top)
        const building = scene.world.at(spot.x, spot.y)

        // Режим сноса: щелчок разбирает то, что под курсором. MobileInput.mode == breaking
        if (breakingRef.current && rights.build) {
            breakBuilding(building)
            worldView.draw({configured: null, hovered: hoveredRef.current})
            return
        }

        // Выбран блок — щелчок ставит его, как в игре: разбирать настройку уже не нужно
        if (blockRef.current !== null && rights.build) {
            placeBlock(blockRef.current, spot)
            worldView.draw({configured: configuredRef.current, hovered: hoveredRef.current})
            return
        }

        if (building === undefined) {
            hideConfig()
            worldView.draw({configured: null, hovered: hoveredRef.current})
            return
        }

        const index = scene.processors.findIndex(entry => entry.building === building)
        if (index !== -1) {
            setSelected(index)
            setConfigured(building)
            worldView.draw({configured: building})
            return
        }

        // SwitchBlock.configTapped и Door.tapped: щелчок переключает их сразу, без ряда кнопок.
        // У двери при этом свой порог — 60 тиков вместо 80 у логики
        if (building === scene.toggle) {
            building.enabled = !building.enabled
            hideConfig()
            worldView.draw({configured: null, hovered: hoveredRef.current})
            return
        }

        if (building === scene.door) {
            building.tap()
            hideConfig()
            worldView.draw({configured: null, hovered: hoveredRef.current})
            return
        }

        // У сообщения и памяти есть что настраивать — показываем ряд, как в игре
        if (CONFIGURABLE.has(building.type)) {
            setConfigured(building)
            worldView.draw({configured: building})
            return
        }

        hideConfig()
        worldView.draw({configured: null, hovered: hoveredRef.current})
    }

    /** BlockConfigFragment.hideConfig: ряд сжимается за 0.06 секунды и только затем исчезает. */
    const hideConfig = () => {
        if (configured === null) return

        setClosing(configuredSpot())
        setConfigured(null)

        // Убираем по времени, а не по событию анимации: в скрытой вкладке она не проигрывается,
        // и узел остался бы висеть
        setTimeout(() => setClosing(null), HIDE_MS)
    }

    /** Где на холсте стоит настраиваемый блок: под ним встаёт ряд кнопок, как в игре. */
    const configuredSpot = () => {
        if (configured === null || stand.current === null) return null

        const view = stand.current.worldView
        const [cx, cy] = view.place(configured)
        const half = configured.size * TILE / 2

        return {left: cx / view.ratio, top: cy / view.ratio + half + 2}
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
                    {rights.reset && (
                        <button class="game-button sandbox__button" title="Сбросить мир" onClick={reset}>
                            <Icon name="refresh-1" size={20} />
                        </button>
                    )}

                    {rights.time && (<>
                        <button class="game-button sandbox__button" title="Назад на секунду" onClick={() => rewind(SECOND)}>
                            <Icon name="left" size={20} /><Icon name="left" size={20} />
                        </button>
                        <button class="game-button sandbox__button" title="Назад на тик" onClick={() => rewind(1)}>
                            <Icon name="left" size={20} />
                        </button>
                    </>)}

                    <button
                        class="game-button sandbox__button"
                        title={running ? 'Пауза' : 'Пуск'}
                        onClick={() => setRunning(!running)}
                    >
                        <Icon name={running ? 'pause' : 'play'} size={20} />
                    </button>

                    {rights.time && (<>
                        <button class="game-button sandbox__button" title="Вперёд на тик" onClick={() => forward(1)}>
                            <Icon name="right" size={20} />
                        </button>
                        <button class="game-button sandbox__button" title="Вперёд на секунду" onClick={() => forward(SECOND)}>
                            <Icon name="right" size={20} /><Icon name="right" size={20} />
                        </button>

                        <button class="game-button sandbox__button" onClick={stepInstruction}>инструкция</button>
                    </>)}

                    {rights.hud && (
                        <button
                            class="game-button sandbox__button"
                            title={`${hudShown ? 'Скрыть' : 'Показать'} интерфейс (C)`}
                            onClick={() => setHudShown(!hudShown)}
                        >
                            <Icon name={hudShown ? 'eye-off' : 'eye'} size={20} />
                        </button>
                    )}

                    <label class="sandbox__toggle" title="Подсвечивать строку, которую процессор выполнит следующей">
                        <input
                            type="checkbox"
                            checked={highlight}
                            onChange={(event) => {
                                const on = event.currentTarget.checked
                                setHighlight(on)
                                try {
                                    globalThis.localStorage?.setItem(HIGHLIGHT_KEY, on ? 'on' : 'off')
                                } catch {
                                    // Хранилища может не быть — подсветка всё равно переключилась
                                }
                            }}
                        />
                        <span>подсветка</span>
                    </label>

                    {rights.time && (
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
                    )}
                </div>

                <div class="sandbox__map">
                    <canvas
                        class="sandbox__world"
                        ref={worldCanvas}
                        onClick={clickWorld}
                        onMouseMove={(event) => {
                            const view = stand.current?.worldView
                            if (view === undefined) return

                            const box = view.canvas.getBoundingClientRect()
                            const spot = view.at(event.clientX - box.left, event.clientY - box.top)

                            setHover(spot)
                            hoveredRef.current = stand.current.scene.world.at(spot.x, spot.y) ?? null
                            setHoveredBuilding(hoveredRef.current)
                        }}
                        onMouseLeave={() => {
                            setHover(null)
                            hoveredRef.current = null
                            setHoveredBuilding(null)
                        }}
                        onContextMenu={(event) => {
                            // Правая кнопка сносит: в игре это тот же жест разбора
                            event.preventDefault()

                            const {scene, worldView} = stand.current
                            const box = worldView.canvas.getBoundingClientRect()
                            const spot = worldView.at(event.clientX - box.left, event.clientY - box.top)

                            const building = scene.world.at(spot.x, spot.y)
                            if (!rights.build) return

                            // `Binding.deselect` и `Binding.breakBlock` — обе на правой
                            // кнопке: сперва она снимает выбранный блок, и лишь потом сносит
                            if (blockRef.current !== null || breakingRef.current) {
                                chooseBlock(null)
                                return
                            }

                            breakBuilding(building)
                            worldView.draw({configured: null, hovered: hoveredRef.current})
                        }}
                    />

                    {/* Полоса состояния и сообщения: в игре это верх экрана */}
                    {!hudShown && hintShown && <HideHint onDone={() => setHintShown(false)} />}

                    {scene !== null && hudShown && rights.hud && (
                        <Hud
                            world={scene.world}
                            beat={beat}
                            hover={hover}
                            block={rights.build ? block : null}
                            onBlock={rights.build ? chooseBlock : () => {}}
                            showBuild={rights.build}
                            rotation={rotation}
                            breaking={breaking}
                            onBreak={toggleBreaking}
                            onRotate={turn}
                            building={hoveredBuilding}
                        />
                    )}

                    {/* Ряд настройки: в игре он появляется под блоком, фон Styles.cleari — чёрный
                        на 60 процентов, кнопка 40 на 40, значок белый */}
                    {closing !== null && (
                        <div class="config-bar config-bar--closing" style={closing}>
                            <button class="config-bar__button">
                                <Icon name="pencil_" size={24} />
                            </button>
                        </div>
                    )}

                    {configured !== null && (
                        <div class="config-bar" style={configuredSpot()}>
                            {configured.type === 'message' && (
                                <button
                                    class="config-bar__button"
                                    title="Править сообщение"
                                    onClick={() => setBlockDialog('message')}
                                >
                                    <Icon name="pencil_" size={24} />
                                </button>
                            )}

                            {configured.memory !== undefined && (
                                <button
                                    class="config-bar__button"
                                    title="Посмотреть память"
                                    onClick={() => setBlockDialog('memory')}
                                >
                                    <Icon name="list" size={24} />
                                </button>
                            )}

                            {configured.processor !== undefined && canEdit(rights, configured) && (
                                <button
                                    class="config-bar__button"
                                    title="Править программу"
                                    onClick={() => setEditing(scene.processors.findIndex(
                                        entry => entry.building === configured
                                    ))}
                                >
                                    <Icon name="pencil_" size={24} />
                                </button>
                            )}
                        </div>
                    )}
                </div>

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
                        <div class="sandbox__meta">тик {Math.floor(scene?.world.tick ?? 0)}</div>
                    </div>
                </div>

                <div class="sandbox__title sandbox__title--row">
                    <span>Переменные</span>
                    {/* Чьи именно: в игре окно принадлежит блоку, который открыли */}
                    <span class="sandbox__owner">{scene?.processors[selected].building.name}</span>
                </div>

                {processor !== null && <Variables processor={processor} beat={beat} />}

                {/* LogicDialog: кнопка «@logic.globals» со значком списка, 210 на 64 */}
                <button class="game-button sandbox__globals" onClick={() => setGlobalsOpen(true)}>
                    <Icon name="list" size={24} />
                    <span>Встроенные переменные</span>
                </button>

                {processor !== null && processor.diagnostics.length > 0 && (
                    <div class="sandbox__errors">
                        {processor.diagnostics.map(error => (
                            <div key={`${error.line}-${error.code}`}>строка {error.line + 1}: {error.code}</div>
                        ))}
                    </div>
                )}
            </div>

            {globalsOpen && <GlobalsDialog onClose={() => setGlobalsOpen(false)} />}

            {blockDialog === 'message' && configured !== null && (
                <MessageDialog
                    building={configured}
                    onApply={(text) => { configured.configureMessage(text); redraw() }}
                    onClose={() => setBlockDialog(null)}
                />
            )}

            {blockDialog === 'memory' && configured !== null && (
                <MemoryDialog building={configured} onClose={() => setBlockDialog(null)} />
            )}

            {editingEntry !== null && (
                <LogicDialog
                    key={editingEntry.building.name}
                    title={editingEntry.building.name}
                    privileged={editingEntry.building.spec.privileged === true}
                    unitControl={scene.world.rules.get('logicUnitControl')}
                    allow={rights.instructions}
                    initial={editingEntry.program}
                    onChange={rebuild(editingEntry)}
                    counter={highlight ? nextIndex(editingEntry.building.processor) : null}
                    onRestart={() => {
                        editingEntry.building.processor.reset()
                        redraw()
                    }}
                    onClose={() => setEditing(null)}
                />
            )}
        </div>
    )
}
