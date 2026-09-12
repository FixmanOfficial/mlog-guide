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

import {readdirSync, readFileSync, statSync} from 'node:fs'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'

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
