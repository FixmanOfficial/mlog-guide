import test from 'node:test'
import assert from 'node:assert/strict'

import {Processor} from '../src/vm.js'

/** Прогоняет программу до конца и возвращает процессор. */
const run = (code, steps = 64) => {
    const processor = new Processor(code)
    processor.run(steps)
    return processor
}

test('op считает арифметику', () => {
    const processor = run('op add result 2 3')
    assert.equal(processor.num('result'), 5)
})

test('idiv округляет вниз, mod и emod различаются знаком', () => {
    assert.equal(run('op idiv result -7 2').num('result'), -4)
    assert.equal(run('op mod result -7 3').num('result'), -1)
    assert.equal(run('op emod result -7 3').num('result'), 2)
})

test('equal сравнивает с эпсилоном 1e-6, а не точно', () => {
    // Разница меньше эпсилона считается равенством
    assert.equal(run('op equal result 1 1.0000001').num('result'), 1)
    assert.equal(run('op equal result 1 1.001').num('result'), 0)
})

test('битовые операции работают в 64 битах', () => {
    // При 32-битной арифметике JS результат был бы -1
    assert.equal(run('op ushr result -1 1').num('result'), 9223372036854775807)
    // ~0 = -1 в дополнительном коде
    assert.equal(run('op not result 0 0').num('result'), -1)
    assert.equal(run('op shl result 1 40').num('result'), 1099511627776)
})

test('тригонометрия считается в градусах', () => {
    assert.equal(run('op sin result 90 0').num('result'), 1)
    assert.ok(Math.abs(run('op cos result 180 0').num('result') + 1) < 1e-9)
    assert.equal(run('op asin result 1 0').num('result'), 90)
})

test('angle даёт направление вектора в диапазоне 0-360', () => {
    // Приближение arc точно попадает в кратные 45 градусам по оси y, но не по оси x
    assert.equal(run('op angle result 0 1').num('result'), 90)
    assert.equal(run('op angle result 1 1').num('result'), 45)
    assert.ok(Math.abs(run('op angle result -1 0').num('result') - 180) < 0.001)
    assert.ok(Math.abs(run('op angle result 0 -1').num('result') - 270) < 0.001)
})

test('angleDiff берёт кратчайшую дугу', () => {
    assert.equal(run('op angleDiff result 350 10').num('result'), 20)
    assert.equal(run('op angleDiff result 10 350').num('result'), 20)
})

test('strictEqual различает число и объект', () => {
    // null это объект, ноль — число, при обычном equal они бы совпали
    assert.equal(run('op strictEqual result 0 null').num('result'), 0)
    assert.equal(run('op strictEqual result 5 5').num('result'), 1)
})

test('устаревшие имена операций подменяются', () => {
    assert.equal(run('op atan2 result 0 1').num('result'), 90)
    assert.equal(run('op dst result 3 4').num('result'), 5)
})

test('деление на ноль не сохраняется как бесконечность', () => {
    const processor = run('op div result 1 0')
    const result = processor.get('result')

    // Недопустимое число превращается в объект null
    assert.equal(result.isobj, true)
    assert.equal(result.objval, null)
    assert.equal(result.num(), 0)
})

test('noise даёт воспроизводимый результат в диапазоне -1..1', () => {
    const first = run('op noise result 12.5 7.25').num('result')
    const second = run('op noise result 12.5 7.25').num('result')

    assert.equal(first, second)
    assert.ok(first >= -1 && first <= 1)
    // В узлах решётки шум обращается в ноль — свойство симплекс-шума
    assert.equal(run('op noise result 0 0').num('result'), 0)
})

test('rand воспроизводим при одинаковом состоянии генератора', () => {
    const processor = new Processor('op rand a 1\nop rand b 1')
    processor.run(2)

    const a = processor.num('a')
    const b = processor.num('b')

    assert.ok(a >= 0 && a < 1)
    assert.ok(b >= 0 && b < 1)
    // Два вызова подряд не должны давать одно и то же
    assert.notEqual(a, b)
})
