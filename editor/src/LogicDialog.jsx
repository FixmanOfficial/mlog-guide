import {useState} from 'preact/hooks'

import {Editor} from './Editor.jsx'
import {EditDialog} from './EditDialog.jsx'
import {Icon} from './Icon.jsx'
import {Overlay} from './Overlay.jsx'
import {fromText, toText, MAX_INSTRUCTIONS} from './program.js'

/**
 * Окно редактора процессора — то, что в игре открывается щелчком по блоку (`LogicDialog`).
 *
 * В игре оно занимает весь экран: `Styles.fullDialog` кладёт позади сплошной чёрный, а рамки
 * у окна нет вовсе — её рисует не диалог, а содержимое. Снизу ряд кнопок 160 на 64; из четырёх
 * игровых здесь три: «Назад», «Правка» и «Добавить». Четвёртой, «Переменные», не нужно —
 * таблица переменных и так всё время на странице.
 *
 * Заголовок — имя связи процессора, как оно подписано в мире: игрок должен понимать,
 * какой из процессоров правит.
 */
export function LogicDialog({title, initial, onChange, onRestart, onClose, counter = null,
    privileged = false, unitControl = true}) {
    const [program, setProgram] = useState(initial)
    const [editing, setEditing] = useState(false)
    const [adding, setAdding] = useState(false)

    // Замена программы целиком: редактор держит свой список, поэтому пересобираем его заново
    const [version, setVersion] = useState(0)

    const replace = (statements) => {
        setProgram(statements)
        setVersion(version + 1)
        onChange?.(toText(statements), statements)
    }

    return (
        <Overlay full onClose={onClose}>
            <div class="logic-dialog" onClick={(event) => event.stopPropagation()}>
                <div class="dialog__title">{title}</div>

                <div class="logic-dialog__canvas">
                    <Editor
                        key={version}
                        counter={counter}
                        privileged={privileged}
                        unitControl={unitControl}
                        addOpen={adding}
                        onAddClose={() => setAdding(false)}
                        initial={program}
                        onChange={(text, statements) => {
                            setProgram(statements)
                            onChange?.(text, statements)
                        }}
                    />
                </div>

                <div class="dialog__buttons">
                    <button class="game-button logic-dialog__button" onClick={onClose}>
                        <Icon name="left" size={22} />
                        <span>Назад</span>
                    </button>

                    <button class="game-button logic-dialog__button" onClick={() => setEditing(true)}>
                        <Icon name="pencil_" size={22} />
                        <span>Правка</span>
                    </button>

                    {/* LogicDialog: кнопка гаснет на пределе в 1000 инструкций */}
                    <button
                        class="game-button logic-dialog__button"
                        disabled={program.length >= MAX_INSTRUCTIONS}
                        onClick={() => setAdding(true)}
                    >
                        <Icon name="add" size={22} />
                        <span>Добавить</span>
                    </button>
                </div>
            </div>

            {editing && (
                <EditDialog
                    text={toText(program)}
                    onLoad={(text) => replace(fromText(text))}
                    onClear={() => replace([])}
                    onRestart={() => onRestart?.()}
                    onClose={() => setEditing(false)}
                />
            )}
        </Overlay>
    )
}
