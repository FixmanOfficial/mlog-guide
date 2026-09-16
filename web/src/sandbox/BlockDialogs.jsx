import {useState} from 'preact/hooks'

import {Overlay} from '@mlog/editor/src/Overlay.jsx'
import {Icon} from '@mlog/editor/src/Icon.jsx'
import {uiText} from '@mlog/editor/src/names.js'
import {MAX_MESSAGE_LENGTH} from '@mlog/core/src/world.js'

import {strings} from './strings.js'

/**
 * Окна настройки блоков, которые открываются щелчком по блоку в мире.
 *
 * Сообщение правится и в игре: `MessageBlock.buildConfiguration` вешает карандаш, а тот
 * открывает окно с полем 380 на 160, счётчиком «сколько из 400» серым цветом и кнопкой «ОК».
 * Правка идёт не как `printflush`: пробелы по краям срезаются, а переносов остаётся не больше
 * двадцати четырёх — это делает `configureMessage` в ядре.
 *
 * Просмотр памяти — наша добавка: в игре содержимое ячейки посмотреть нельзя вовсе, и это
 * первое, чего не хватает, когда учишься работать с `read` и `write`.
 */

export function MessageDialog({building, onApply, onClose}) {
    const [text, setText] = useState(building.message)

    return (
        <Overlay onClose={onClose}>
            <div class="dialog dialog--narrow" onClick={(event) => event.stopPropagation()}>
                <div class="dialog__title">{strings().editMessage}</div>

                <div class="dialog__body">
                    <textarea
                        class="message-edit"
                        value={text}
                        maxLength={MAX_MESSAGE_LENGTH}
                        autoFocus
                        onInput={(event) => setText(event.currentTarget.value)}
                    />
                    <div class="message-edit__counter">
                        {text.length} / {MAX_MESSAGE_LENGTH}
                    </div>
                </div>

                <div class="dialog__buttons">
                    <button class="game-button dialog__back" onClick={onClose}>
                        <Icon name="left" size={22} />
                        <span>{uiText('back')}</span>
                    </button>
                    <button
                        class="game-button dialog__back"
                        onClick={() => { onApply(text); onClose() }}
                    >
                        <span>{uiText('ok')}</span>
                    </button>
                </div>
            </div>
        </Overlay>
    )
}

/**
 * Содержимое ячейки или банка памяти. Числа печатаются так же, как в таблице переменных:
 * целые без хвоста. Незанятые ячейки показаны нулями — они и есть нули, память чистая.
 */
export function MemoryDialog({building, onClose}) {
    const cells = [...building.memory]

    return (
        <Overlay onClose={onClose}>
            <div class="dialog" onClick={(event) => event.stopPropagation()}>
                <div class="dialog__title">{building.name}</div>

                <div class="dialog__body">
                    <div class="memory">
                        {cells.map((value, address) => (
                            <div class={`memory__cell${value === 0 ? ' memory__cell--empty' : ''}`} key={address}>
                                <span class="memory__address">{address}</span>
                                <span class="memory__value">{format(value)}</span>
                            </div>
                        ))}
                    </div>
                </div>

                <div class="dialog__buttons">
                    <button class="game-button dialog__back" onClick={onClose}>
                        <Icon name="left" size={22} />
                        <span>{uiText('back')}</span>
                    </button>
                </div>
            </div>
        </Overlay>
    )
}

/** Как в таблице переменных: целое печатается целым. LogicDialog */
function format(value) {
    return Math.abs(value - Math.round(value)) < 0.00001 ? String(Math.round(value)) : String(value)
}
