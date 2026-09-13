/**
 * Перенос примитивов библиотеки arc, на которые опирается логика Mindustry.
 *
 * Источник: github.com/Anuken/Arc, коммит 68a04fab6e — именно он закреплён в
 * gradle.properties Mindustry v160.3 как archash. Разбор чисел и математика в нём те же,
 * что в 5a9696f1d4 из v160.1: разошлись только звук, клавиши и раскладка таблиц.
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

    /** Rand.nextInt(): младшие 32 бита следующего long, со знаком. */
    nextInt() {
        return Number(BigInt.asIntN(32, this.nextLong()))
    }

    /**
     * Rand.nextLong(n): отбрасывает знак и берёт остаток, повторяя, если остаток попал
     * в неполный хвост диапазона. Проверка на переполнение сделана знаковым сложением,
     * поэтому её видно только на очень больших n — но повторяем как есть.
     */
    nextBounded(n) {
        const bound = BigInt(n)
        if (bound <= 0n) throw new Error('граница должна быть положительной')

        for (;;) {
            const bits = this.nextLong() >> 1n
            const value = bits % bound

            if (S64(bits - value + (bound - 1n)) >= 0n) return Number(value)
        }
    }
}

/** Mathf.isPowerOfTwo */
export const isPowerOfTwo = (value) => value !== 0 && (value & (value - 1)) === 0

/**
 * Mathf.randomSeed: «случайное» число, зависящее только от посева. Так игра выбирает вариант
 * плитки по координатам тайла — один и тот же тайл всегда выглядит одинаково, и карта
 * не мельтешит при перерисовке.
 *
 * Лишний вызов nextInt при степени двойки — не описка: без него на таких границах
 * распределение заметно перекашивается. Mathf.java:297-303
 */
export function randomSeed(seed, min, max) {
    const rand = new Rand(BigInt(seed))

    if (isPowerOfTwo(max)) rand.nextInt()

    return rand.nextBounded(max - min + 1) + min
}

/** Point2.pack: две короткие координаты в одно число. */
export const packPoint = (x, y) => ((x << 16) | (y & 0xffff)) | 0

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

        // Проверка переполнения до умножения: без неё длинное число тихо заворачивалось
        if (result < limit / base) return null

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
 *  - переполнение даёт не бесконечность, а отказ разбора;
 *  - две точки, две буквы e или точка после e — не число, а имя переменной.
 *
 * В v159.7 дробь с экспонентой числом не была: `1.5e3` разбирался дробной веткой, экспонента
 * оставалась в хвосте и разбор падал. В v160 ветки соединили — теперь это 1500, а вместе
 * с ними поменялся и порядок умножения дроби: сперва она собирается целым, потом делится.
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

    // Один минус без цифр — не число
    if (start >= end) return NaN

    let dot = -1
    let exponent = -1
    let dots = 0
    let exponents = 0

    for (let i = start; i < end; i++) {
        const char = value[i]

        if (char === '.') {
            dot = i
            dots++
        }

        if (char === 'e' || char === 'E') {
            exponent = i
            exponents++
        }
    }

    if (dots > 1 || exponents > 1) return NaN
    if (dot !== -1 && exponent !== -1 && dot > exponent) return NaN

    // Мантисса кончается там, где начинается экспонента
    const mantissaEnd = exponent !== -1 ? exponent : end

    let power = 0
    if (exponent !== -1) {
        if (exponent + 1 >= end) return NaN

        const parsedPower = parseLong(value, 10, exponent + 1, end)
        if (parsedPower === null) return NaN

        power = Number(parsedPower)
    }

    if (dot !== -1 && dot < end) {
        const whole = start === dot ? 0n : parseLong(value, 10, start, dot)
        if (whole === null) return NaN

        const digits = mantissaEnd - (dot + 1)

        // «5.» и «5.e3»: точка есть, а дробной части нет
        if (digits === 0) return Number(whole) * Math.pow(10, power) * sign

        const decimals = parseLong(value, 10, dot + 1, mantissaEnd)
        if (decimals === null || decimals < 0n) return NaN

        /*
         * Дробь собирается целым числом и только потом делится — так в v160. Прежний способ
         * (целое плюс дробь) округлял иначе, и у длинных дробей ответы расходились.
         */
        const scaled = Number(whole * BigInt(Math.pow(10, digits)) + decimals)
        return (scaled / Math.pow(10, digits)) * Math.pow(10, power) * sign
    }

    if (exponent !== -1) {
        const whole = parseLong(value, 10, start, exponent)
        if (whole === null) return NaN

        return Number(whole) * Math.pow(10, power) * sign
    }

    const parsed = parseLong(value, 10, start, end)
    return parsed === null ? NaN : Number(parsed) * sign
}

/*
 * Mathf.sin: не вычисление, а таблица на 16384 значения. Это не оптимизация ради скорости,
 * а часть семантики: угол квантуется шагом 360/16384 градуса, и любой поворот в игре
 * ложится на эту сетку. Считать через Math.sin — значит разойтись с игрой в младших разрядах,
 * а движение юнита складывается из тысяч таких шагов. Mathf.java:25
 */
const sinBits = 14
const sinMask = ~(-1 << sinBits)
const sinCount = sinMask + 1
const radFull = f(PI * 2)
const degToIndex = f(sinCount / 360)
const radToIndex = f(sinCount / radFull)

const sinTable = new Float32Array(sinCount)

for (let i = 0; i < sinCount; i++) sinTable[i] = Math.sin(f(f((i + 0.5) / sinCount) * radFull))

// Четверти правятся вручную: иначе sin(0) не ноль, а половина шага таблицы
for (let i = 0; i < 360; i += 90) sinTable[Math.trunc(f(i * degToIndex)) & sinMask] = Math.sin(f(i * degRad))

sinTable[0] = 0
sinTable[Math.trunc(f(90 * degToIndex)) & sinMask] = 1
sinTable[Math.trunc(f(180 * degToIndex)) & sinMask] = 0
sinTable[Math.trunc(f(270 * degToIndex)) & sinMask] = -1

/*
 * Индекс считается во float, и это не педантизм. В double `PI * radToIndex` даёт
 * 8191.9997 и после отбрасывания дроби попадает в соседнюю ячейку — cos(90°) выходит
 * не нулём, а 0.00019. Во float то же произведение округляется ровно до 8192.
 */
export const sin = (radians) => sinTable[Math.trunc(f(radians * radToIndex)) & sinMask]
export const cos = (radians) => sinTable[Math.trunc(f(f(radians + halfPi) * radToIndex)) & sinMask]
export const sinDeg = (degrees) => sinTable[Math.trunc(f(degrees * degToIndex)) & sinMask]
export const cosDeg = (degrees) => sinTable[Math.trunc(f(f(degrees + 90) * degToIndex)) & sinMask]

/** Mathf.clamp */
export const clamp = (value, min = 0, max = 1) => f(Math.max(Math.min(value, max), min))

/** Mathf.approach: шаг к цели, но не дальше неё. */
export const approach = (from, to, speed) => f(from + clamp(f(to - from), -speed, speed))

/** Mathf.approachDelta: тот же шаг, но за прошедшее время. Mathf.java:420 */
export const approachDelta = (from, to, speed, delta = 1) => approach(from, to, delta * speed)

/** Mathf.lerp: линейно между двумя значениями. */
export const lerp = (from, to, progress) => f(from + f(to - from) * progress)

/** `Mathf.lerpDelta`: то же сглаживание, но шаг умножается на дельту времени. Mathf.java:430 */
export const lerpDelta = (from, to, progress, delta = 1) => lerp(from, to, clamp(progress * delta))

/** Angles.within */
export const within = (a, b, margin) => angleDist(a, b) <= margin

/**
 * Angles.moveToward: поворот к цели с ограничением скорости. Направление выбирается
 * сравнением «вперёд или назад ближе», причём обе дистанции считаются как модуль разности,
 * а не по кратчайшей дуге — в исходнике именно так.
 */
export function moveToward(angle, to, speed) {
    if (Math.abs(angleDist(angle, to)) < speed) return to

    angle = mod(angle, 360)
    to = mod(to, 360)

    const forward = Math.abs(f(angle - to))
    const backward = f(360 - forward)

    return f(angle > to === backward > forward ? angle - speed : angle + speed)
}

/**
 * arc.math.geom.Vec2 — в объёме, который нужен движению. Каждое присваивание округляется
 * до float: в Java эти поля объявлены float, и накопленная разница в них видна уже
 * через сотню тиков.
 *
 * Мутабельность оставлена как в исходнике: игра переиспользует временные векторы, и порядок
 * операций в `moveTo` рассчитан именно на это.
 */
export class Vec2 {
    constructor(x = 0, y = 0) {
        this.x = f(x)
        this.y = f(y)
    }

    set(x, y) {
        if (typeof x === 'object') return this.set(x.x, x.y)
        this.x = f(x)
        this.y = f(y)
        return this
    }

    add(x, y) {
        if (typeof x === 'object') return this.add(x.x, x.y)
        this.x = f(this.x + x)
        this.y = f(this.y + y)
        return this
    }

    sub(x, y) {
        if (typeof x === 'object') return this.sub(x.x, x.y)
        this.x = f(this.x - x)
        this.y = f(this.y - y)
        return this
    }

    scl(scalar) {
        this.x = f(this.x * scalar)
        this.y = f(this.y * scalar)
        return this
    }

    len() {
        return f(Math.sqrt(f(f(this.x * this.x) + f(this.y * this.y))))
    }

    len2() {
        return f(f(this.x * this.x) + f(this.y * this.y))
    }

    /** setLength2: длина задаётся через квадраты, поэтому нулевой вектор так и остаётся нулевым. */
    setLength(length) {
        const target = f(length * length)
        const current = this.len2()

        if (current === 0 || current === target) return this
        return this.scl(f(Math.sqrt(f(target / current))))
    }

    /** limit2: укорачивает, но не удлиняет. */
    limit(limit) {
        const target = f(limit * limit)
        const current = this.len2()

        if (current > target) return this.scl(f(Math.sqrt(f(target / current))))
        return this
    }

    rotate(degrees) {
        return this.rotateRad(f(degrees * degRad))
    }

    rotateRad(radians) {
        const c = cos(radians)
        const s = sin(radians)

        const x = f(f(this.x * c) - f(this.y * s))
        const y = f(f(this.x * s) + f(this.y * c))

        this.x = x
        this.y = y
        return this
    }

    /** Vec2.trns: вектор длины amount под углом angle. */
    trns(degrees, amount) {
        return this.set(amount, 0).rotate(degrees)
    }

    setZero() {
        this.x = 0
        this.y = 0
        return this
    }

    angle() {
        const value = f(atan2(this.x, this.y) * radDeg)
        return value < 0 ? f(value + 360) : value
    }

    isZero(margin) {
        return margin === undefined ? this.x === 0 && this.y === 0 : this.len2() < margin
    }

    isNaN() {
        return Number.isNaN(this.x) || Number.isNaN(this.y)
    }

    isInfinite() {
        return !Number.isFinite(this.x) && !Number.isNaN(this.x)
            || !Number.isFinite(this.y) && !Number.isNaN(this.y)
    }

    cpy() {
        return new Vec2(this.x, this.y)
    }
}

/**
 * `Color.toDoubleBits`: RGBA8888 кладётся в **младшие 32 бита double**, а не в float.
 * Упакованный цвет из-за этого — крошечное денормализованное число, печатать его бессмысленно;
 * зато `draw col` и `unpackcolor` достают байты обратно тем же приведением.
 */
const colorBuffer = new DataView(new ArrayBuffer(8))

export function packColorBits(r, g, b, a) {
    colorBuffer.setUint32(0, 0)
    colorBuffer.setUint32(4, (((r << 24) | (g << 16) | (b << 8) | a) >>> 0))
    return colorBuffer.getFloat64(0)
}

/** Color.fromDouble: `(int)Double.doubleToRawLongBits(value)` — те же младшие 32 бита. */
export function unpackColorBits(value) {
    colorBuffer.setFloat64(0, value)
    const packed = colorBuffer.getUint32(4)

    return [
        (packed >>> 24) / 255,
        ((packed >>> 16) & 0xff) / 255,
        ((packed >>> 8) & 0xff) / 255,
        (packed & 0xff) / 255
    ]
}

/**
 * Тот же цвет, но из записи вида `#rrggbb`: непрозрачность добавляется полной.
 * Решётка необязательна — без неё раньше терялась первая цифра, и `84f491` становился
 * `04f491`, что глазом не заметишь.
 */
export const packColorHex = (hex) => {
    const value = parseInt(hex.replace('#', ''), 16)
    return packColorBits((value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff, 255)
}

