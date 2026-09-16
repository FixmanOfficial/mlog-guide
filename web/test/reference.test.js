/**
 * Справочник на двух языках.
 *
 * Почти весь его текст приходит из игры — и вместе с ним приходит официальный перевод.
 * Но там, где игра молчит (у одиннадцати инструкций, у шести десятков свойств `sensor`,
 * у переменных процессора и у игровых правил), текст написан нами, и на каждый русский
 * ключ нужен английский: иначе страница `/en/` молча покажет пустое место.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import {INSTRUCTIONS_RU} from '../src/reference/instructions.ru.js'
import {INSTRUCTIONS_EN} from '../src/reference/instructions.en.js'
import {PROPERTIES_RU} from '../src/reference/properties.ru.js'
import {PROPERTIES_EN} from '../src/reference/properties.en.js'
import {PROCESSOR_RU} from '../src/reference/variables.ru.js'
import {PROCESSOR_EN} from '../src/reference/variables.en.js'
import {RULES_RU} from '../src/reference/rules.ru.js'
import {RULES_EN} from '../src/reference/rules.en.js'

import {byCategory, processorVars, properties} from '../src/reference/data.js'
import {rules} from '../src/reference/rules.js'
import {strings as sandboxStrings} from '../src/sandbox/strings.js'
import {SANDBOX} from '../src/sandbox/scenes/sandbox.js'
import {russian} from '../src/course/scenes/translate.js'

const CYRILLIC = /[А-Яа-яЁё]/

const BUNDLES = [
    ['инструкции', INSTRUCTIONS_RU, INSTRUCTIONS_EN],
    ['свойства', PROPERTIES_RU, PROPERTIES_EN],
    ['переменные процессора', PROCESSOR_RU, PROCESSOR_EN],
    ['игровые правила', RULES_RU, RULES_EN]
]

test('английский справочник описывает всё то же, что и русский', () => {
    for (const [what, ru, en] of BUNDLES) {
        assert.deepEqual(Object.keys(en), Object.keys(ru), `${what}: набор ключей разошёлся`)

        for (const [name, text] of Object.entries(en)) {
            assert.equal(CYRILLIC.test(text), false, `${what}: «${name}» осталось непереведённым`)
        }
    }
})

test('страницы справочника на английском собираются без пустых описаний', () => {
    const described = (items) => items.filter(item => item.description !== null)

    // Инструкции: описание есть у каждой, часть из игры, часть наша
    for (const group of byCategory('en')) {
        for (const item of group.items) {
            assert.notEqual(item.description, null, `инструкция ${item.opcode} без описания`)
            assert.equal(CYRILLIC.test(item.description), false, `инструкция ${item.opcode} по-русски`)
        }
    }

    // Свойства и правила: столько же описаний, сколько в русской версии
    assert.equal(described(properties('en')).length, described(properties('ru')).length)
    assert.equal(described(rules('en')).length, described(rules('ru')).length)
    assert.equal(described(processorVars('en')).length, described(processorVars('ru')).length)
})

test('надписи песочницы переведены целиком', () => {
    const ru = sandboxStrings('ru')
    const en = sandboxStrings('en')

    assert.deepEqual(Object.keys(en), Object.keys(ru), 'набор надписей разошёлся')

    for (const [name, text] of Object.entries(en)) {
        assert.equal(CYRILLIC.test(text), false, `песочница: «${name}» осталась непереведённой`)
    }
})

test('сцена песочницы переписывается словарём целиком', () => {
    const missing = new Set()
    const scene = russian(SANDBOX, missing)

    assert.deepEqual([...missing].filter(name => !['x', 'y'].includes(name)), [],
        'в словаре нет слов из сцены песочницы')
    assert.match(scene.objectives.map(entry => entry.text).join(), /[А-Яа-яЁё]/,
        'цели песочницы по-русски не переписались')
})
