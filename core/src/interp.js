/**
 * Кривые анимации из arc — `arc/math/Interp.java`.
 *
 * Нужны, чтобы движение на сайте шло по тем же кривым, что в игре, а не «примерно так же».
 * Игра задаёт анимацию парой «длительность и кривая»: например ряд настройки блока выезжает
 * за 0.07 секунды по `Interp.pow3Out`. Длительность переносится числом, а кривая — отсюда.
 *
 * CSS нативно умеет только кубические кривые Безье, а у arc это степенные, синусные и упругие
 * функции. Поэтому кривая переводится в `linear(...)` — список опорных точек: браузер соединит
 * их отрезками, и при двух десятках точек разницы не видно.
 */

/** Interp.linear */
export const linear = (a) => a

/** Interp.smooth: обычный smoothstep. */
export const smooth = (a) => a * a * (3 - 2 * a)

/** Interp.smoother, он же fade. Кривая Кена Перлина. */
export const smoother = (a) => a * a * a * (a * (a * 6 - 15) + 10)

/** Interp.Pow: степенная, симметричная относительно середины. */
export const pow = (power) => (a) => a <= 0.5
    ? Math.pow(a * 2, power) / 2
    : Math.pow((a - 1) * 2, power) / (power % 2 === 0 ? -2 : 2) + 1

/** Interp.PowIn: медленно, потом быстро. */
export const powIn = (power) => (a) => Math.pow(a, power)

/** Interp.PowOut: быстро, потом медленно. */
export const powOut = (power) => (a) => Math.pow(a - 1, power) * (power % 2 === 0 ? -1 : 1) + 1

export const pow2 = pow(2)
export const pow2In = powIn(2)
export const pow2Out = powOut(2)
export const pow3 = pow(3)
export const pow3In = powIn(3)
export const pow3Out = powOut(3)
export const pow5 = pow(5)
export const pow5In = powIn(5)
export const pow5Out = powOut(5)

/** Interp.sine и её половинки. */
export const sine = (a) => (1 - Math.cos(a * Math.PI)) / 2
export const sineIn = (a) => 1 - Math.cos(a * Math.PI / 2)
export const sineOut = (a) => Math.sin(a * Math.PI / 2)

/**
 * Кривая в виде функции `linear()` для CSS.
 *
 * @param curve кривая из этого модуля
 * @param steps сколько опорных точек ставить; 24 хватает, чтобы глаз не отличил
 */
export function cssEasing(curve, steps = 24) {
    const points = []

    for (let i = 0; i <= steps; i++) {
        const at = i / steps
        points.push(`${Number(curve(at).toFixed(4))} ${Number((at * 100).toFixed(2))}%`)
    }

    return `linear(${points.join(', ')})`
}
