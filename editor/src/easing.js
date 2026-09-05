/**
 * Кривые анимаций для CSS.
 *
 * Игра задаёт анимацию парой «длительность и кривая»: ряд настройки блока выезжает за
 * 0.07 секунды по `Interp.pow3Out`. Длительности переносятся числами прямо в стили, а кривые
 * приходят отсюда: они посчитаны по формулам arc и переведены в `linear(...)`.
 *
 * Значения ставятся переменными на корень документа, чтобы стили писались обычным
 * `var(--ease-pow3-out)`, а не длинной строкой из полусотни чисел.
 */

import {cssEasing, pow3Out, pow2Out, pow3In, smooth} from '@mlog/core/src/interp.js'

export const EASINGS = {
    'pow3-out': cssEasing(pow3Out),
    'pow3-in': cssEasing(pow3In),
    'pow2-out': cssEasing(pow2Out),
    smooth: cssEasing(smooth)
}

let applied = false

/** Ставит кривые переменными на `:root`. Второй вызов ничего не делает. */
export function applyEasings(root = document.documentElement) {
    if (applied) return

    for (const [name, value] of Object.entries(EASINGS)) {
        root.style.setProperty(`--ease-${name}`, value)
    }

    applied = true
}
