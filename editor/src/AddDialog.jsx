import {useMemo, useRef, useState} from 'preact/hooks'

import {AVAILABLE} from './program.js'
import {CATEGORY_ORDER, categoryColor, displayName} from './theme.js'
import {categoryName, categoryTip, instructionTip} from './tooltips.js'
import {Icon} from './Icon.jsx'
import {Overlay} from './Overlay.jsx'

/**
 * Меню добавления инструкции. `LogicDialog.showAddDialog`:
 *
 *  - сверху поле поиска с лупой, оно получает фокус сразу, а Enter добавляет первое совпадение;
 *  - фильтр идёт и по названию инструкции, и по её типу;
 *  - категории набраны `Pal.darkishGray`: иконка, название и линия во всю оставшуюся ширину;
 *  - кнопки 130 на 50, по три в ряд, текст цветом категории шрифтом с обводкой.
 *
 * Инструкции процессора мира сюда не попадают — обычному процессору они недоступны.
 */

/** LCategory: иконка категории. Имена глифов те же, что в игре. */
const CATEGORY_ICONS = {
    io: 'logic',
    block: 'effect',
    operation: 'settings',
    control: 'rotate',
    unit: 'units',
    world: 'terrain'
}

export function AddDialog({onPick, onClose}) {
    const [search, setSearch] = useState('')
    const field = useRef(null)

    const groups = useMemo(() => {
        const text = search.trim().toLowerCase()
        const fits = (instruction) => text === ''
            || instruction.opcode.toLowerCase().includes(text)
            || displayName(instruction.opcode).toLowerCase().includes(text)

        return CATEGORY_ORDER
            .map(category => [category, AVAILABLE.filter(item => item.category === category && fits(item))])
            .filter(([, list]) => list.length > 0)
    }, [search])

    // Первое совпадение: его добавляет Enter, как в игре
    const first = groups[0]?.[1][0] ?? null

    return (
        <Overlay onClose={onClose}>
            <div class="dialog" onClick={(event) => event.stopPropagation()}>
                <div class="dialog__title">Добавить</div>

                <div class="dialog__body">
                    <div class="dialog__search">
                        <Icon name="zoom" size={22} />
                        <input
                            ref={field}
                            class="dialog__field"
                            value={search}
                            placeholder="Поиск"
                            autoFocus
                            onInput={(event) => setSearch(event.currentTarget.value)}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter' && first !== null) onPick(first.opcode)
                                if (event.key === 'Escape') onClose()
                            }}
                        />
                    </div>

                    <div class="dialog__groups">
                        {groups.map(([category, list]) => (
                            <div class="group" key={category} style={{'--category': categoryColor(category)}}>
                                <div class="group__title" title={categoryTip(category) ?? ''}>
                                    {CATEGORY_ICONS[category] !== undefined && (
                                        <Icon name={CATEGORY_ICONS[category]} size={15} />
                                    )}
                                    <span>{categoryName(category)}</span>
                                    <span class="group__line" />
                                </div>

                                <div class="group__items">
                                    {list.map(instruction => (
                                        <button
                                            class="group__item"
                                            key={instruction.opcode}
                                            title={instructionTip(instruction.opcode) ?? ''}
                                            onClick={() => onPick(instruction.opcode)}
                                        >
                                            {displayName(instruction.opcode)}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}

                        {groups.length === 0 && (
                            <div class="dialog__empty">Ничего не нашлось</div>
                        )}
                    </div>
                </div>

                <div class="dialog__buttons">
                    <button class="game-button dialog__back" onClick={onClose}>
                        <Icon name="left" size={22} />
                        <span>Назад</span>
                    </button>
                </div>
            </div>
        </Overlay>
    )
}
