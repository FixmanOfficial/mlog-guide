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

import {useEffect, useMemo, useRef, useState} from 'preact/hooks'

import {Editor, fromText, applyEasings, applyMetrics, applyNinePatches} from '@mlog/editor'
import {Icon} from '@mlog/editor/src/Icon.jsx'
import {
    restoreLocalization, setLocalization, useLocalization, useNameBundle
} from '@mlog/editor/src/names.js'
import {DisplayView} from '@mlog/render/src/display.js'
import {WorldView} from '@mlog/render/src/world.js'

// ?url обязателен: иначе Astro пропускает картинку через свой конвейер и отдаёт объект
import atlasUrl from '@mlog/editor/assets/content.webp?url'
import blocksUrl from '@mlog/render/assets/blocks.webp?url'
import unitsUrl from '@mlog/render/assets/units.webp?url'
import terrainUrl from '@mlog/render/assets/terrain.webp?url'
import sprites from '@mlog/core/data/sprites.json'
import blockSprites from '@mlog/core/data/block-sprites.json'
import unitSprites from '@mlog/core/data/unit-sprites.json'
import terrainSprites from '@mlog/core/data/terrain-sprites.json'
import teams from '@mlog/core/data/teams.json'
import logicFontUrl from '@mlog/render/assets/logic.woff2'

import bundleEn from '@mlog/core/data/i18n/en.json'
import bundleRu from '@mlog/core/data/i18n/ru.json'

import {createScene, attachProcessor} from '../sandbox/scene.js'
import {Variables} from '../game/Variables.jsx'

import '@mlog/editor/src/styles.css'
import './example.css'

/**
 * Сколько пикселей отдать тайлу, чтобы карта встала в колонку рядом с переменными.
 *
 * Размер подбирается целым числом, а не растягиванием готовой картинки: холст рисуется
 * попиксельно, и дробный масштаб сделал бы из спрайтов кашу. Пределы — чтобы на узкой
 * колонке карта не превратилась в марку, а на широкой не заняла пол-экрана.
 */
const MIN_TILE = 14
const MAX_TILE = 32

/**
 * Ниже этого размера карту рядом с таблицей ставить незачем: на телефоне она превращается
 * в марку, на которой ничего не разобрать. Тогда она встаёт над таблицей во всю ширину.
 */
const MIN_BESIDE = 20

/** Зазор между картой и таблицей переменных, тот же, что в раскладке. */
const GAP = 8

/**
 * Какую долю ряда отдать карте. Таблица переменных теперь резиновая и занимает остаток,
 * поэтому долю приходится назначить: считать «сколько осталось от таблицы» больше нельзя —
 * её ширина сама зависит от карты.
 */
const MAP_SHARE = 0.45

const clampTile = (tile) => Math.max(MIN_TILE, Math.min(MAX_TILE, tile))

/**
 * Размер тайла так, чтобы карта встала слева от таблицы переменных и заняла ровно то место,
 * которое осталось: по высоте вровень с таблицей, по ширине — сколько дала колонка.
 * Что меньше, то и берётся, иначе карта вылезет за край.
 */
function fitTile({stage, varsHeight}, world) {
    const byHeight = Math.floor(varsHeight / world.height)
    const byWidth = Math.floor((stage - GAP) * MAP_SHARE / world.width)
    const beside = Math.min(byHeight, byWidth)

    // Рядом выходит слишком мелко — карта встанет над таблицей и займёт всю ширину
    return clampTile(beside < MIN_BESIDE ? Math.floor(stage / world.width) : beside)
}

/** Потолок разового скачка времени, как в игре: `Vars.maxDeltaClient`. */
/**
 * Перерисовка стенда: сначала дисплей, потом карта.
 *
 * Порядок важен: мир берёт картинку дисплея готовой, и рисуй он первым — на карте остался бы
 * прошлый кадр.
 */
function redraw(stand) {
    for (const {building, view} of stand.displays ?? []) view.draw(building)

    stand.view?.draw({configured: null, cursor: null})
}

const MAX_DELTA = 4

/**
 * Где запоминается, показывать ли подсветку следующей строки.
 *
 * Подсветка — наша добавка, в игре её нет, и на «пуске» она перескакивает каждый такт.
 * Кому от мельтешения плохо, тот выключает её один раз, а не на каждой странице курса,
 * поэтому выбор запоминается на весь сайт. Ключ отдельный от песочницы: там своя кнопка
 * и свои привычки.
 */
const HIGHLIGHT_KEY = 'mlog.example.highlight'

function storedHighlight() {
    try {
        // По умолчанию включена: пример проходят шагами, и рамка в нём — главный указатель
        return globalThis.localStorage?.getItem(HIGHLIGHT_KEY) !== 'off'
    } catch {
        // Приватное окно и запрет на хранилище — не повод падать
        return true
    }
}

function rememberHighlight(on) {
    try {
        globalThis.localStorage?.setItem(HIGHLIGHT_KEY, on ? 'on' : 'off')
    } catch {
        // Не запомнили — на этой странице всё равно работает
    }
}

/**
 * Подписи кнопок окна. Своего перевода у игры для них нет: в ней это не кнопки редактора,
 * а наши — «шаг», «сначала», подсветка строки. Поэтому текст тут свой, как и у курса.
 */
const TOOLBAR = {
    ru: {
        pause: 'Пауза', play: 'Пуск', step: 'шаг', stepTitle: 'Одна инструкция',
        reset: 'Сначала', add: 'Добавить инструкцию',
        hide: 'Скрыть подсветку строки', show: 'Показать подсветку строки',
        native: 'Надписи как в игре: по-русски',
        plain: 'Надписи по-английски, как без перевода в игре',
        tick: 'тик'
    },
    en: {
        pause: 'Pause', play: 'Run', step: 'step', stepTitle: 'One instruction',
        reset: 'Restart', add: 'Add instruction',
        hide: 'Hide the current line', show: 'Show the current line',
        native: 'Labels as in the game',
        plain: 'Labels untranslated, as in the game without localisation',
        tick: 'tick'
    }
}

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
 * @param buffer показывать ли строку текстового буфера в переменных. Её в игре нет,
 *              это наша добавка, и в уроке не про печать она только сбивает
 * @param locale язык страницы: от него зависят надписи редактора и кнопок. Сцену остров
 *              не переводит — она приходит уже переведённой из `Example.astro`
 */
export function Example({scene: description, world = true, tick = 0, allow = true,
    buffer = false, locale = 'en'}) {
    /*
     * Язык надписей редактора — общий на модуль, как настройка в игре. Ставится до первой
     * отрисовки, а не эффектом: разметка приходит с сервера уже с подписями, и разойдись
     * они с первой отрисовкой в браузере, подписи остались бы серверными.
     */
    useNameBundle(locale === 'ru' ? bundleRu : bundleEn)


    const canvas = useRef(null)
    const vars = useRef(null)

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

    /*
     * Подсветка следующей строки: выключается глазом и запоминается на весь сайт.
     *
     * Первая отрисовка идёт со значением по умолчанию — тем же, что на сервере, где
     * хранилища нет. Запомненное применяется ниже, эффектом: Preact при подключении
     * атрибуты не сверяет, и разойдись первая отрисовка с готовым DOM — рамка осталась
     * бы нарисованной навсегда, потому что заново эту строку никто бы не отрисовал.
     */
    const [highlight, setHighlight] = useState(true)

    /*
     * Перевод надписей редактора. В игре это настройка `logiclocalization`, по умолчанию
     * включённая, — значит и здесь по умолчанию включена: читатель видит то же, что у себя.
     */
    const localized = useLocalization()

    // Размеры, девятипатчи и кривые интерфейса игры: без них редактор рисуется на глазок
    useEffect(() => {
        applyEasings()
        applyNinePatches()
        applyMetrics()

        // Запомненные настройки — после подключения, когда расходиться уже не с чем
        setHighlight(storedHighlight())
        restoreLocalization()
    }, [])

    /*
     * Сцена собирается при отрисовке, а не в эффекте.
     *
     * Так страница приходит уже с окном процессора и таблицей переменных внутри: раньше
     * на их месте была пустота, которая заполнялась после загрузки скриптов, и на телефоне
     * текст успевал прыгнуть. Сборка чистая — ни холста, ни документа она не касается,
     * поэтому та же разметка собирается и на сервере.
     *
     * Зависимость одна, `generation`: это кнопка «сначала». Текст программы читается при
     * сборке, а дальше его подменяет отдельный эффект — как в игре, где программу загружают
     * в уже стоящий блок.
     */
    const stand = useMemo(() => {
        const scene = createScene(description)

        // Первый процессор берёт текст из редактора: правка переживает и «пуск», и «шаг»
        scene.processors.forEach((entry, index) => {
            attachProcessor(scene, entry, index === 0 ? program : entry.program)
        })

        for (let i = 0; i < tick; i++) scene.world.step()

        return {scene, view: null, displays: []}
    }, [generation])

    // Холст и картинки — уже после отрисовки: на сервере ни того, ни другого нет
    useEffect(() => {
        const {scene} = stand

        if (world) {
            /*
             * Размер сразу настоящий: таблица переменных приходит вместе со страницей,
             * поэтому мерить есть что — и карта не успевает дёрнуться с «примерного»
             * размера на посчитанный.
             */
            const stage = canvas.current.parentElement
            const tile = fitTile({
                stage: stage?.clientWidth ?? 0,
                varsHeight: vars.current?.scrollHeight ?? 0
            }, scene.world)

            const images = [atlasUrl, blocksUrl, unitsUrl, terrainUrl].map(url => {
                const image = new Image()
                image.src = url
                return image
            })

            const [atlas, blocks, units, terrain] = images

            /*
             * Дисплей на карте рисует не мир, а отдельный холст: у него свои пиксели и свой
             * порядок команд. Мир получает готовую картинку и кладёт её на место блока —
             * так же, как это устроено в песочнице.
             *
             * Холст заводится **каждому** дисплею сцены: их бывает и два, и у каждого своя
             * картинка — на этом стоит целый урок про `drawflush`.
             */
            const displays = scene.world.buildings
                .filter(building => building.spec.displaySize !== undefined)
                .map(building => ({
                    building,
                    view: new DisplayView(document.createElement('canvas'),
                        {size: building.spec.displaySize, pixelRatio: 4, atlas, sprites})
                }))

            const view = new WorldView(canvas.current, {
                world: scene.world,
                tile,
                blocks, blockSprites, units, unitSprites, terrain, terrainSprites,
                teams, atlas, sprites,
                font: 'Mindustry',
                displays: new Map(displays.map(({building, view}) => [building, view.canvas]))
            })

            stand.view = view
            stand.displays = displays

            // Шрифт дисплея грузит страница: рендер только называет семейство
            if (displays.length > 0) {
                const font = new FontFace('MlogLogic', `url(${logicFontUrl})`)
                document.fonts.add(font)
                font.load().then(() => redraw(stand), () => {})
            }

            // decode вместо события load: картинка из кеша успевает загрузиться раньше подписки
            const draw = () => redraw(stand)
            for (const image of images) image.decode().then(draw, () => {})
            draw()
        }

        setReady(true)
        setBeat(beat => beat + 1)

        return () => setReady(false)
    }, [generation])

    /*
     * Карта подгоняется под соседей: таблица переменных задаёт высоту, колонка — остаток
     * ширины. Мерить приходится после отрисовки — на момент сборки сцены таблицы ещё нет, —
     * и заново при изменении размера окна.
     */
    useEffect(() => {
        if (!ready || !world) return

        const stage = canvas.current?.parentElement
        if (stage === null || stage === undefined) return

        const fit = () => {
            const {view, scene} = stand
            if (view === null || view === undefined) return

            const tile = fitTile({
                stage: stage.clientWidth,
                varsHeight: vars.current?.scrollHeight ?? 0
            }, scene.world)

            if (tile === view.tile) return

            view.tile = tile
            view.resize()
            redraw(stand)
        }

        fit()

        /*
         * Наблюдаем за таблицей и за самой колонкой, но не за картой: её размер зависит
         * от них, и подгонка гоняла бы себя по кругу.
         */
        const observer = new ResizeObserver(fit)
        observer.observe(stage)
        if (vars.current !== null) observer.observe(vars.current)

        return () => observer.disconnect()
    }, [ready, world])

    /*
     * Правка программы. Сцена при этом не пересобирается: мир, картинки и холст остаются
     * теми же, меняется только машина первого процессора — как в игре, где программу
     * загружают в стоящий блок.
     */
    useEffect(() => {
        if (!ready) return

        const {scene} = stand
        const entry = scene.processors[0]
        if (entry === undefined) return

        attachProcessor(scene, entry, program)
        redraw(stand)
        setBeat(beat => beat + 1)
    }, [program, ready])

    // Ход времени. Пример идёт с обычной скоростью игры: замедлять — дело шага
    useEffect(() => {
        if (!running || !ready) return

        let frame = 0
        let last = performance.now()

        const step = (time) => {
            const {scene} = stand
            const delta = Math.min((time - last) / 1000 * 60, MAX_DELTA)
            last = time

            scene.world.step(delta)
            redraw(stand)
            setBeat(beat => beat + 1)

            frame = requestAnimationFrame(step)
        }

        frame = requestAnimationFrame(step)
        return () => cancelAnimationFrame(frame)
    }, [running, ready])

    const processor = stand.scene.processors[0]?.building.processor ?? null

    /*
     * Сообщение, которое сейчас висит на экране. Срок считается в тиках мира, как в игре:
     * своё время у примера не идёт, когда он на паузе.
     */
    const message = stand.scene.world.message
    const shown = message !== null && message !== undefined
        && stand.scene.world.tick - message.at < message.duration * 60
        ? message
        : null

    const single = () => {
        processor?.step()
        redraw(stand)
        setBeat(beat => beat + 1)
    }

    const reset = () => {
        setRunning(false)
        setProgram(description.processors?.[0]?.program ?? '')
        setGeneration(generation => generation + 1)
    }

    const text = TOOLBAR[locale] ?? TOOLBAR.en

    return (
        // not-content — метка Starlight: внутри неё статья не навязывает свои стили,
        // а интерфейсу редактора они ломают раскладку
        <div class="example not-content" data-beat={beat}>
            <div class="example__toolbar">
                <button
                    class="game-button example__button"
                    title={running ? text.pause : text.play}
                    onClick={() => setRunning(!running)}
                >
                    <Icon name={running ? 'pause' : 'play'} size={20} />
                </button>

                <button
                    class="game-button example__button"
                    title={text.stepTitle}
                    disabled={running}
                    onClick={single}
                >
                    {text.step}
                </button>

                <button class="game-button example__button" title={text.reset} onClick={reset}>
                    <Icon name="refresh-1" size={20} />
                </button>

                <button
                    class="game-button example__button"
                    title={text.add}
                    onClick={() => setAddOpen(true)}
                >
                    <Icon name="add" size={20} />
                </button>

                <button
                    class="game-button example__button"
                    title={highlight ? text.hide : text.show}
                    aria-pressed={highlight ? 'true' : 'false'}
                    onClick={() => {
                        setHighlight(!highlight)
                        rememberHighlight(!highlight)
                    }}
                >
                    <Icon name={highlight ? 'eye' : 'eye-off'} size={20} />
                </button>

                <button
                    class="game-button example__button"
                    title={localized ? text.native : text.plain}
                    aria-pressed={localized ? 'true' : 'false'}
                    onClick={() => setLocalization(!localized)}
                >
                    <Icon name="book" size={20} />
                </button>

                <span class="example__tick">
                    {text.tick} {Math.trunc(stand.scene.world.tick)}
                </span>
            </div>

            <div class="example__panes">
                <div class="example__editor">
                    <Editor
                        key={generation}
                        initial={fromText(program)}
                        onChange={setProgram}
                        counter={processor === null || !highlight ? null : nextIndex(processor)}
                        addOpen={addOpen}
                        onAddClose={() => setAddOpen(false)}
                        allow={allow}
                    />
                </div>

                {/* Карта слева, переменные справа: сначала смотрят на мир, потом на числа */}
                <div class="example__stage">
                    {/*
                      * Форма мира задаётся сразу: до загрузки скриптов холст пуст
                      * и размера у него нет, а место под карту занять уже нужно —
                      * иначе текст под примером прыгает, когда карта появляется.
                      */}
                    {world ? (
                        <div class="example__map">
                            <canvas
                                class="example__world"
                                ref={canvas}
                                style={{aspectRatio: `${description.width} / ${description.height}`}}
                            />

                            {/*
                              * Сообщения мира (`message`) в игре показывает интерфейс, а не карта.
                              * Своего интерфейса у примера нет, поэтому объявление рисуется
                              * поверх карты — иначе уроки про мировой процессор говорили бы
                              * о том, чего на экране не видно.
                              */}
                            {shown === null ? null : (
                                <div class={`example__message example__message--${shown.type}`}>
                                    {shown.text}
                                </div>
                            )}
                        </div>
                    ) : null}

                    {processor === null ? null : (
                        <div class="example__vars" ref={vars}>
                            <Variables processor={processor} beat={beat} buffer={buffer} />
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
