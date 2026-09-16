/**
 * Сцена урока по-русски.
 *
 * Сцены пишутся один раз, по-английски, и гоняются тестами. Для русской страницы та же
 * сцена переписывается именами из словаря — программа остаётся той же строка в строку,
 * меняются только имена переменных, строки в кавычках и надписи карты.
 *
 * Почему не две копии: любая находка вычитки тогда чинилась бы дважды, и вторая копия
 * рано или поздно отстала бы молча.
 *
 * Переводить английский труднее, чем русский: кириллица в программе может быть только
 * именем, а английское слово бывает и словом языка — `floor` в `op floor`, `item`
 * в `lookup item`. Поэтому имя переписывается только там, где инструкция ждёт значение,
 * а поля-перечисления не трогаются вовсе. Какое поле чем является, знает схема инструкций.
 */

import schema from '@mlog/core/data/instructions.json' with {type: 'json'}

import {NAMES, STRINGS} from './names.ru.js'

/**
 * Типы полей по инструкциям, в порядке записи. Переписывать можно только `value` — это
 * переменная или число — и `int`: у `jump` там номер строки или имя метки.
 */
const FIELDS = Object.fromEntries(schema.instructions.map(entry => [
    entry.opcode, entry.params.map(param => param.type)
]))

/**
 * Поля, которые схема называет значением, а игра читает словом. Тип метки у `makemarker`
 * — это `shape`, `text`, `line`: выбирается списком, хотя записан как значение.
 */
const WORDS = {makemarker: new Set([0])}

const renames = (opcode, index) => {
    if (WORDS[opcode]?.has(index)) return false

    const type = FIELDS[opcode]?.[index] ?? 'value'
    return type === 'value' || type === 'int'
}

/** Строковый литерал: внутри кавычек текст для табло, и переводится он целиком. */
const literal = (text) => STRINGS[text] ?? text

/**
 * Одна строка программы. Слова в mlog разделены пробелами, а строка в кавычках — одно
 * слово, даже если внутри неё пробелы. Первое слово — инструкция, остальные — её поля.
 */
function line(text, missing) {
    // Метка перехода — строка из одного слова с двоеточием
    if (/^\S+:$/.test(text)) return rename(text, missing)

    const opcode = text.match(/^\S+/)?.[0]
    let index = -1

    return text.replace(/"[^"]*"|\S+/g, (word) => {
        index++
        if (index === 0) return word
        if (word.startsWith('"')) return `"${literal(word.slice(1, -1))}"`

        return renames(opcode, index - 1) ? rename(word, missing) : word
    })
}

const program = (text, missing) => text.split('\n').map(row => line(row, missing)).join('\n')

/**
 * Число, константа `@…`, связь вроде `cell1`, цвет `%ff0000` и слова `true`, `false`,
 * `null` именами не бывают — о них тест и не спрашивает.
 */
const NOT_NAMES = /^(-?[\d.]+(e-?\d+)?|0x[\da-f]+|0b[01]+|%[\da-f]+|@.*|[a-z-]+\d+|true|false|null)$/i

/** Имя переменной или метки на русском; чего нет в словаре, остаётся как было. */
function rename(word, missing) {
    const found = NAMES[word]
    if (found === undefined && !NOT_NAMES.test(word)) missing?.add(word)

    return found ?? word
}

/** Поля сцены, где лежит текст для читателя, а не имя контента или вида. */
const TEXTS = new Set(['text', 'flag', 'message'])

/**
 * Копия сцены с русскими именами.
 *
 * Обходится всё описание, а не только программы: слово встречается ещё в словаре карты
 * (`locales` для `localeprint`) и в целях. Ключ словаря переводится тоже — программа ищет
 * по нему, и разойдись они, `localeprint` замолчал бы.
 *
 * @param missing куда складывать имена, которых нет в словаре. Их собирает тест
 */
export function russian(scene, missing = null) {
    const walk = (value, key, inLocales) => {
        if (typeof value === 'string') {
            if (key === 'program') return program(value, missing)
            return inLocales || TEXTS.has(key) ? literal(value) : value
        }

        if (Array.isArray(value)) return value.map(item => walk(item, key, inLocales))

        if (value !== null && typeof value === 'object') {
            const copy = {}

            for (const [name, inner] of Object.entries(value)) {
                const local = inLocales || name === 'locales'
                copy[inLocales ? literal(name) : name] = walk(inner, name, local)
            }

            return copy
        }

        return value
    }

    return walk(scene, null, false)
}

/** Сцена под язык страницы: английская отдаётся как есть, русская переписывается. */
export const localized = (scene, locale) => locale === 'ru' ? russian(scene) : scene
