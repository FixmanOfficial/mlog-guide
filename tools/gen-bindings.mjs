#!/usr/bin/env node
/**
 * Генератор таблицы привязок клавиш.
 *
 * На компьютере игрок почти ничего не нажимает в интерфейсе: сносит правой кнопкой, крутит
 * блок на `R`, выбирает блок цифрой, скрывает интерфейс на `C`. Всё это объявлено в одном
 * месте — `input/Binding.java`, строками вида `KeyBind.add("rotateplaced", KeyCode.r)`.
 *
 * Писать такую таблицу руками нельзя ровно по той же причине, что и остальные: она
 * разъедется с игрой на первом обновлении, и подсказка на странице будет врать.
 *
 * Осевые привязки (`new Axis(a, b)` и `new Axis(KeyCode.scroll)`) снимаются как есть: у них
 * либо две клавиши, либо колесо.
 *
 * Использование:
 *   node tools/gen-bindings.mjs <путь-к-Mindustry>
 */

import {readFileSync, writeFileSync} from 'node:fs'
import {join, resolve} from 'node:path'

const GAME_VERSION = 'v159.7'

/** `KeyBind.add("имя", <клавиша|ось>[, "категория"])` — одна строка на привязку. */
const PATTERN = /(\w+)\s*=\s*KeyBind\.add\(\s*"([^"]+)"\s*,\s*([^,)]+(?:\([^)]*\))?)\s*(?:,\s*"(\w+)")?\s*\)/g

/** `KeyCode.x` в имя клавиши; `unset` означает, что привязки нет. */
function parseKey(expression) {
    const single = expression.match(/^KeyCode\.(\w+)$/)
    if (single !== null) return single[1] === 'unset' ? null : {key: single[1]}

    // Ось: либо пара клавиш, либо колесо мыши
    const axis = expression.match(/^new Axis\(\s*(.+?)\s*\)$/)
    if (axis === null) return null

    const keys = axis[1].split(',').map(part => part.trim().replace(/^KeyCode\./, ''))
    return keys.length === 1 ? {axis: keys[0]} : {axis: keys}
}

function main() {
    const gameRoot = resolve(process.argv[2] ?? '../Mindustry')
    const source = join(gameRoot, 'core/src/mindustry/input/Binding.java')

    let text
    try {
        text = readFileSync(source, 'utf8')
    } catch {
        console.error(`Не найден ${source}`)
        console.error('Как развернуть исходники — см. CLAUDE.md')
        process.exit(1)
    }

    const bindings = {}
    let category = 'general'
    let unbound = 0

    for (const [, field, name, expression, section] of text.matchAll(PATTERN)) {
        // Категория пишется у первой привязки раздела и держится до следующей
        if (section !== undefined) category = section

        const parsed = parseKey(expression)
        if (parsed === null) unbound++

        bindings[name] = {field, category, ...(parsed ?? {})}
    }

    if (Object.keys(bindings).length === 0) throw new Error('Binding.java: не разобрана ни одна привязка')

    const target = 'core/data/bindings.json'
    writeFileSync(target, JSON.stringify({
        gameVersion: GAME_VERSION,
        source: 'core/src/mindustry/input/Binding.java',
        note: 'Файл сгенерирован, править вручную нельзя. Имя привязки — ключ строки '
            + 'в бандлах (`keybind.<имя>.name`), а без клавиши идут те, что игра оставила '
            + 'непривязанными.',
        bindings
    }, null, 2) + '\n')

    console.log(`${target}: ${Object.keys(bindings).length} привязок, без клавиши ${unbound}`)
}

main()
