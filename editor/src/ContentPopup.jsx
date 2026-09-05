import {useLayoutEffect, useRef, useState} from 'preact/hooks'

import sprites from '@mlog/core/data/sprites.json' with {type: 'json'}

import {ENUMS, ENUM_PARAMS} from './program.js'
import {propertyTip, contentName} from './tooltips.js'

/**
 * Выбор контента для `sensor` — то самое большое меню с вкладками.
 *
 * В игре это не сетка значений, а отдельная таблица: предметы, жидкости, блоки и юниты
 * идут иконками по 40 пикселей, по шесть в ряд (`LStatements.SensorStatement.build`).
 * Первой вкладкой добавлены сами свойства: без них меню бесполезно, а в игре они лежат
 * в соседней кнопке.
 *
 * Иконки берутся из атласа, собранного `tools/gen-sprites.mjs`: одна картинка на весь контент.
 */

const TABS = [
    {id: 'property', title: 'Свойства'},
    {id: 'item', title: 'Предметы'},
    {id: 'liquid', title: 'Жидкости'},
    {id: 'block', title: 'Блоки'},
    {id: 'unit', title: 'Юниты'}
]

/** Свойства, которые умеет читать sensor: у них не больше одного параметра. LAccess.senseable */
const PROPERTIES = ENUMS.LAccess.filter(value => (ENUM_PARAMS.LAccess[value] ?? []).length <= 1)

export function ContentPopup({current, anchor, onPick, onClose}) {
    const ref = useRef(null)
    const [tab, setTab] = useState('property')
    const [position, setPosition] = useState(null)

    useLayoutEffect(() => {
        const button = anchor?.current
        const popup = ref.current
        if (button === null || button === undefined || popup === null) return

        const box = button.getBoundingClientRect()
        const size = popup.getBoundingClientRect()

        setPosition({
            left: Math.min(Math.max(4, box.left - size.width / 2), window.innerWidth - size.width - 4),
            top: Math.min(Math.max(4, box.bottom + 4), window.innerHeight - size.height - 4)
        })
    }, [anchor, tab])

    return (
        <div class="popup-overlay" onClick={onClose}>
            <div
                class="content-popup"
                ref={ref}
                style={position === null
                    ? {left: '-9999px', top: '-9999px'}
                    : {left: `${position.left}px`, top: `${position.top}px`}}
                onClick={(event) => event.stopPropagation()}
            >
                <div class="content-popup__tabs">
                    {TABS.map(entry => (
                        <button
                            key={entry.id}
                            class={`content-popup__tab${tab === entry.id ? ' content-popup__tab--current' : ''}`}
                            onClick={() => setTab(entry.id)}
                        >
                            {entry.title}
                        </button>
                    ))}
                </div>

                <div class={tab === 'property' ? 'content-popup__list' : 'content-popup__grid'}>
                    {tab === 'property'
                        ? PROPERTIES.map(name => (
                            <button
                                key={name}
                                class={`content-popup__item${current === `@${name}` ? ' content-popup__item--current' : ''}`}
                                title={propertyTip(name) ?? ''}
                                onClick={() => onPick(`@${name}`)}
                            >
                                {name}
                            </button>
                        ))
                        : Object.keys(sprites.index[tab] ?? {}).map(name => (
                            <button
                                key={name}
                                class={`content-popup__cell${current === `@${name}` ? ' content-popup__cell--current' : ''}`}
                                title={contentName(tab, name) ?? name}
                                onClick={() => onPick(`@${name}`)}
                            >
                                <ContentIcon type={tab} name={name} />
                            </button>
                        ))}
                </div>
            </div>
        </div>
    )
}

/** Одна иконка из атласа: сдвигаем фон на нужную клетку. */
export function ContentIcon({type, name, size = 32}) {
    const cell = sprites.index[type]?.[name]
    if (cell === undefined) return <span class="content-icon content-icon--missing">{name.slice(0, 2)}</span>

    const column = cell % sprites.columns
    const row = Math.floor(cell / sprites.columns)
    const scale = size / sprites.cell

    return (
        <span
            class="content-icon"
            style={{
                width: `${size}px`,
                height: `${size}px`,
                backgroundSize: `${sprites.columns * size}px auto`,
                backgroundPosition: `-${column * size}px -${row * size}px`,
                imageRendering: scale >= 1 ? 'pixelated' : 'auto'
            }}
        />
    )
}
