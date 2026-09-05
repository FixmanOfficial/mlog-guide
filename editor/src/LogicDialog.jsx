import {Editor} from './Editor.jsx'
import {Icon} from './Icon.jsx'
import {Overlay} from './Overlay.jsx'

/**
 * Окно редактора процессора — то, что в игре открывается щелчком по блоку (`LogicDialog`).
 *
 * В игре оно занимает весь экран: `Styles.fullDialog` кладёт позади сплошной чёрный, а рамки
 * у окна нет вовсе — её рисует не диалог, а содержимое. Снизу ряд кнопок, из которых здесь
 * пока только «Назад»: правка текстом и переменные живут на самой странице.
 *
 * Заголовок — имя связи процессора, как оно подписано в мире: игрок должен понимать,
 * какой из процессоров правит.
 */
export function LogicDialog({title, initial, onChange, onClose}) {
    return (
        <Overlay full onClose={onClose}>
            <div class="logic-dialog" onClick={(event) => event.stopPropagation()}>
                <div class="dialog__title">{title}</div>

                <div class="logic-dialog__canvas">
                    <Editor initial={initial} onChange={onChange} />
                </div>

                <div class="dialog__buttons">
                    <button class="dialog__back" onClick={onClose}>
                        <Icon name="left" size={22} />
                        <span>Назад</span>
                    </button>
                </div>
            </div>
        </Overlay>
    )
}
