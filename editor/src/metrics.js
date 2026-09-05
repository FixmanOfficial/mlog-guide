/**
 * Размеры игры переменными CSS.
 *
 * Числа приходят из `core/data/metrics.json`, а его снимает `tools/gen-metrics.mjs` прямо
 * из исходников. Вёрстка ссылается на них как `var(--m-header-height)`, поэтому одно и то же
 * число не может оказаться разным в стилях и в коде.
 *
 * Имена переводятся из `headerHeight` в `--m-header-height`.
 */

import {METRICS} from './theme.js'

const dashed = (name) => name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)

/** Доли — это доли, всё остальное пиксели. */
const value = (number) => Number.isInteger(number) ? `${number}px` : String(number)

let applied = false

export function applyMetrics(root = document.documentElement) {
    if (applied) return

    for (const [name, number] of Object.entries(METRICS)) {
        root.style.setProperty(`--m-${dashed(name)}`, value(number))
    }

    applied = true
}
