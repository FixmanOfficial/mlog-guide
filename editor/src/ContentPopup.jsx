import {useState} from 'preact/hooks'

import sprites from '@mlog/core/data/sprites.json'

import {ENUMS, ENUM_PARAMS} from './program.js'
import {propertyTip, contentName} from './tooltips.js'
import {tipProps} from './tip.js'
import {Icon} from './Icon.jsx'
import {useAnchored, anchoredStyle} from './anchor.js'

/**
 * Выбор контента для `sensor` — то самое большое меню.
 *
 * Строение из LStatements.SensorStatement.build: четыре вкладки с иконками `box`, `liquid`,
 * `units` и `tree`, под ними стопка шириной 240. Предметы, жидкости, юниты и блоки идут
 * иконками по 40 пикселей, по шесть в ряд, а свойства — списком кнопок 240 на 40, по одной
 * в строке.
 *
 * Юниты и блоки лежат в ОДНОЙ вкладке: в игре третья таблица перечисляет сначала юнитов,
 * потом блоки.
 */

const TABS = [
    {id: 'item', icon: 'box', types: ['item']},
    {id: 'liquid', icon: 'liquid', types: ['liquid']},
    {id: 'unit', icon: 'units', types: ['unit', 'block']},
    {id: 'property', icon: 'tree', types: []}
]

/** Свойства, которые умеет читать sensor: у них не больше одного параметра. LAccess.senseable */
const PROPERTIES = ENUMS.LAccess.filter(value => (ENUM_PARAMS.LAccess[value] ?? []).length <= 1)

export function ContentPopup({current, anchor, onPick, onClose}) {
    const [tab, setTab] = useState('item')

    // Меню держится за свою кнопку и переезжает вместе с ней, когда страницу прокручивают
    const {ref, position} = useAnchored(anchor, (box, size) => ({
        left: Math.min(Math.max(4, box.left - size.width / 2), window.innerWidth - size.width - 4),
        top: Math.min(Math.max(4, box.bottom + 4), window.innerHeight - size.height - 4)
    }), [tab])

    const active = TABS.find(entry => entry.id === tab)
    const names = active.types.flatMap(type =>
        Object.keys(sprites.index[type] ?? {}).map(name => ({type, name})))

    return (
        <div class="popup-overlay" onClick={onClose}>
            <div
                class="content-popup"
                ref={ref}
                style={anchoredStyle(position)}
                onClick={(event) => event.stopPropagation()}
            >
                <div class="content-popup__scroll">
                <div class="content-popup__tabs">
                    {TABS.map(entry => (
                        <button
                            key={entry.id}
                            class={`content-popup__tab${tab === entry.id ? ' content-popup__tab--current' : ''}`}
                            onClick={() => setTab(entry.id)}
                        >
                            <Icon name={entry.icon} size={26} />
                        </button>
                    ))}
                </div>

                {tab === 'property' ? (
                    <div class="content-popup__list">
                        {PROPERTIES.map(name => (
                            <button
                                key={name}
                                class={`content-popup__item${current === `@${name}` ? ' content-popup__item--current' : ''}`}
                                {...tipProps(propertyTip(name))}
                                onClick={() => onPick(`@${name}`)}
                            >
                                {name}
                            </button>
                        ))}
                    </div>
                ) : (
                    <div class="content-popup__grid">
                        {names.map(({type, name}) => (
                            <button
                                key={`${type}/${name}`}
                                class={`content-popup__cell${current === `@${name}` ? ' content-popup__cell--current' : ''}`}
                                title={contentName(type, name) ?? name}
                                onClick={() => onPick(`@${name}`)}
                            >
                                <ContentIcon type={type} name={name} />
                            </button>
                        ))}
                    </div>
                )}
                </div>
            </div>
        </div>
    )
}

/**
 * Одна иконка из атласа: сдвигаем фон на её место и масштабируем весь атлас так, чтобы
 * иконка вписалась в квадрат стороной `size`. Иконки в атласе разного размера и не все
 * квадратные — в игре тоже, поэтому пропорции сохраняем, а не растягиваем.
 *
 * Размер самого узла — размер иконки, а не квадрата: у юнита спрайт вытянут, и в квадрате
 * оставалось место, где виден атлас, то есть соседние спрайты. До квадрата узел добирают
 * поля, чтобы сетка меню не поехала.
 */
export function ContentIcon({type, name, size = 32}) {
    const entry = sprites.index[type]?.[name]
    if (entry === undefined) return <span class="content-icon content-icon--missing">{name.slice(0, 2)}</span>

    const scale = size / Math.max(entry.width, entry.height)
    const width = entry.width * scale
    const height = entry.height * scale

    return (
        <span
            class="content-icon"
            style={{
                width: `${width}px`,
                height: `${height}px`,
                margin: `${(size - height) / 2}px ${(size - width) / 2}px`,
                backgroundSize: `${sprites.width * scale}px ${sprites.height * scale}px`,
                backgroundPosition: `${-entry.x * scale}px ${-entry.y * scale}px`
            }}
        />
    )
}
