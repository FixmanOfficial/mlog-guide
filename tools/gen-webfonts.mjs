#!/usr/bin/env node
/**
 * Шрифты игры в WOFF2.
 *
 * В игре они лежат TrueType и WOFF первой версии — форматами, которые браузер берёт, но
 * которые сжаты zlib или не сжаты вовсе. WOFF2 сжимает brotli, и тот же шрифт весит
 * вдвое-вчетверо меньше: шрифт логического дисплея — 5 КБ вместо 41.
 *
 * Основной шрифт интерфейса сюда не входит: его вырезает `gen-font.mjs`, он же и пишет WOFF2.
 *
 * Использование:
 *   node tools/gen-webfonts.mjs <путь-к-Mindustry>
 */

import {readFileSync, writeFileSync} from 'node:fs'
import {join, resolve} from 'node:path'

import {encodeWoff2} from './woff2.mjs'

/** Шрифт в игре — куда он ложится у нас. */
const FONTS = [
    ['icon.ttf', 'editor/assets/icon.woff2'],
    ['monospace.woff', 'editor/assets/mono.woff2'],
    ['logic.ttf', 'render/assets/logic.woff2']
]

function main() {
    const gameRoot = process.argv[2]
    if (gameRoot === undefined) {
        console.error('использование: node tools/gen-webfonts.mjs <путь-к-Mindustry>')
        process.exit(1)
    }

    for (const [name, target] of FONTS) {
        const source = readFileSync(join(resolve(gameRoot), 'core/assets/fonts', name))
        const packed = encodeWoff2(source)

        writeFileSync(target, packed)
        console.log(`${target.padEnd(28)} ${Math.round(source.length / 1024)} КБ -> ${Math.round(packed.length / 1024)} КБ`)
    }
}

main()
