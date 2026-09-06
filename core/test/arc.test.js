import test from 'node:test'
import assert from 'node:assert/strict'

import {
    PI, E, radDeg, parseDouble, Rand, angle, dst, sinDeg, cosDeg, moveToward, Vec2,
    randomSeed, packPoint
} from '../src/arc.js'
import {Processor} from '../src/vm.js'

test('@pi это float из Mathf, а не число пи двойной точности', () => {
    // 3.1415927f, расширенное до double. Разница видна в mlog начиная с седьмого знака
    assert.equal(PI, 3.1415927410125732)
    assert.notEqual(PI, Math.PI)

    const processor = new Processor('set result @pi')
    processor.step()
    assert.equal(processor.num('result'), 3.1415927410125732)
})

test('@e и @radToDeg тоже float', () => {
    assert.equal(E, 2.7182817459106445)
    assert.equal(radDeg, 57.2957763671875)
})

test('atan2 из arc — приближение, и ошибка видна прямо в mlog', () => {
    // op angle result 1 0 возвращает НЕ ноль: полином точен в 45 градусах и ошибается на осях
    const alongX = angle(1, 0)

    assert.notEqual(alongX, 0)
    assert.ok(Math.abs(alongX) < 0.0001)

    // А в кратных 45 градусам приближение попадает точно
    assert.equal(angle(1, 1), 45)
    assert.equal(angle(0, 1), 90)
})

test('len считается во float и округляется на каждом шаге', () => {
    assert.equal(dst(3, 4), 5)
    // Результат — число одинарной точности, расширенное до double
    assert.equal(dst(1, 1), Math.fround(dst(1, 1)))
})

test('хвостовые f и точка отбрасываются при разборе числа', () => {
    assert.equal(parseDouble('5f'), 5)
    assert.equal(parseDouble('5F'), 5)
    assert.equal(parseDouble('5.'), 5)
})

test('дробь с экспонентой числом НЕ является', () => {
    // Дробная часть проверяется раньше экспоненты, и разбор "5e3" как целого проваливается
    assert.ok(Number.isNaN(parseDouble('1.5e3')))

    // А целое с экспонентой разбирается нормально
    assert.equal(parseDouble('1e3'), 1000)
    assert.equal(parseDouble('1e-3'), 0.001)
})

test('дробь с экспонентой становится именем переменной, а не числом', () => {
    const processor = new Processor('set a 1.5e3')
    processor.step()

    // Значение осталось объектом null: справа оказалась пустая переменная
    assert.equal(processor.get('a').isobj, true)
    assert.ok(processor.get('1.5e3') !== undefined)
})

test('переполнение при разборе числа даёт отказ, а не бесконечность', () => {
    assert.ok(Number.isNaN(parseDouble('99999999999999999999999')))
})

test('Rand повторяет последовательность при равном seed', () => {
    const first = new Rand(42n)
    const second = new Rand(42n)

    const a = Array.from({length: 5}, () => first.nextDouble())
    const b = Array.from({length: 5}, () => second.nextDouble())

    assert.deepEqual(a, b)
    assert.ok(a.every(value => value >= 0 && value < 1))
})

test('разные seed дают разные последовательности', () => {
    assert.notEqual(new Rand(1n).nextDouble(), new Rand(2n).nextDouble())
})

test('синус в arc берётся из таблицы, а не считается', () => {
    // Mathf.sin: 16384 значения, шаг 360/16384 градуса. Отсюда и ошибка в пятом знаке,
    // и то, что она одинаковая в игре и у нас
    const index = Math.trunc(30 * 16384 / 360)
    const expected = Math.sin((index + 0.5) / 16384 * Math.fround(PI * 2))

    assert.equal(sinDeg(30), Math.fround(expected))
    assert.notEqual(sinDeg(30), 0.5)
})

test('четверти в таблице синусов поправлены руками и потому точные', () => {
    assert.equal(sinDeg(0), 0)
    assert.equal(sinDeg(90), 1)
    assert.equal(sinDeg(180), 0)
    assert.equal(sinDeg(270), -1)
    assert.equal(cosDeg(0), 1)
})

test('поворот на прямой угол не оставляет мусора', () => {
    const vector = new Vec2(1, 0).rotate(90)

    assert.equal(vector.x, 0)
    assert.equal(vector.y, 1)
})

test('setLength не удлиняет нулевой вектор, limit не удлиняет короткий', () => {
    assert.equal(new Vec2(0, 0).setLength(5).len(), 0)
    assert.equal(new Vec2(3, 4).limit(10).len(), 5)
    assert.equal(new Vec2(3, 4).limit(2.5).len(), 2.5)
})

test('moveToward доворачивает через ноль по короткой стороне', () => {
    assert.equal(moveToward(350, 10, 5), 355)
    assert.equal(moveToward(10, 350, 5), 5)

    // Ближе шага — сразу цель, без проскока
    assert.equal(moveToward(10, 12, 5), 12)
})

test('вариант плитки зависит только от координат, а не от порядка отрисовки', () => {
    // Mathf.randomSeed от Point2.pack: один и тот же тайл всегда выглядит одинаково,
    // поэтому карту можно перерисовывать сколько угодно раз
    const at = (x, y) => randomSeed(packPoint(x, y), 0, 2)

    assert.equal(at(5, 7), at(5, 7))
    assert.ok(Array.from({length: 40}, (_, i) => at(i, 3)).every(v => v >= 0 && v <= 2))

    // Соседние тайлы получают разные варианты — иначе поле было бы одноцветным
    const row = Array.from({length: 20}, (_, i) => at(i, 0))
    assert.ok(new Set(row).size > 1)
})

test('упаковка координат повторяет Point2.pack', () => {
    assert.equal(packPoint(0, 0), 0)
    assert.equal(packPoint(1, 0), 1 << 16)
    assert.equal(packPoint(0, 1), 1)
    assert.notEqual(packPoint(1, 2), packPoint(2, 1))
})
