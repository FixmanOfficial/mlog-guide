import {createPortal} from 'preact/compat'

/**
 * Затемнение на весь экран, в котором живут диалоги.
 *
 * Рисуется прямо в `body`, а не там, где стоит редактор: у страницы вокруг могут быть свои
 * слои со своим порядком, и окно, положенное внутрь такого слоя, окажется под шапкой сайта.
 * В игре диалог занимает весь экран, значит и здесь он должен быть выше всего.
 */
export function Overlay({full = false, onClose, children}) {
    return createPortal(
        <div class={`overlay${full ? ' overlay--full' : ''}`} onClick={onClose}>
            {children}
        </div>,
        document.body
    )
}
