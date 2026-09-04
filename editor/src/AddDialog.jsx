import {AVAILABLE} from './program.js'
import {CATEGORY_ORDER, categoryColor, displayName} from './theme.js'

/**
 * Меню добавления инструкции: список, сгруппированный по категориям, как в игре.
 * Инструкции процессора мира сюда не попадают — они недоступны обычному процессору.
 */
export function AddDialog({onPick, onClose}) {
    const groups = CATEGORY_ORDER
        .map(category => [category, AVAILABLE.filter(instruction => instruction.category === category)])
        .filter(([, list]) => list.length > 0)

    return (
        <div class="overlay" onClick={onClose}>
            <div class="dialog" onClick={(event) => event.stopPropagation()}>
                <div class="dialog__header">
                    <span>Инструкции</span>
                    <button class="statement__button" onClick={onClose}>✕</button>
                </div>

                <div class="dialog__groups">
                    {groups.map(([category, list]) => (
                        <div class="group" key={category} style={{'--category': categoryColor(category)}}>
                            <div class="group__title">{category}</div>

                            <div class="group__items">
                                {list.map(instruction => (
                                    <button
                                        class="group__item"
                                        key={instruction.opcode}
                                        onClick={() => onPick(instruction.opcode)}
                                    >
                                        {displayName(instruction.opcode)}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
