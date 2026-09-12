/**
 * Снимает палитру игры из `graphics/Pal.java` в `core/data/pal.json`.
 *
 * Цвета в проекте встречаются чаще всего остального и глазом не проверяются: `#454545`
 * и `#4d4d4d` рядом не отличить. Поэтому они снимаются генератором, а тесты сверяют с ним
 * каждую цветовую константу.
 *
 * Разбираются три способа объявления, все они есть в исходнике:
 *   name = Color.valueOf("454545")
 *   name = new Color(0.3f, 0.3f, 0.3f, 1f)
 *   name = accent            — ссылка на другой цвет
 *
 *   node tools/gen-pal.mjs <путь-к-Mindustry>
 */

import {readFileSync, writeFileSync} from 'node:fs'
import {join, resolve} from 'node:path'
import {GAME_VERSION} from './version.mjs'

const byte = (value) => Math.round(value * 255).toString(16).padStart(2, '0')

/** Цвет как в arc: доли от нуля до единицы. Альфа опускается, если она полная. */
function fromFloats(parts) {
    const [r, g, b, a = 1] = parts.map(Number)
    const hex = `#${byte(r)}${byte(g)}${byte(b)}`

    return a >= 1 ? hex : `${hex}${byte(a)}`
}

function parse(source) {
    const colors = {}

    // Объявления идут списком через запятую: имя, знак равенства, значение
    const entry = /(\w+)\s*=\s*(Color\.valueOf\("([0-9a-fA-F]+)"\)|new Color\(([^)]*)\)|(\w+))/g

    for (const match of source.matchAll(entry)) {
        const [, name, , hex, floats, reference] = match

        if (hex !== undefined) {
            const value = hex.length === 8 ? hex : hex.slice(0, 6)
            colors[name] = `#${value.toLowerCase()}`
            continue
        }

        if (floats !== undefined) {
            const parts = floats.split(',').map(part => part.trim().replace(/f$/, ''))
            // new Color(other) — это копия, не набор чисел
            if (parts.every(part => /^-?[\d.]+$/.test(part))) colors[name] = fromFloats(parts)
            continue
        }

        // Ссылка на уже объявленный цвет: placing = accent
        if (reference !== undefined && colors[reference] !== undefined) {
            colors[name] = colors[reference]
        }
    }

    return colors
}

function main() {
    const gameRoot = resolve(process.argv[2] ?? '../Mindustry')
    const path = join(gameRoot, 'core/src/mindustry/graphics/Pal.java')

    let source
    try {
        source = readFileSync(path, 'utf8')
    } catch {
        console.error(`Не найден ${path}`)
        process.exit(1)
    }

    // Смотрим только на объявления полей: они идут одним списком после `public static Color`
    const start = source.indexOf('public static Color')
    const end = source.indexOf('public static void', start)
    const body = source.slice(start, end === -1 ? source.length : end)
    const colors = parse(body)

    writeFileSync('core/data/pal.json', JSON.stringify({
        gameVersion: GAME_VERSION,
        source: 'core/src/mindustry/graphics/Pal.java',
        note: 'Файл сгенерирован, править вручную нельзя. Значения в формате #rrggbb, '
            + 'альфа дописывается только если она не полная.',
        colors
    }, null, 2) + '\n')

    console.log(`core/data/pal.json: ${Object.keys(colors).length} цветов`)
}

main()
