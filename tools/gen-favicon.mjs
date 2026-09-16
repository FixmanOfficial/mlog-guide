#!/usr/bin/env node
/**
 * Значок сайта — иконка логического процессора.
 *
 * Логотип игры сюда не годится: на странице, которую делает не Anuke, он читался бы как
 * официальный знак. Процессор — то, о чём весь сайт, и картинка у него игровая: она уже
 * лежит в атласе иконок, собранном `gen-sprites.mjs`, оттуда и вырезается.
 *
 * Использование:
 *   node tools/gen-favicon.mjs
 */

import {mkdirSync, readFileSync} from 'node:fs'

import sharp from 'sharp'

const BLOCK = 'logic-processor'
const TARGET = 'web/public/favicon.png'

const sprites = JSON.parse(readFileSync('core/data/sprites.json', 'utf8'))
const entry = sprites.index.block[BLOCK]
if (entry === undefined) throw new Error(`нет иконки ${BLOCK} в core/data/sprites.json`)

mkdirSync('web/public', {recursive: true})

await sharp(sprites.atlas)
    .extract({left: entry.x, top: entry.y, width: entry.width, height: entry.height})
    .png({compressionLevel: 9})
    .toFile(TARGET)

console.log(`${TARGET}: ${BLOCK}, ${entry.width} на ${entry.height}`)
