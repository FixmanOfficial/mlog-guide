/**
 * Сцена урока по-английски.
 *
 * Сцены пишутся один раз, по-русски, и гоняются тестами. Для английской страницы та же
 * сцена переписывается именами из словаря — программа остаётся той же строка в строку,
 * меняются только имена переменных, строки в кавычках и ключи словаря карты.
 *
 * Почему не две копии: любая находка вычитки тогда чинилась бы дважды, и вторая копия
 * рано или поздно отстала бы молча. Проверять её было бы нечем — тесты гоняют русскую.
 */

import {NAMES, STRINGS} from './names.en.js'

/**
 * Имя переменной целиком. Кириллица в нём может стоять не в начале и не в конце: в сценах
 * есть `рудаX`, `xБлижнего` и `здание2`. Поэтому слово берётся вместе с латиницей вокруг —
 * иначе от `xБлижнего` переводилась бы половина, и вышло бы `xNear`.
 */
const WORD = /[A-Za-z0-9_]*[А-Яа-яЁё][A-Za-z0-9_А-Яа-яЁё]*/g

/** Есть ли в значении кириллица — по ней и решается, надо ли вообще трогать. */
const cyrillic = (value) => typeof value === 'string' && /[А-Яа-яЁё]/.test(value)

/**
 * Имена в одной строке программы.
 *
 * Строковые литералы вынимаются первыми и переводятся по своему словарю: внутри кавычек
 * лежит текст для табло, а не имя переменной, и делить его на слова нельзя.
 */
function line(text, missing) {
    const parts = text.split(/("[^"]*")/)

    return parts.map(part => {
        if (part.startsWith('"') && part.endsWith('"')) {
            const inside = part.slice(1, -1)
            if (!cyrillic(inside)) return part

            const found = STRINGS[inside]
            if (found === undefined) missing.add(`"${inside}"`)

            return `"${found ?? inside}"`
        }

        return part.replace(WORD, (word) => {
            // Метка перехода пишется с двоеточием, и в словаре она так и лежит
            const found = NAMES[word]
            if (found === undefined) missing.add(word)

            return found ?? word
        })
    }).join('')
}

/** Программа целиком, строка за строкой. Метка `снова:` — отдельная строка, не имя. */
function program(text, missing) {
    return text.split('\n').map(row => {
        const label = row.match(/^([А-Яа-яЁё][А-Яа-яЁё0-9_]*):$/)
        if (label !== null) {
            const found = NAMES[`${label[1]}:`] ?? NAMES[label[1]]
            if (found === undefined) missing.add(`${label[1]}:`)

            return found === undefined ? row : (found.endsWith(':') ? found : `${found}:`)
        }

        return line(row, missing)
    }).join('\n')
}

/**
 * Копия сцены с английскими именами.
 *
 * Обходится всё описание, а не только программы: русское слово встречается ещё в словаре
 * карты (`locales` для `localeprint`) и в готовых надписях блоков. Ключ словаря переводится
 * тоже — программа ищет по нему, и разойдись они, `localeprint` замолчал бы.
 *
 * @param missing куда складывать слова, которых нет в словаре. Их собирает тест
 */
export function english(scene, missing = new Set()) {
    const walk = (value, inProgram) => {
        if (typeof value === 'string') {
            if (inProgram) return program(value, missing)
            if (!cyrillic(value)) return value

            const found = STRINGS[value]
            if (found === undefined) missing.add(`"${value}"`)

            return found ?? value
        }

        if (Array.isArray(value)) return value.map(item => walk(item, inProgram))

        if (value !== null && typeof value === 'object') {
            const copy = {}

            for (const [key, inner] of Object.entries(value)) {
                const name = cyrillic(key) ? (STRINGS[key] ?? key) : key
                if (cyrillic(key) && STRINGS[key] === undefined) missing.add(`"${key}"`)

                copy[name] = walk(inner, key === 'program')
            }

            return copy
        }

        return value
    }

    return walk(scene, false)
}

/** Сцена под язык страницы: русская отдаётся как есть, английская переписывается. */
export const localized = (scene, locale) => locale === 'en' ? english(scene) : scene
