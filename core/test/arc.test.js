import test from 'node:test'
import assert from 'node:assert/strict'

import {PI, E, radDeg, parseDouble, Rand, angle, dst} from '../src/arc.js'
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
