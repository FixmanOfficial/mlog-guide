import {useEffect, useMemo, useRef, useState} from 'preact/hooks'

import {ContentIcon, METRICS, selectByNumber, selectByArrow} from '@mlog/editor'
import {Icon} from '@mlog/editor/src/Icon.jsx'
import {nameBundle} from '@mlog/editor/src/names.js'

import {strings} from './strings.js'

import {BLOCK_SPECS} from '@mlog/core/src/specs.js'
import bindings from '@mlog/core/data/bindings.json'

/**
 * Панель строительства — правый нижний угол игры (`PlacementFragment.build`).
 *
 * Раскладка перенесена целиком, включая то, что легко принять за мелочь:
 *
 *  - заголовок лежит в своей панели `Tex.buttonEdge2` с отступом 5; в нём иконка блока 32,
 *    название шириной 190 с отступом 5 и кнопка «?» стороной 40, задвинутая в угол на -5;
 *  - под названием — клавиши выбора: `placement.blockselectkeys` собирает клавишу категории
 *    и клавишу места в сетке, оттого запись вида «Клавиша: [1,9]»;
 *  - требования: иконка 16, имя предмета серым не шире 140 и количество, причём вместо запаса
 *    стоит звёздочка — так игра пишет при `infiniteResources`;
 *  - сетка блоков живёт в `Tex.pane2` с отступом 4 и нулевым сверху, прокрутка высотой 194,
 *    а неполный ряд добивается пустыми клетками, чтобы панель не меняла размер;
 *  - под сеткой серая линия высотой 4 во всю ширину и ряд кнопок по 48 — `buildPlacementUI`;
 *  - категории идут по две в ряд кнопками 50, над ними тёмная полоса.
 */

/** Порядок категорий — `Category.all`, то есть порядок объявления в игре. */
const CATEGORIES = [
    'turret', 'production', 'distribution', 'liquid', 'power',
    'defense', 'crafting', 'units', 'effect', 'logic'
]

/**
 * Значок категории. В игре это `ui.getIcon(cat.name())` — глиф шрифта иконок по имени
 * категории; у «power» имя занято, и в шрифте он лежит как `power_`.
 */
const categoryIcon = (category) => category === 'power' ? 'power_' : category

const named = (type, name) => nameBundle().content[type]?.[name] ?? name

/** Клавиша привязки так, как её пишет игра: `num1` — это «1». */
function keyName(binding) {
    const key = bindings.bindings[binding]?.key
    if (key === undefined) return null

    return key.startsWith('num') ? key.slice(3) : key
}

/** Блоки категории: те, что игра вообще разрешает строить. */
const blocksOf = (category) => Object.entries(BLOCK_SPECS)
    .filter(([, spec]) => spec.category === category && spec.canBeBuilt === true
        && spec.buildVisibility !== 'hidden' && spec.buildVisibility !== 'debugOnly')
    .sort(([, a], [, b]) => a.id - b.id)
    .map(([name]) => name)

/** Клавиша по номеру: места в сетке нумеруются с единицы, десятое сидит на нуле. */
const selectKey = (number) => keyName(`block_select_${String(number).padStart(2, '0')}`)

/**
 * Подсказка клавиш выбора. Первая клавиша — номер категории, вторая — место в сетке,
 * а у одиннадцатого блока и дальше между ними встаёт клавиша десятков.
 */
function selectKeys(category, index) {
    const categoryKey = selectKey(CATEGORIES.indexOf(category) + 1)
    const placeKey = selectKey(index % 10 + 1)

    if (categoryKey === null || placeKey === null) return null

    const tens = index < 10 ? '' : `${selectKey(Math.trunc((index + 1) / 10))},`
    return `${categoryKey},${tens}${placeKey}`
}

export function BuildPanel({selected, onSelect, building = null, rotation = 0, breaking = false,
    onBreak = () => {}, onRotate = () => {}}) {
    const [category, setCategory] = useState('distribution')
    const [hovered, setHovered] = useState(null)

    // Набор цифрами: категория, потом блок. `PlacementFragment` держит его так же
    const combo = useRef({category: 'distribution', index: null, seq: 0, ended: true, at: 0})

    const blocks = useMemo(() => blocksOf(category), [category])

    // Блок из меню важнее наведённого здания: так решает `PlacementFragment`
    const shown = hovered ?? selected

    const size = METRICS.blockButtonSize ?? 46
    const columns = METRICS.blockRowWidth ?? 4

    // «add missing elements to even out table size»: неполный ряд добивается пустыми клетками
    const empty = (columns - blocks.length % columns) % columns

    /*
     * Клавиши выбора: цифры набирают категорию и блок, стрелки двигают по сетке.
     * `gridUpdate` молчит, когда открыт чат, консоль или поле ввода — у нас это окно
     * программы и любое поле на странице.
     */
    useEffect(() => {
        const onKey = (event) => {
            if (event.ctrlKey || event.metaKey || event.altKey) return

            const active = document.activeElement
            const typing = active !== null && (active.tagName === 'INPUT'
                || active.tagName === 'TEXTAREA' || active.isContentEditable)

            if (typing || document.querySelector('.overlay') !== null) return

            const arrows = {ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down'}
            const list = blocksOf(combo.current.category)

            if (arrows[event.key] !== undefined) {
                const at = selectByArrow(list.indexOf(selected), arrows[event.key],
                    {count: list.length, columns})

                if (list[at] !== undefined) onSelect(list[at])
                return
            }

            if (!/^[0-9]$/.test(event.key)) return

            // Клавиша «1» — это ноль, а «0» — десятое место: так пронумерованы привязки
            const number = event.key === '0' ? 9 : Number(event.key) - 1
            const next = selectByNumber(combo.current, number,
                {now: Date.now(), categories: CATEGORIES, count: list.length})

            combo.current = next
            setCategory(next.category)

            const chosen = blocksOf(next.category)[next.index]
            if (next.index !== null && chosen !== undefined) onSelect(chosen)
        }

        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [selected, columns, onSelect])

    return (
        <div class="build">
            {shown !== null && <BlockInfo block={shown} category={category} index={blocks.indexOf(shown)} />}
            {shown === null && building !== null && <BuildingInfo building={building} />}

            <div class="build__body">
                <div class="build__select">
                    <div
                        class="build__blocks"
                        style={{
                            padding: `${METRICS.blocksMargin ?? 4}px`,
                            paddingTop: `${METRICS.blocksMarginTop ?? 0}px`,
                            maxHeight: `${METRICS.blockPaneHeight ?? 194}px`,
                            gridTemplateColumns: `repeat(${columns}, ${size}px)`
                        }}
                    >
                        {blocks.map(block => (
                            <button
                                key={block}
                                class={`build__block${selected === block ? ' build__block--on' : ''}`}
                                style={{width: `${size}px`, height: `${size}px`}}
                                title={named('block', block)}
                                onMouseEnter={() => setHovered(block)}
                                onMouseLeave={() => setHovered(current => current === block ? null : current)}
                                onClick={() => {
                                    combo.current = {...combo.current, category, ended: true}
                                    onSelect(selected === block ? null : block)
                                }}
                            >
                                <ContentIcon type="block" name={block} size={8 * (METRICS.iconMedFactor ?? 4)} />
                            </button>
                        ))}

                        {Array.from({length: empty}, (unused, index) => (
                            <span key={`empty${index}`} style={{width: `${size}px`, height: `${size}px`}} />
                        ))}
                    </div>

                    <div class="build__line" style={{height: `${METRICS.categoryLineHeight ?? 4}px`}} />

                    <PlacementRow
                        breaking={breaking}
                        rotation={rotation}
                        rotatable={selected !== null && BLOCK_SPECS[selected]?.rotate === true}
                        onBreak={onBreak}
                        onRotate={onRotate}
                    />
                </div>

                <div
                    class="build__categories"
                    style={{gridTemplateColumns: `repeat(${METRICS.categoryColumns ?? 2}, auto)`}}
                >
                    {CATEGORIES.map(name => (
                        <button
                            key={name}
                            class={`build__category${category === name ? ' build__category--on' : ''}`}
                            style={{
                                width: `${METRICS.categoryButtonSize ?? 50}px`,
                                height: `${METRICS.categoryButtonSize ?? 50}px`
                            }}
                            title={name}
                            onClick={() => {
                                combo.current = {...combo.current, category: name, ended: true}
                                setCategory(name)
                            }}
                        >
                            <Icon name={categoryIcon(name)} size={26} />
                        </button>
                    ))}
                </div>
            </div>
        </div>
    )
}

/**
 * Ряд под сеткой — `input.buildPlacementUI`, кнопки по 48.
 *
 * У настольного ввода это схемы, база данных и, в кампании, дерево технологий с картой
 * планеты; у мобильного — снос, диагональ, поворот и подтверждение. Взят мобильный: он про
 * мир, а не про окна, которых у нас нет. Из четырёх кнопок стоят две — диагональ и
 * подтверждение относятся к планам постройки, а постройка у нас мгновенная.
 *
 * Кнопка поворота в игре одна и та же для двух дел: у вращаемого блока это стрелка, повёрнутая
 * на текущий угол, иначе — значок копии, включающий режим схемы.
 */
function PlacementRow({breaking, rotation, rotatable, onBreak, onRotate}) {
    const side = METRICS.placementRowSize ?? 48
    const breakKey = keyName('break_block')
    const text = strings()

    return (
        <div class="build__row">
            <button
                class={`build__tool${breaking ? ' build__tool--on' : ''}`}
                style={{width: `${side}px`, height: `${side}px`}}
                title={`${text.breaking} (${breakKey === 'mouseRight' ? text.rightButton : breakKey})`}
                onClick={onBreak}
            >
                <Icon name="hammer" size={26} />
            </button>

            <button
                class="build__tool"
                style={{width: `${side}px`, height: `${side}px`}}
                title={`Повернуть (${keyName('rotateplaced') ?? 'R'})`}
                disabled={!rotatable}
                onClick={onRotate}
            >
                <span class="build__arrow" style={{transform: `rotate(${-rotation * 90}deg)`}}>
                    <Icon name="right" size={26} />
                </span>
            </button>
        </div>
    )
}

/**
 * Заголовок с блоком: иконка 32, название шириной 190 с отступом 5, кнопка «?» стороной 40.
 * Под названием клавиши выбора, ниже требования.
 */
function BlockInfo({block, category, index}) {
    const keys = index >= 0 ? selectKeys(category, index) : null

    return (
        <div class="build__top">
            <div class="build__header">
                <ContentIcon type="block" name={block} size={8 * (METRICS.iconMedFactor ?? 4)} />

                <div
                    class="build__title"
                    style={{
                        width: `${METRICS.blockNameWidth ?? 190}px`,
                        marginLeft: `${METRICS.blockNamePad ?? 5}px`
                    }}
                >
                    <span class="build__name">{named('block', block)}</span>
                    {keys !== null && <span class="build__keys">Клавиша: [{keys}]</span>}
                </div>

                <button
                    class="build__info"
                    style={{
                        width: `${8 * (METRICS.blockInfoFactor ?? 5)}px`,
                        height: `${8 * (METRICS.blockInfoFactor ?? 5)}px`
                    }}
                    title={strings().blockHelp}
                    disabled
                >?</button>
            </div>

            <div class="build__requirements">
                {(BLOCK_SPECS[block]?.requirements ?? []).map(({item, amount}) => (
                    <div class="build__stack" key={item}>
                        <ContentIcon type="item" name={item} size={8 * (METRICS.requirementIconFactor ?? 2)} />
                        <span class="build__item" style={{maxWidth: `${METRICS.requirementNameWidth ?? 140}px`}}>
                            {named('item', item)}
                        </span>
                        <span class="build__amount">*/{amount}</span>
                    </div>
                ))}
            </div>
        </div>
    )
}

/**
 * Здание под курсором. `Building.display`: тот же заголовок с иконкой и именем, под ним
 * полоски состояния — у всех есть здоровье (`Pal.health`), а у складов ещё и содержимое.
 */
function BuildingInfo({building}) {
    const items = building.items === null ? [] : [...building.items].filter(([, amount]) => amount > 0)

    return (
        <div class="build__top">
            <div class="build__header">
                <ContentIcon type="block" name={building.type} size={8 * (METRICS.iconMedFactor ?? 4)} />

                <div
                    class="build__title"
                    style={{
                        width: `${METRICS.blockNameWidth ?? 190}px`,
                        marginLeft: `${METRICS.blockNamePad ?? 5}px`
                    }}
                >
                    <span class="build__name">{named('block', building.type)}</span>
                </div>
            </div>

            <div class="build__bar">
                <div
                    class="build__bar-fill"
                    style={{width: `${Math.max(0, Math.min(1, building.health / building.maxHealth)) * 100}%`}}
                />
                <span class="build__bar-text">{Math.round(building.health)} / {building.maxHealth}</span>
            </div>

            {items.length > 0 && (
                <div class="build__requirements">
                    {items.map(([item, amount]) => (
                        <div class="build__stack" key={item}>
                            <ContentIcon type="item" name={item} size={8 * (METRICS.requirementIconFactor ?? 2)} />
                            <span class="build__item">{named('item', item)}</span>
                            <span class="build__amount">{amount}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
