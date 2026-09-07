import {useRef, useState} from 'preact/hooks'

import {ContentPopup} from './ContentPopup.jsx'
import {Icon} from './Icon.jsx'

/**
 * Кнопка рядом с полем свойства у `sensor`: карандаш, открывающий большое меню контента.
 *
 * Значок не меняется от выбранного значения — `b.image(Icon.pencilSmall)` в игре стоит
 * один раз, снаружи обработчика. Мы одно время показывали здесь иконку выбранного
 * контента; выглядело понятнее, но кнопка переставала быть кнопкой игры.
 * LStatements.SensorStatement.build:573-574
 */
export function ContentButton({value, onPick}) {
    const anchor = useRef(null)
    const [open, setOpen] = useState(false)

    return (
        <>
            <button
                class="content-button"
                ref={anchor}
                title="Выбрать свойство или контент"
                onClick={() => setOpen(!open)}
            >
                <Icon name="pencil_" size={20} />
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
