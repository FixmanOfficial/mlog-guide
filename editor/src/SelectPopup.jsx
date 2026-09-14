import {ENUM_SYMBOLS} from './program.js'
import {propertyTip} from './tooltips.js'
import {tipProps, hideTip} from './tip.js'
import {enumLabel, useLocalization} from './names.js'
import {useAnchored, anchoredStyle, keepOnScreen} from './anchor.js'
import schema from '@mlog/core/data/instructions.json' with {type: 'json'}

/**
 * Всплывающий выбор значения — сеткой, а не выпадающим списком.
 *
 * Игра показывает значения перечисления таблицей кнопок рядом с той, по которой нажали
 * (`LStatement.showSelect` и `showSelectTable`). Размеры у каждой инструкции свои и сняты
 * генератором: у `ucontrol` это два столбца по 120, у условия три по 95, у остальных
 * умолчание. Выбранное подсвечено акцентом.
 *
 * Список закрывается нажатием мимо: в игре для этого поверх сцены кладётся невидимый
 * перехватчик касаний.
 */
/** Умолчания меню — снятые из игры, а не выбранные нами: `LStatement.showSelect` */
const DEFAULTS = schema.selectDefaults

export function SelectPopup({
    values, current, enumName,
    columns = DEFAULTS.columns,
    cellWidth = DEFAULTS.cellWidth,
    cellHeight = DEFAULTS.cellHeight,
    anchor, onPick, onClose
}) {
    const symbols = ENUM_SYMBOLS[enumName] ?? {}

    // Перерисовать список, если перевод переключили, пока он открыт
    useLocalization()

    // Игра ставит список по центру кнопки и удерживает его в пределах экрана
    const {ref, position} = useAnchored(anchor, (box, size) => keepOnScreen(box, size), [values])

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
                        {...tipProps(propertyTip(value))}
                        onClick={() => { hideTip(); onPick(value) }}
                    >
                        {enumLabel(enumName, symbols[value] ?? value)}
                    </button>
                ))}
            </div>
        </div>
    )
}

