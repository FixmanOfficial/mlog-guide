import {useRef, useState} from 'preact/hooks'

import {ALIGNS} from './bodies.js'
import {SelectPopup} from './SelectPopup.jsx'
import {Icon} from './Icon.jsx'

/**
 * Карандаш рядом с полем: кнопка 40 на 40 со значком `Icon.pencilSmall`, открывающая табличку
 * подходящих значений. В игре таких мест несколько, и все они устроены одинаково —
 * `LStatement.fieldAlignSelect` и разбор символа в `PrintCharStatement.build`.
 *
 * Виды:
 *  - `align` — девять выравниваний в порядке `LStatement.aligns`, ячейки 150 на 40, по три
 *    в ряд. Порядок не алфавитный: это сетка три на три, от левого верхнего угла;
 *  - `char` — таблица ASCII с 32 по 126, ячейки 32 на 32, по восемь в ряд. Отмеченного
 *    значения тут нет: в игре кнопки простые (`Styles.flatt`), а не переключатели.
 */

/** Символы, которые предлагает `printchar`: с пробела по тильду. */
const CHARACTERS = Array.from({length: 127 - 32}, (_, index) => String.fromCharCode(32 + index))

export function PencilButton({kind, value, onPick}) {
    const anchor = useRef(null)
    const [open, setOpen] = useState(false)

    const align = kind === 'align'
    const values = align ? ALIGNS.map(name => `@${name}`) : CHARACTERS

    return (
        <>
            <button
                class="pencil"
                ref={anchor}
                title={align ? 'Выбрать выравнивание' : 'Выбрать символ'}
                onClick={() => setOpen(!open)}
            >
                <Icon name="pencil_" size={20} />
            </button>

            {open && (
                <SelectPopup
                    values={values}
                    current={align ? value : null}
                    columns={align ? 3 : 8}
                    cellWidth={align ? 150 : 32}
                    cellHeight={align ? 40 : 32}
                    anchor={anchor}
                    onPick={(picked) => {
                        // Символ уходит в поле кодом: игра пишет туда число, а не сам знак
                        onPick(align ? picked : String(picked.charCodeAt(0)))
                        setOpen(false)
                    }}
                    onClose={() => setOpen(false)}
                />
            )}
        </>
    )
}
