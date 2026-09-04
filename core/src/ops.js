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

import {angle, angleDist, dst, doubleDegRad, doubleRadDeg, Rand, simplexRaw2d} from './arc.js'

export const EPSILON = 0.000001

const LONG_MIN = -(2n ** 63n)
const LONG_MAX = 2n ** 63n - 1n

/** Приведение double к long по правилам Java: усечение к нулю, NaN в ноль, выход за диапазон в границу. */
function toLong(value) {
    if (Number.isNaN(value)) return 0n
    if (value <= -(2 ** 63)) return LONG_MIN
    if (value >= 2 ** 63) return LONG_MAX
    return BigInt(Math.trunc(value))
}

/**
 * Обратно в число со знаковым переполнением, как при выходе из long.
 * BigInt.asIntN делает ровно это одной операцией — вручную через два взятия остатка
 * получалось втрое медленнее, что и показал стенд tools/bench-vm.mjs.
 */
const fromLong = (value) => Number(BigInt.asIntN(64, value))

const bitwise = (fn) => (a, b) => fromLong(fn(toLong(a), toLong(b)))

/**
 * Соответствует GlobalVars.rand. Игра засеивает его случайно при старте, поэтому совпасть
 * с конкретным её запуском невозможно; нам важна воспроизводимость, отсюда фиксированный seed.
 * Сам алгоритм перенесён из arc точно, так что при равном seed последовательности совпадают.
 */
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
    angleDiff: {fn: angleDist},
    len: {fn: dst},
    noise: {fn: (a, b) => simplexRaw2d(0, a, b)},

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

    sin: {unary: true, fn: (a) => Math.sin(a * doubleDegRad)},
    cos: {unary: true, fn: (a) => Math.cos(a * doubleDegRad)},
    tan: {unary: true, fn: (a) => Math.tan(a * doubleDegRad)},
    asin: {unary: true, fn: (a) => Math.asin(a) * doubleRadDeg},
    acos: {unary: true, fn: (a) => Math.acos(a) * doubleRadDeg},
    atan: {unary: true, fn: (a) => Math.atan(a) * doubleRadDeg}
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
