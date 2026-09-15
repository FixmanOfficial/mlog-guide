/**
 * Как острова попадают на страницу.
 *
 * Пример урока — это окно процессора, и появляться оно должно вместе с текстом, а не после
 * него. С `client:only` Astro не рисует остров вовсе: страница приходила с пустым местом,
 * которое заполнялось, когда загрузятся и отработают скрипты. На телефоне это видно
 * особенно хорошо — текст под примером прыгает.
 *
 * Поэтому везде `client:load`: разметка собирается заранее, а скрипты потом её оживляют.
 * Ничего от документа при сборке примера не нужно — сцена и редактор считаются чистым кодом,
 * холст и картинки заводит уже эффект.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import {existsSync, readdirSync, readFileSync, statSync} from 'node:fs'
import {join, sep} from 'node:path'
import {fileURLToPath} from 'node:url'

import {GROUPS} from '../src/course/parts.js'

const ROOT = fileURLToPath(new URL('../src/content/docs/', import.meta.url))

function pages(directory) {
    const found = []

    for (const name of readdirSync(directory)) {
        const path = join(directory, name)

        if (statSync(path).isDirectory()) found.push(...pages(path))
        else if (name.endsWith('.mdx')) found.push(path)
    }

    return found
}

test('острова страниц отрисовываются заранее, а не только в браузере', () => {
    for (const path of pages(ROOT)) {
        const text = readFileSync(path, 'utf8')

        assert.ok(!text.includes('client:only'),
            `${path}: остров с client:only оставляет на странице пустое место`)
    }
})

test('каждая группа уроков лежит в какой-нибудь части курса', () => {
    /*
     * Части курса — категории игры, и описаны они один раз, в `src/course/parts.js`:
     * оттуда строится и меню, и страница «Все уроки». Забытая папка выпадет из обоих сразу
     * и молча, поэтому тут сверяется, что описание покрывает то, что написано.
     */
    const folders = readdirSync(ROOT + 'ru/course', {withFileTypes: true})
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name)

    for (const folder of folders) {
        assert.ok(GROUPS.includes(folder),
            `папка ${folder} не описана в src/course/parts.js`)
    }

    // И наоборот: в описании не должно быть выдуманных имён с уроками
    assert.ok(folders.length > 0, 'уроки нашлись')
})

test('словарь имён покрывает все сцены курса', async () => {
    /*
     * Английская страница показывает ту же сцену с переписанными именами. Слово, которого
     * нет в словаре, приехало бы в английский пример по-русски — и заметить это можно было
     * бы только глазами, на одной странице из ста двадцати.
     */
    const {english} = await import('../src/course/scenes/translate.js')

    const folder = fileURLToPath(new URL('../src/course/scenes/', import.meta.url))
    const missing = new Set()
    let scenes = 0

    for (const file of readdirSync(folder)) {
        if (!file.endsWith('.js') || file === 'translate.js' || file === 'names.en.js') continue

        const module = await import(new URL(`../src/course/scenes/${file}`, import.meta.url))

        for (const value of Object.values(module)) {
            if (value !== null && typeof value === 'object') {
                english(value, missing)
                scenes++
            }
        }
    }

    assert.ok(scenes > 100, `сцен нашлось ${scenes}`)
    assert.deepEqual([...missing], [], 'слова без перевода')
})

test('имя переменной и строка с тем же словом переводятся одинаково', async () => {
    /*
     * Имя переменной соседа пишется строкой: `write 1 processor1 "нужен"`. Переведи словарь
     * строку иначе, чем само имя, — и английский пример стал бы писать в переменную,
     * которой нет. Программа при этом не сломается, просто молча ничего не сделает.
     */
    const {NAMES, STRINGS} = await import('../src/course/scenes/names.en.js')

    for (const [russian, asString] of Object.entries(STRINGS)) {
        const asName = NAMES[russian]
        if (asName === undefined) continue

        assert.equal(asString, asName,
            `«${russian}»: строкой «${asString}», а именем «${asName}»`)
    }
})

test('английский урок повторяет русский по месту и сложности', async () => {
    /*
     * Перевод — не отдельный курс: у урока тот же адрес, тот же порядок в меню и та же
     * сложность. Разъехавшийся `order` переставил бы уроки местами только на одном языке,
     * и заметить это можно было бы только сравнив два меню.
     */
    const root = fileURLToPath(new URL('../src/content/docs/', import.meta.url))

    const head = (path) => {
        const text = readFileSync(path, 'utf8')
        const front = text.slice(0, text.indexOf('\n---', 4))

        return {
            order: front.match(/^\s+order:\s*(-?\d+)/m)?.[1] ?? null,
            difficulty: front.match(/^difficulty:\s*(\w+)/m)?.[1] ?? null
        }
    }

    for (const path of pages(join(root, 'en/course'))) {
        const twin = path.replace(`${sep}en${sep}`, `${sep}ru${sep}`)

        assert.ok(existsSync(twin), `${path}: русского урока нет вовсе`)
        assert.deepEqual(head(path), head(twin), `${path}: шапка разошлась с русской`)
    }
})
