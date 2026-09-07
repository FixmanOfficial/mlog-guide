import {createPortal} from 'preact/compat'
import {useEffect, useRef} from 'preact/hooks'

/**
 * Затемнение на весь экран, в котором живут диалоги.
 *
 * Рисуется прямо в `body`, а не там, где стоит редактор: у страницы вокруг могут быть свои
 * слои со своим порядком, и окно, положенное внутрь такого слоя, окажется под шапкой сайта.
 * В игре диалог занимает весь экран, значит и здесь он должен быть выше всего.
 *
 * Escape закрывает окно — это `BaseDialog.addCloseListener`, который вешает на диалог
 * `closeOnBack`. Окна кладутся стопкой (окно программы, поверх него меню добавления),
 * и закрывается всегда верхнее: отсюда общий на всех список, а не обработчик на каждом.
 */

/** Открытые окна, снизу вверх. Верхнее закрывается первым. */
const stack = []

function onKeyDown(event) {
    if (event.key !== 'Escape' || stack.length === 0) return

    // Иначе Escape дойдёт до страницы и закроет заодно то, что под окном
    event.preventDefault()
    event.stopPropagation()

    stack[stack.length - 1]()
}

export function Overlay({full = false, onClose, children}) {
    // Обработчик ставится один раз на всё время жизни окна, а закрыть должен свежий onClose
    const close = useRef(onClose)
    close.current = onClose

    useEffect(() => {
        const entry = () => close.current?.()

        stack.push(entry)
        if (stack.length === 1) document.addEventListener('keydown', onKeyDown, true)

        return () => {
            const at = stack.indexOf(entry)
            if (at >= 0) stack.splice(at, 1)
            if (stack.length === 0) document.removeEventListener('keydown', onKeyDown, true)
        }
    }, [])

    return createPortal(
        <div class={`overlay${full ? ' overlay--full' : ''}`} onClick={onClose}>
            {children}
        </div>,
        document.body
    )
}
