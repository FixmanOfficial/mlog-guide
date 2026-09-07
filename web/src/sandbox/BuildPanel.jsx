import {useMemo, useState} from 'preact/hooks'

import {ContentIcon, METRICS} from '@mlog/editor'
import {Icon} from '@mlog/editor/src/Icon.jsx'

import specs from '@mlog/core/data/block-specs.json'
import bundle from '@mlog/core/data/i18n/ru.json'

/**
 * Панель строительства — правый нижний угол игры (`PlacementFragment`).
 *
 * Устройство оттуда же: справа колонка категорий кнопками 50 по две в ряд, слева сетка
 * блоков по четыре в ряд кнопками 46 со значком 32, сверху — название того блока, на который
 * смотрит курсор, и из чего он строится.
 *
 * Пустая категория в игре не пропадает, а становится чёрным квадратом — порядок кнопок
 * от этого не скачет. У нас пустых нет: строится всё, что игра считает строимым.
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

const named = (type, name) => bundle.content[type]?.[name] ?? name

/** Блоки категории: те, что игра вообще разрешает строить. */
const blocksOf = (category) => Object.entries(specs.blocks)
    .filter(([, spec]) => spec.category === category && spec.canBeBuilt === true
        && spec.buildVisibility !== 'hidden' && spec.buildVisibility !== 'debugOnly')
    .sort(([, a], [, b]) => a.id - b.id)
    .map(([name]) => name)

export function BuildPanel({selected, onSelect}) {
    const [category, setCategory] = useState('distribution')
    const [hovered, setHovered] = useState(null)

    const blocks = useMemo(() => blocksOf(category), [category])
    const shown = hovered ?? selected

    const size = METRICS.blockButtonSize ?? 46
    const columns = METRICS.blockRowWidth ?? 4

    return (
        <div class="build">
            {shown !== null && (
                <div class="build__top">
                    <div class="build__name">{named('block', shown)}</div>
                    <div class="build__cost">
                        {(specs.blocks[shown]?.requirements ?? []).map(({item, amount}) => (
                            <span class="build__stack" key={item}>
                                <ContentIcon type="item" name={item} size={8 * (METRICS.iconSmallFactor ?? 3)} />
                                {amount}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            <div class="build__body">
                <div
                    class="build__blocks"
                    style={{
                        padding: `${METRICS.blockTableMargin ?? 5}px`,
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
                            onClick={() => onSelect(selected === block ? null : block)}
                        >
                            <ContentIcon type="block" name={block} size={8 * (METRICS.iconMedFactor ?? 4)} />
                        </button>
                    ))}
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
                            onClick={() => setCategory(name)}
                        >
                            <Icon name={categoryIcon(name)} size={26} />
                        </button>
                    ))}
                </div>
            </div>
        </div>
    )
}
