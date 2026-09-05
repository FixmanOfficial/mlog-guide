/**
 * Девятипатчи игры в виде переменных CSS.
 *
 * Числа приходят из `core/data/nine-patches.json`, а его снимает `tools/gen-nine.mjs` прямо
 * со спрайтов: толщина рамки, срез угла, цвета и прозрачность заливки. Вёрстка на них
 * ссылается переменными, поэтому «не та рамка» больше не вопрос внимательности.
 *
 * Имена переменных: `--button-border`, `--button-cut`, `--button-frame`, `--button-fill`
 * и так же для `pane`, `pane-solid`, `white-pane`.
 */

import data from '@mlog/core/data/nine-patches.json' with {type: 'json'}

export const PATCHES = data.patches

const rgba = (hex, alpha) => {
    const value = parseInt(hex.slice(1), 16)
    const channels = [value >> 16 & 0xff, value >> 8 & 0xff, value & 0xff]

    return alpha >= 1 ? hex : `rgb(${channels.join(' ')} / ${alpha})`
}

/** Переменные одного девятипатча: `--<имя>-border`, `-cut`, `-frame`, `-fill`. */
export function variables(name) {
    const patch = PATCHES[name]

    return {
        [`--${name}-border`]: `${patch.border}px`,
        [`--${name}-cut`]: `${patch.cut}px`,
        [`--${name}-frame`]: rgba(patch.frame, patch.frameAlpha),
        [`--${name}-fill`]: rgba(patch.fill, patch.fillAlpha)
    }
}

let applied = false

/** Ставит переменные всех девятипатчей на корень документа. Второй вызов ничего не делает. */
export function applyNinePatches(root = document.documentElement) {
    if (applied) return

    for (const name of Object.keys(PATCHES)) {
        for (const [property, value] of Object.entries(variables(name))) {
            root.style.setProperty(property, value)
        }
    }

    applied = true
}
