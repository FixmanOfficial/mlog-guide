#!/usr/bin/env node
/**
 * Сравнение скорости исполнения инструкций: наше ядро против прототипа milog.
 *
 * Замеряется только исполнение. Разбор текста и сборка вынесены за скобки: они происходят
 * один раз, а инструкции крутятся постоянно, и именно они определяют, потянет ли страница
 * несколько процессоров сразу.
 *
 * Обе машины получают одну и ту же программу, каждая в своём виде: у нас это текст, у прототипа —
 * массив блоков. Поэтому программы описаны дважды и должны совпадать по смыслу; за этим следит
 * проверка результата после прогона.
 *
 * Использование:
 *   node tools/bench-vm.mjs <путь-к-клону-milog>
 */

import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'

import {Processor} from '../core/src/vm.js'

const WARMUP = 200_000
const MEASURED = 2_000_000

/**
 * Программы. Текст — для нашей машины, блоки — для прототипа.
 * `check` смотрит, что обе досчитали до одного и того же: без этого сравнение бессмысленно.
 */
const PROGRAMS = [
    {
        name: 'арифметика',
        note: 'op в чистом виде, без переходов',
        text: 'op add i i 1',
        blocks: [{command: 'op', params: ['add', 'i', 'i', '1']}],
        variable: 'i'
    },
    {
        name: 'цикл с переходом',
        note: 'типичное тело схемы: счётчик и условный переход',
        text: 'op add i i 1\njump 0 lessThan i 1000000000',
        blocks: [
            {command: 'op', params: ['add', 'i', 'i', '1']},
            {command: 'jump', params: ['lessThan', 'i', '1000000000'], jumpDest: 0}
        ],
        variable: 'i'
    },
    {
        name: 'присваивания',
        note: 'set по кругу, самая дешёвая инструкция',
        text: 'set a 1\nset b a\nset c b',
        blocks: [
            {command: 'set', params: ['a', '1']},
            {command: 'set', params: ['b', 'a']},
            {command: 'set', params: ['c', 'b']}
        ],
        variable: 'c'
    },
    {
        name: 'битовые операции',
        note: 'у нас 64 бита через BigInt, у прототипа тоже — но реализации разные',
        text: 'op shl x i 3\nop and x x 255\nop add i i 1',
        blocks: [
            {command: 'op', params: ['shl', 'x', 'i', '3']},
            {command: 'op', params: ['and', 'x', 'x', '255']},
            {command: 'op', params: ['add', 'i', 'i', '1']}
        ],
        variable: 'i'
    },
    {
        name: 'тригонометрия',
        note: 'op с вызовом Math',
        text: 'op sin s i 0\nop add i i 1',
        blocks: [
            {command: 'op', params: ['sin', 's', 'i', '0']},
            {command: 'op', params: ['add', 'i', 'i', '1']}
        ],
        variable: 'i'
    }
]

/** Крутит функцию ровно count раз и возвращает миллисекунды. */
function measure(step, count) {
    const start = process.hrtime.bigint()
    for (let i = 0; i < count; i++) step()
    return Number(process.hrtime.bigint() - start) / 1e6
}

const rate = (count, ms) => count / (ms / 1000)

const format = (value) => value >= 1e6
    ? `${(value / 1e6).toFixed(1)} млн/с`
    : `${(value / 1e3).toFixed(0)} тыс/с`

async function main() {
    const root = resolve(process.argv[2] ?? '../milog')

    let Asm
    try {
        ({Asm} = await import(pathToFileURL(resolve(root, 'logic/core/asm.js')).href))
    } catch (error) {
        console.error(`Не удалось загрузить прототип из ${root}`)
        console.error('Клонировать: git clone https://github.com/Durmiendo/milog.git')
        console.error('В его package.json нужно добавить "type": "module", иначе нода не примет ESM')
        console.error(error.message)
        process.exit(1)
    }

    console.log(`Скорость исполнения инструкций, ${(MEASURED / 1e6).toFixed(0)} млн шагов на программу`)
    console.log(`node ${process.version}\n`)

    const header = ['программа', 'наше ядро', 'прототип', 'отношение'].map((title, index) =>
        index === 0 ? title.padEnd(22) : title.padStart(13)).join('')
    console.log(header)
    console.log('-'.repeat(header.length))

    for (const program of PROGRAMS) {
        // Наше ядро
        const ours = new Processor(program.text)
        measure(() => ours.step(), WARMUP)
        ours.reset()
        const oursMs = measure(() => ours.step(), MEASURED)
        const oursValue = ours.num(program.variable)

        // Прототип
        const theirs = new Asm()
        theirs.compile(program.blocks.map((block, index) => ({...block, id: index})))
        measure(() => theirs.next(), WARMUP)

        const fresh = new Asm()
        fresh.compile(program.blocks.map((block, index) => ({...block, id: index})))
        const theirsMs = measure(() => fresh.next(), MEASURED)
        const theirsValue = fresh.vars[program.variable]?.num()

        const oursRate = rate(MEASURED, oursMs)
        const theirsRate = rate(MEASURED, theirsMs)

        const agree = Math.abs(oursValue - theirsValue) < 1e-6
        const mark = agree ? '' : '  ← результаты разошлись'

        console.log(
            program.name.padEnd(22) +
            format(oursRate).padStart(13) +
            format(theirsRate).padStart(13) +
            `${(oursRate / theirsRate).toFixed(2)}x`.padStart(13) +
            mark
        )

        if (!agree) {
            console.log(`  наше ${program.variable} = ${oursValue}, прототип = ${theirsValue}`)
        }
    }

    console.log('\nОтношение больше единицы — наше ядро быстрее.')
}

main()
