/**
 * Сокращение больших чисел — `UI.formatAmount`.
 *
 * Панель ресурсов показывает не 39000, а «39к», и пороги там неровные: тысячи сокращаются
 * с одним знаком после запятой, но начиная с десяти тысяч — уже без него, целыми. Суффиксы
 * переводятся, поэтому берутся из бандла игры (`unit.thousands` и соседние).
 *
 * Суффикс приходит в разметке `[gray]к[]` — его разбирает та же `parseMarkup`.
 */

import bundle from '@mlog/core/data/i18n/ru.json' with {type: 'json'}

/** Strings.fixed(value, 1): один знак после запятой, без округления вверх до целого вида. */
const fixed = (value) => value.toFixed(1)

export function formatAmount(number, suffixes = bundle.ui) {
    if (!Number.isFinite(number)) return number > 0 ? '∞' : '-∞'

    const magnitude = Math.abs(number)
    const sign = number < 0 ? '-' : ''

    const suffix = (letter) => `[gray]${letter}[]`

    if (magnitude >= 1_000_000_000) {
        return sign + fixed(magnitude / 1_000_000_000) + suffix(suffixes.billions)
    }

    if (magnitude >= 1_000_000) {
        return sign + fixed(magnitude / 1_000_000) + suffix(suffixes.millions)
    }

    // Десять тысяч и больше — целыми, и знак здесь теряется вместе с дробной частью:
    // так в игре, `number / 1000` берётся от исходного числа, а не от модуля
    if (magnitude >= 10_000) {
        return Math.trunc(number / 1000) + suffix(suffixes.thousands)
    }

    if (magnitude >= 1000) {
        return sign + fixed(magnitude / 1000) + suffix(suffixes.thousands)
    }

    return String(number)
}
