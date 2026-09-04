/**
 * Операции op и условия jump.
 *
 * Перенос logic/LogicOp.java и logic/ConditionOp.java. Тонкости:
 *
 *  - сравнение чисел идёт с эпсилоном 1e-6, а не точно;
 *  - битовые операции работают в 64 битах через (long), поэтому здесь BigInt, а не операторы JS;
 *  - тригонометрия в градусах;
 *  - angle, angleDiff и len считаются во float, отсюда Math.fround.
 */

import {Diagnostic} from './errors.js'

export const EPSILON = 0.000001

const LONG_MIN = -(2n ** 63n)
const LONG_MAX = 2n ** 63n - 1n
const MASK = 2n ** 64n

/** Приведение double к long по правилам Java: усечение к нулю, NaN в ноль, выход за диапазон в границу. */
function toLong(value) {
    if (Number.isNaN(value)) return 0n
    if (value <= -(2 ** 63)) return LONG_MIN
    if (value >= 2 ** 63) return LONG_MAX
    return BigInt(Math.trunc(value))
}

/** Обратно в число со знаковым переполнением, как при выходе из long. */
function fromLong(value) {
    let wrapped = ((value % MASK) + MASK) % MASK
    if (wrapped > LONG_MAX) wrapped -= MASK
    return Number(wrapped)
}

const bitwise = (fn) => (a, b) => fromLong(fn(toLong(a), toLong(b)))

/** Angles.angle: направление вектора в градусах, приведённое к [0, 360). */
function angle(x, y) {
    const degrees = Math.fround(Math.atan2(y, x) * (180 / Math.PI))
    return degrees < 0 ? degrees + 360 : degrees
}

/** Angles.angleDist: кратчайшее расстояние между направлениями, [0, 180]. */
function angleDiff(a, b) {
    const mod = (value) => ((value % 360) + 360) % 360
    const first = mod(a)
    const second = mod(b)
    const forward = first - second < 0 ? first - second + 360 : first - second
    const backward = second - first < 0 ? second - first + 360 : second - first
    return Math.fround(Math.min(forward, backward))
}

/**
 * Rand из arc — xorshift128+. Игра засеивает его случайно при старте, поэтому совпасть с ней
 * значение в значение невозможно и не нужно. Нам важна воспроизводимость: одинаковый seed даёт
 * одинаковую последовательность, иначе тесты и перемотка симуляции не работают.
 */
export class Rand {
    constructor(seed = 0n) {
        this.setSeed(seed)
    }

    setSeed(seed) {
        // Разгоняем seed splitmix-подобным шагом, чтобы нулевое состояние не выродилось.
        const scramble = (value) => BigInt.asUintN(64, value * 0x9e3779b97f4a7c15n + 0x1n)
        this.seed0 = scramble(BigInt(seed))
        this.seed1 = scramble(this.seed0)
        if (this.seed0 === 0n && this.seed1 === 0n) this.seed1 = 1n
    }

    nextLong() {
        let s1 = this.seed0
        const s0 = this.seed1

        this.seed0 = s0
        s1 = BigInt.asUintN(64, s1 ^ BigInt.asUintN(64, s1 << 23n))
        this.seed1 = BigInt.asUintN(64, s1 ^ s0 ^ (s1 >> 17n) ^ (s0 >> 26n))

        return BigInt.asUintN(64, this.seed1 + s0)
    }

    /** Rand.nextDouble: старшие 53 бита, как в arc. */
    nextDouble() {
        return Number(this.nextLong() >> 11n) * (2 ** -53)
    }
}

/** Общий генератор: соответствует GlobalVars.rand, но с фиксированным seed. */
export const rand = new Rand(1n)

/**
 * Таблица операций. unary означает, что второй аргумент не используется.
 * objFunction есть только у equal и notEqual: когда оба аргумента объекты, сравниваются они,
 * а не их числовые представления.
 */
export const operations = {
    add: {fn: (a, b) => a + b},
    sub: {fn: (a, b) => a - b},
    mul: {fn: (a, b) => a * b},
    div: {fn: (a, b) => a / b},
    idiv: {fn: (a, b) => Math.floor(a / b)},
    mod: {fn: (a, b) => a % b},
    emod: {fn: (a, b) => ((a % b) + b) % b},
    pow: {fn: (a, b) => Math.pow(a, b)},

    equal: {fn: (a, b) => Math.abs(a - b) < EPSILON ? 1 : 0, objFn: (a, b) => objectsEqual(a, b) ? 1 : 0},
    notEqual: {fn: (a, b) => Math.abs(a - b) < EPSILON ? 0 : 1, objFn: (a, b) => objectsEqual(a, b) ? 0 : 1},
    land: {fn: (a, b) => a !== 0 && b !== 0 ? 1 : 0},
    lessThan: {fn: (a, b) => a < b ? 1 : 0},
    lessThanEq: {fn: (a, b) => a <= b ? 1 : 0},
    greaterThan: {fn: (a, b) => a > b ? 1 : 0},
    greaterThanEq: {fn: (a, b) => a >= b ? 1 : 0},
    // strictEqual разбирается отдельно в исполнителе: ему нужны сами переменные, а не их числа
    strictEqual: {fn: () => 0},

    shl: {fn: bitwise((a, b) => BigInt.asIntN(64, a << BigInt.asUintN(6, b)))},
    shr: {fn: bitwise((a, b) => a >> BigInt.asUintN(6, b))},
    ushr: {fn: bitwise((a, b) => BigInt.asUintN(64, a) >> BigInt.asUintN(6, b))},
    or: {fn: bitwise((a, b) => a | b)},
    and: {fn: bitwise((a, b) => a & b)},
    xor: {fn: bitwise((a, b) => a ^ b)},
    not: {unary: true, fn: (a) => fromLong(~toLong(a))},

    max: {fn: (a, b) => Math.max(a, b)},
    min: {fn: (a, b) => Math.min(a, b)},
    angle: {fn: angle},
    angleDiff: {fn: angleDiff},
    len: {fn: (a, b) => Math.fround(Math.sqrt(Math.fround(a) * Math.fround(a) + Math.fround(b) * Math.fround(b)))},
    // Simplex.raw2d из arc пока не перенесён: лучше явная диагностика, чем правдоподобное враньё
    noise: {notImplemented: Diagnostic.NOT_IMPLEMENTED, fn: () => 0},

    abs: {unary: true, fn: (a) => Math.abs(a)},
    sign: {unary: true, fn: (a) => Math.sign(a)},
    log: {unary: true, fn: (a) => Math.log(a)},
    logn: {fn: (a, b) => Math.log(a) / Math.log(b)},
    log10: {unary: true, fn: (a) => Math.log10(a)},
    floor: {unary: true, fn: (a) => Math.floor(a)},
    ceil: {unary: true, fn: (a) => Math.ceil(a)},
    round: {unary: true, fn: (a) => Math.round(a)},
    sqrt: {unary: true, fn: (a) => Math.sqrt(a)},
    rand: {unary: true, fn: (a) => rand.nextDouble() * a},

    sin: {unary: true, fn: (a) => Math.sin(a * (Math.PI / 180))},
    cos: {unary: true, fn: (a) => Math.cos(a * (Math.PI / 180))},
    tan: {unary: true, fn: (a) => Math.tan(a * (Math.PI / 180))},
    asin: {unary: true, fn: (a) => Math.asin(a) * (180 / Math.PI)},
    acos: {unary: true, fn: (a) => Math.acos(a) * (180 / Math.PI)},
    atan: {unary: true, fn: (a) => Math.atan(a) * (180 / Math.PI)}
}

/** Устаревшие имена, которые LParser молча подменяет. */
export const operationAliases = {
    atan2: 'angle',
    dst: 'len'
}

/** Structs.eq: одинаковая ссылка либо равенство по значению. */
function objectsEqual(a, b) {
    if (a === b) return true
    if (a === null || b === null) return false
    if (typeof a.equals === 'function') return a.equals(b)
    return false
}

/** Условия jump. Числовое сравнение и объектное — разные функции, как в ConditionOp. */
export const conditions = {
    equal: {fn: (a, b) => Math.abs(a - b) < EPSILON, objFn: objectsEqual},
    notEqual: {fn: (a, b) => Math.abs(a - b) >= EPSILON, objFn: (a, b) => !objectsEqual(a, b)},
    lessThan: {fn: (a, b) => a < b},
    lessThanEq: {fn: (a, b) => a <= b},
    greaterThan: {fn: (a, b) => a > b},
    greaterThanEq: {fn: (a, b) => a >= b},
    // Как и в op, разбирается отдельно: сравниваются переменные целиком
    strictEqual: {fn: () => false},
    always: {fn: () => true}
}

/** Сравнение «строго равно»: совпадает вид значения и само значение. LExecutor.OpI */
export function strictEquals(a, b) {
    if (a.isobj !== b.isobj) return false
    return a.isobj ? objectsEqual(a.objval, b.objval) : a.numval === b.numval
}

/** Проверка условия jump с учётом объектных веток. ConditionOp.test */
export function testCondition(name, a, b) {
    if (name === 'strictEqual') return strictEquals(a, b)

    const condition = conditions[name]
    if (condition === undefined) return false

    if (condition.objFn !== undefined && a.isobj && b.isobj) {
        return condition.objFn(a.obj(), b.obj())
    }

    return condition.fn(a.num(), b.num())
}
