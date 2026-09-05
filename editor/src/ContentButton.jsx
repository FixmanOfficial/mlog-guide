import {useRef, useState} from 'preact/hooks'

import sprites from '@mlog/core/data/sprites.json' with {type: 'json'}

import {ContentPopup, ContentIcon} from './ContentPopup.jsx'
import {Icon} from './Icon.jsx'

/**
 * Кнопка рядом с полем свойства у `sensor`. В игре это карандаш (`Icon.pencilSmall`),
 * открывающий большое меню контента. Если выбран контент, у которого есть картинка,
 * показываем её вместо карандаша — так видно, что именно выбрано.
 */
export function ContentButton({value, onPick}) {
    const anchor = useRef(null)
    const [open, setOpen] = useState(false)

    const name = value.startsWith('@') ? value.slice(1) : null
    const type = name === null ? null : typeOf(name)

    return (
        <>
            <button
                class="content-button"
                ref={anchor}
                title="Выбрать свойство или контент"
                onClick={() => setOpen(!open)}
            >
                {type === null
                    ? <Icon name="pencil_" size={20} />
                    : <ContentIcon type={type} name={name} size={24} />}
            </button>

            {open && (
                <ContentPopup
                    current={value}
                    anchor={anchor}
                    onPick={(picked) => {
                        onPick(picked)
                        setOpen(false)
                    }}
                    onClose={() => setOpen(false)}
                />
            )}
        </>
    )
}

/** К какому виду контента относится имя, если это вообще контент. */
function typeOf(name) {
    for (const type of ['item', 'liquid', 'block', 'unit']) {
        if (sprites.index[type]?.[name] !== undefined) return type
    }
    return null
}
