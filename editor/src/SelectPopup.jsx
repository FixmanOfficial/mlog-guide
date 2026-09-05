import {useLayoutEffect, useRef, useState} from 'preact/hooks'

import {ENUM_SYMBOLS} from './program.js'
import {propertyTip} from './tooltips.js'

/**
 * Всплывающий выбор значения — сеткой, а не выпадающим списком.
 *
 * Игра показывает значения перечисления таблицей кнопок рядом с той, по которой нажали
 * (`LStatement.showSelect` и `showSelectTable`): по умолчанию 4 в ряд, кнопки 60×38,
 * у операций — 64 в ширину. Выбранное подсвечено акцентом.
 *
 * Список закрывается нажатием мимо: в игре для этого поверх сцены кладётся невидимый
 * перехватчик касаний.
 */
export function SelectPopup({
    values, current, enumName,
    columns = 4, cellWidth = 60, cellHeight = 38,
    anchor, onPick, onClose
}) {
    const symbols = ENUM_SYMBOLS[enumName] ?? {}
    const ref = useRef(null)
    const [position, setPosition] = useState(null)

    useLayoutEffect(() => {
        const button = anchor?.current
        const popup = ref.current
        if (button === null || button === undefined || popup === null) return

        const box = button.getBoundingClientRect()
        const size = popup.getBoundingClientRect()

        // Игра ставит список по центру кнопки и удерживает его в пределах экрана
        const left = Math.min(
            Math.max(4, box.left + box.width / 2 - size.width / 2),
            window.innerWidth - size.width - 4
        )
        const top = Math.min(
            Math.max(4, box.top + box.height / 2 - size.height / 2),
            window.innerHeight - size.height - 4
        )

        setPosition({left, top})
    }, [anchor, values])

    return (
        <div class="popup-overlay" onClick={onClose}>
            <div
                class="popup"
                ref={ref}
                style={{
                    gridTemplateColumns: `repeat(${columns}, ${cellWidth}px)`,
                    gridAutoRows: `${cellHeight}px`,
                    left: position === null ? '-9999px' : `${position.left}px`,
                    top: position === null ? '-9999px' : `${position.top}px`
                }}
                onClick={(event) => event.stopPropagation()}
            >
                {values.map(value => (
                    <button
                        key={value}
                        class={`popup__item${value === current ? ' popup__item--current' : ''}`}
                        title={propertyTip(value) ?? ''}
                        onClick={() => onPick(value)}
                    >
                        {symbols[value] ?? value}
                    </button>
                ))}
            </div>
        </div>
    )
}

