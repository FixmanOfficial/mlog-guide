import {ENUM_SYMBOLS} from './program.js'
import {propertyTip} from './tooltips.js'
import {useAnchored, anchoredStyle} from './anchor.js'

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

    // Игра ставит список по центру кнопки и удерживает его в пределах экрана
    const {ref, position} = useAnchored(anchor, (box, size) => ({
        left: Math.min(
            Math.max(4, box.left + box.width / 2 - size.width / 2),
            window.innerWidth - size.width - 4
        ),
        top: Math.min(
            Math.max(4, box.top + box.height / 2 - size.height / 2),
            window.innerHeight - size.height - 4
        )
    }), [values])

    return (
        <div class="popup-overlay" onClick={onClose}>
            <div
                class="popup"
                ref={ref}
                style={{
                    gridTemplateColumns: `repeat(${columns}, ${cellWidth}px)`,
                    gridAutoRows: `${cellHeight}px`,
                    ...anchoredStyle(position)
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

