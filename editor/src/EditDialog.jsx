import {useState} from 'preact/hooks'

import {Overlay} from './Overlay.jsx'
import {Icon} from './Icon.jsx'

/**
 * Окно «Правка» — перенос кнопки `@edit` из `LogicDialog`.
 *
 * В игре это список кнопок 280 на 60 с иконкой слева: очистить, скопировать в буфер, загрузить
 * из буфера, перезапустить. Очистка спрашивает подтверждение, загрузка гаснет, когда в буфере
 * пусто. Кнопка переименования есть только у процессоров мира, её здесь нет.
 *
 * Отличие от игры вынужденное: браузер может не дать прочитать буфер обмена без разрешения.
 * Тогда вместо тихой ошибки открывается поле, куда программу можно вставить руками.
 */
export function EditDialog({text, onLoad, onClear, onRestart, onClose}) {
    const [paste, setPaste] = useState(null)
    const [confirming, setConfirming] = useState(false)

    const copy = () => {
        navigator.clipboard?.writeText(text)
        onClose()
    }

    const load = async () => {
        try {
            const clipboard = await navigator.clipboard.readText()
            // LogicDialog: перевод строки из Windows приводится к обычному
            onLoad(clipboard.replace(/\r\n/g, '\n'))
            onClose()
        } catch {
            setPaste('')
        }
    }

    return (
        <Overlay onClose={onClose}>
            <div class="dialog dialog--narrow" onClick={(event) => event.stopPropagation()}>
                <div class="dialog__title">Правка</div>

                <div class="dialog__body">
                    {paste === null ? (
                        <div class="edit-list">
                            {confirming ? (
                                <>
                                    <div class="edit-list__question">Точно очистить программу?</div>
                                    <button class="edit-list__item" onClick={() => { onClear(); onClose() }}>
                                        <Icon name="cancel" size={24} />
                                        <span>Да, очистить</span>
                                    </button>
                                    <button class="edit-list__item" onClick={() => setConfirming(false)}>
                                        <Icon name="left" size={24} />
                                        <span>Отмена</span>
                                    </button>
                                </>
                            ) : (
                                <>
                                    <button class="edit-list__item" onClick={() => setConfirming(true)}>
                                        <Icon name="cancel" size={24} />
                                        <span>Очистить</span>
                                    </button>
                                    <button class="edit-list__item" onClick={copy}>
                                        <Icon name="copy" size={24} />
                                        <span>Скопировать в буфер</span>
                                    </button>
                                    <button class="edit-list__item" onClick={load}>
                                        <Icon name="download" size={24} />
                                        <span>Загрузить из буфера</span>
                                    </button>
                                    <button class="edit-list__item" onClick={() => { onRestart(); onClose() }}>
                                        <Icon name="refresh-1" size={24} />
                                        <span>Перезапустить</span>
                                    </button>
                                </>
                            )}
                        </div>
                    ) : (
                        <div class="edit-list">
                            <div class="edit-list__question">
                                Браузер не дал прочитать буфер. Вставьте программу сюда:
                            </div>
                            <textarea
                                class="edit-list__text"
                                value={paste}
                                autoFocus
                                onInput={(event) => setPaste(event.currentTarget.value)}
                            />
                            <button
                                class="edit-list__item"
                                onClick={() => { onLoad(paste.replace(/\r\n/g, '\n')); onClose() }}
                            >
                                <Icon name="download" size={24} />
                                <span>Загрузить</span>
                            </button>
                        </div>
                    )}
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
