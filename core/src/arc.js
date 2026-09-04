/**
 * Перенос примитивов библиотеки arc, на которые опирается логика Mindustry.
 *
 * Источник: github.com/Anuken/Arc, коммит 208a754044 — именно он закреплён в
 * gradle.properties Mindustry v159.7 как archash.
 *
 * Всё здесь существует ради совпадения значений с игрой. Мест, где «примерно то же самое»
 * не годится, три:
 *
 *  - Mathf.PI это float 3.1415927, а не Math.PI. Отсюда и @pi в mlog отличается от настоящего;
 *  - Mathf.atan2 не точный, а полиномиальное приближение, и op angle наследует его ошибку;
 *  - арифметика во float округляется на каждом шаге, поэтому Math.fround стоит там же,
 *    где в Java происходит присваивание во float.
 */

// Mathf: константы объявлены как float, поэтому округляем их так же
export const PI = Math.fround(3.1415927)
export const halfPi = Math.fround(PI / 2)
export const radDeg = Math.fround(180 / PI)
export const degRad = Math.fround(PI / 180)
export const E = Math.fround(2.7182818)

// Для тригонометрии игра использует отдельные константы двойной точности
export const doubleDegRad = 0.017453292519943295
export const doubleRadDeg = 57.29577951308232

const f = Math.fround

/** Mathf.atn: приближение арктангенса шестью нечётными степенями. Считается в double. */
function atn(i) {
    const n = Math.abs(i)
    const c = (n - 1) / (n + 1)
    const c2 = c * c
    const c3 = c * c2
    const c5 = c3 * c2
    const c7 = c5 * c2
    const c9 = c7 * c2
    const c11 = c9 * c2

    const value = Math.PI * 0.25 +
        (0.99997726 * c - 0.33262347 * c3 + 0.19354346 * c5 -
            0.11643287 * c7 + 0.05265332 * c9 - 0.0117212 * c11)

    // Math.copySign: знак берётся у аргумента, включая знак нуля
    return f(Object.is(i, -0) || i < 0 ? -value : value)
}

/** Mathf.atan2 — обратите внимание на порядок: сначала x, потом y. */
export function atan2(x, y) {
    let n = y / x

    if (Number.isNaN(n)) {
        n = y === x ? 1 : -1
    } else if (!Number.isFinite(n)) {
        // Если n бесконечно, значит y бесконечно больше x
        x = 0
    }

    if (x > 0) return atn(n)
    if (x < 0) return y >= 0 ? f(atn(n) + PI) : f(atn(n) - PI)
    if (y > 0) return f(x + halfPi)
    if (y < 0) return f(x - halfPi)

    // Ноль для (0,0) либо NaN, если один из аргументов NaN
    return f(x + y)
}

/** Angles.angle(x, y): направление вектора в градусах, приведённое к [0, 360). */
export function angle(x, y) {
    const value = f(atan2(f(x), f(y)) * radDeg)
    return value < 0 ? f(value + 360) : value
}

/** Mathf.mod: остаток, всегда неотрицательный. */
export const mod = (value, n) => f(f(f(value % n) + n) % n)

/** Angles.angleDist: кратчайшее расстояние между направлениями, [0, 180]. */
export function angleDist(a, b) {
    const first = mod(f(a), 360)
    const second = mod(f(b), 360)

    const forward = f(first - second) < 0 ? f(f(first - second) + 360) : f(first - second)
    const backward = f(second - first) < 0 ? f(f(second - first) + 360) : f(second - first)

    return Math.min(forward, backward)
}

/** Mathf.dst(x, y): длина вектора. Умножения и сложение округляются во float. */
export function dst(x, y) {
    const fx = f(x)
    const fy = f(y)
    return f(Math.sqrt(f(f(fx * fx) + f(fy * fy))))
}

/**
 * Rand из arc: xorshift128+ с посевом через murmurHash3.
 *
 * Игра создаёт GlobalVars.rand без seed, то есть засеивает его случайно при старте — совпасть
 * с конкретным запуском игры невозможно. Зато при одинаковом seed последовательность совпадает
 * с игровой в точности, а нам нужна воспроизводимость.
 */
const U64 = (value) => BigInt.asUintN(64, value)
const S64 = (value) => BigInt.asIntN(64, value)

function murmurHash3(x) {
    x = U64(x)
    x = U64(x ^ (x >> 33n))
    x = U64(x * 0xff51afd7ed558ccdn)
    x = U64(x ^ (x >> 33n))
    x = U64(x * 0xc4ceb9fe1a85ec53n)
    x = U64(x ^ (x >> 33n))
    return x
}

export class Rand {
    constructor(seed = 0n) {
        this.setSeed(seed)
    }

    setSeed(seed) {
        const value = BigInt(seed)
        // Ноль заменяется на Long.MIN_VALUE, иначе murmurHash3 вернул бы ноль
        this.seed0 = murmurHash3(value === 0n ? -(2n ** 63n) : value)
        this.seed1 = murmurHash3(this.seed0)
    }

    nextLong() {
        let s1 = this.seed0
        const s0 = this.seed1

        this.seed0 = s0
        s1 = U64(s1 ^ U64(s1 << 23n))
        this.seed1 = U64(s1 ^ s0 ^ (s1 >> 17n) ^ (s0 >> 26n))

        return U64(this.seed1 + s0)
    }

    /** Rand.nextDouble: старшие 53 бита. Сдвиг беззнаковый, поэтому работаем с U64. */
    nextDouble() {
        return Number(this.nextLong() >> 11n) * (1 / 2 ** 53)
    }

    /** Знаковое значение — нужно, когда сравниваем с выводом Java. */
    nextSignedLong() {
        return S64(this.nextLong())
    }
}

/** Simplex.grad3: только первые две координаты участвуют в двумерном шуме. */
const grad3 = [
    [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
    [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
    [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1]
]

/** Simplex.perm: хеш на 32-битной арифметике, поэтому Math.imul и беззнаковые сдвиги. */
function perm(seed, x) {
    x = Math.imul(x & 255, 0x45d9f3b)
    x = Math.imul((x >>> 16) ^ x, (0x45d9f3b + seed) | 0)
    x = (x >>> 16) ^ x
    return x & 0xff
}

const fastfloor = (x) => x > 0 ? Math.trunc(x) : Math.trunc(x) - 1

const dot2 = (g, x, y) => g[0] * x + g[1] * y

/** Simplex.raw2d: двумерный симплекс-шум, значения в [-1, 1]. */
export function simplexRaw2d(seed, x, y) {
    const F2 = 0.5 * (Math.sqrt(3) - 1)
    const s = (x + y) * F2
    const i = fastfloor(x + s)
    const j = fastfloor(y + s)

    const G2 = (3 - Math.sqrt(3)) / 6
    const t = (i + j) * G2
    const x0 = x - (i - t)
    const y0 = y - (j - t)

    // Какой из двух треугольников симплекса
    const i1 = x0 > y0 ? 1 : 0
    const j1 = x0 > y0 ? 0 : 1

    const x1 = x0 - i1 + G2
    const y1 = y0 - j1 + G2
    const x2 = x0 - 1 + 2 * G2
    const y2 = y0 - 1 + 2 * G2

    const ii = i & 255
    const jj = j & 255
    const gi0 = perm(seed, ii + perm(seed, jj)) % 12
    const gi1 = perm(seed, ii + i1 + perm(seed, jj + j1)) % 12
    const gi2 = perm(seed, ii + 1 + perm(seed, jj + 1)) % 12

    const corner = (t0, gi, cx, cy) => {
        if (t0 < 0) return 0
        const squared = t0 * t0
        return squared * squared * dot2(grad3[gi], cx, cy)
    }

    const n0 = corner(0.5 - x0 * x0 - y0 * y0, gi0, x0, y0)
    const n1 = corner(0.5 - x1 * x1 - y1 * y1, gi1, x1, y1)
    const n2 = corner(0.5 - x2 * x2 - y2 * y2, gi2, x2, y2)

    return 70 * (n0 + n1 + n2)
}

/**
 * Приведение числа к строке так, как это делает StringBuilder.append в Java.
 *
 * Целые печатаются без дробной части — этим занимается вызывающий код, здесь только double.
 * Java уходит в экспоненциальную запись за пределами [1e-3, 1e7) и всегда оставляет хотя бы
 * один знак после точки; JS ведёт себя иначе, поэтому разница видна в print и format.
 */
export function javaDoubleToString(value) {
    if (Number.isNaN(value)) return 'NaN'
    if (!Number.isFinite(value)) return value > 0 ? 'Infinity' : '-Infinity'
    if (value === 0) return Object.is(value, -0) ? '-0.0' : '0.0'

    const magnitude = Math.abs(value)

    if (magnitude >= 1e-3 && magnitude < 1e7) {
        const text = String(value)
        return text.includes('.') || text.includes('e') ? text : `${text}.0`
    }

    // Экспоненциальная запись Java: одна цифра до точки, показатель без ведущих нулей
    const [mantissa, exponent] = value.toExponential().split('e')
    const withPoint = mantissa.includes('.') ? mantissa : `${mantissa}.0`
    const sign = exponent.startsWith('-') ? '-' : ''
    return `${withPoint}E${sign}${Math.abs(Number(exponent))}`
}

const LONG_MIN = -(2n ** 63n)
const LONG_MAX = 2n ** 63n - 1n

/**
 * Strings.parseLong: разбор целого в заданной системе счисления с проверкой переполнения.
 * Возвращает null вместо значения по умолчанию — вызывающий сам решает, что подставить.
 */
export function parseLong(text, radix, start, end) {
    let i = start
    const length = end - start
    if (length <= 0) return null

    let negative = false
    let limit = -LONG_MAX

    const first = text[i]
    if (first < '0') {
        if (first === '-') {
            negative = true
            limit = LONG_MIN
        } else if (first !== '+') {
            return null
        }

        if (length === 1) return null
        i++
    }

    let result = 0n
    const base = BigInt(radix)

    while (i < end) {
        const digit = digitValue(text[i++], radix)
        if (digit === null) return null

        result *= base
        if (result < limit + BigInt(digit)) return null
        result -= BigInt(digit)
    }

    return negative ? result : -result
}

/** Character.digit для нужных нам систем счисления. */
function digitValue(char, radix) {
    const code = char.codePointAt(0)

    let value = null
    if (code >= 48 && code <= 57) value = code - 48
    else if (code >= 97 && code <= 122) value = code - 87
    else if (code >= 65 && code <= 90) value = code - 55

    return value === null || value >= radix ? null : value
}

/**
 * Strings.parseDouble. Отличается от привычного разбора чисел так, что это заметно в mlog:
 *
 *  - хвостовые F, f и точка отбрасываются, поэтому 5f и 5. это числа;
 *  - дробная часть проверяется раньше экспоненты, поэтому 1.5e3 числом НЕ является
 *    и становится именем переменной;
 *  - переполнение даёт не бесконечность, а отказ разбора.
 */
export function parseDouble(value) {
    const length = value.length
    if (length === 0) return NaN

    let sign = 1
    let start = 0
    let end = length

    const last = value[length - 1]
    const first = value[0]

    if (last === 'F' || last === 'f' || last === '.') end--
    if (first === '+') start = 1
    if (first === '-') {
        start = 1
        sign = -1
    }

    let dot = -1
    let exponent = -1

    for (let i = start; i < end; i++) {
        const char = value[i]
        if (char === '.') dot = i
        if (char === 'e' || char === 'E') exponent = i
    }

    if (dot !== -1 && dot < end) {
        const whole = start === dot ? 0n : parseLong(value, 10, start, dot)
        if (whole === null) return NaN

        const decimals = parseLong(value, 10, dot + 1, end)
        if (decimals === null || decimals < 0n) return NaN

        const fraction = Number(decimals) / Math.pow(10, end - dot - 1)
        const wholeNumber = Number(whole)

        // Math.copySign(fraction, whole): у положительного нуля знак тоже положительный
        const signed = wholeNumber < 0 ? -fraction : fraction
        return (wholeNumber + signed) * sign
    }

    if (exponent !== -1) {
        const whole = parseLong(value, 10, start, exponent)
        if (whole === null) return NaN

        const power = parseLong(value, 10, exponent + 1, end)
        if (power === null) return NaN

        return Number(whole) * Math.pow(10, Number(power)) * sign
    }

    const parsed = parseLong(value, 10, start, end)
    return parsed === null ? NaN : Number(parsed) * sign
}
