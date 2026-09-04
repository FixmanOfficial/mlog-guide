#!/usr/bin/env node
/**
 * Генератор локализованных названий контента и терминологии логики.
 *
 * Игра везёт официальные переводы на 36 языков в core/assets/bundles. Оттуда берутся:
 *   block|unit|item|liquid.<имя>.name  — названия контента
 *   lcategory.<имя>[.description]      — категории инструкций
 *   lst.<инструкция>                   — описания инструкций
 *   lenum.<свойство>                   — описания свойств sensor и control
 *
 * Это позволяет говорить в документации теми же словами, что игрок видит в игре, и получить
 * основу перевода сайта бесплатно. Тексты игры под GPL-3.0, у нас та же лицензия.
 *
 * Значения сохраняются как есть, вместе с разметкой Mindustry вида [accent]...[] — она
 * презентационная и разбирается на стороне сайта, здесь ничего не теряем.
 *
 * Использование:
 *   node tools/gen-bundles.mjs <путь-к-Mindustry> [локали...]
 */

import {readFileSync, writeFileSync, mkdirSync} from 'node:fs'
import {join, resolve} from 'node:path'

const DEFAULT_LOCALES = ['en', 'ru']
const CONTENT_TYPES = ['block', 'unit', 'item', 'liquid']

/** Английский лежит в bundle.properties без суффикса, остальные — с суффиксом локали. */
const bundleFile = (locale) => locale === 'en' ? 'bundle.properties' : `bundle_${locale}.properties`

const BACKSLASH = String.fromCharCode(92)

/**
 * Разбор .properties. Формат в бандлах Mindustry простой: UTF-8, «ключ = значение»,
 * без переносов строк через обратный слэш и без \uXXXX. Разбираем то, что реально встречается,
 * но экранированные переводы строки раскрываем.
 */
function parseProperties(text) {
    const result = new Map()

    for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim()
        if (trimmed === '' || trimmed.startsWith('#') || trimmed.startsWith('!')) continue

        const separator = trimmed.indexOf('=')
        if (separator === -1) continue

        const key = trimmed.slice(0, separator).trim()
        const raw = trimmed.slice(separator + 1).trim()

        // Один проход, чтобы экранированный слэш не съедал следующий символ.
        const value = raw.replace(
            new RegExp(BACKSLASH + BACKSLASH + '(.)', 'g'),
            (match, char) => char === 'n' ? '\n' : char
        )

        if (key !== '') result.set(key, value)
    }

    return result
}

function collectNames(props, prefix, names) {
    const out = {}
    for (const name of names) {
        const value = props.get(`${prefix}${name}.name`)
        if (value !== undefined) out[name] = value
    }
    return out
}

function collectByPrefix(props, prefix, {suffix = null, strip = false} = {}) {
    const out = {}

    for (const [key, value] of props) {
        if (!key.startsWith(prefix)) continue

        let rest = key.slice(prefix.length)

        if (suffix === null) {
            if (rest.endsWith('.description')) continue
        } else {
            if (!rest.endsWith(suffix)) continue
            if (strip) rest = rest.slice(0, -suffix.length)
        }

        out[rest] = value
    }

    return out
}

function main() {
    const gameRoot = resolve(process.argv[2] ?? '../Mindustry')
    const requested = process.argv.slice(3)
    const locales = requested.length > 0 ? requested : DEFAULT_LOCALES

    let ids
    try {
        ids = JSON.parse(readFileSync('core/data/logic-ids.json', 'utf8'))
    } catch {
        console.error('Не найден core/data/logic-ids.json — сначала запустите tools/gen-content.mjs')
        process.exit(1)
    }

    mkdirSync('core/data/i18n', {recursive: true})

    for (const locale of locales) {
        const source = join(gameRoot, 'core/assets/bundles', bundleFile(locale))

        let props
        try {
            props = parseProperties(readFileSync(source, 'utf8'))
        } catch {
            console.error(`Не найден бандл ${source} — пропускаю локаль ${locale}`)
            continue
        }

        const content = {}
        let translated = 0
        let total = 0

        for (const type of CONTENT_TYPES) {
            content[type] = collectNames(props, `${type}.`, ids.types[type])
            translated += Object.keys(content[type]).length
            total += ids.types[type].length
        }

        const logic = {
            categories: collectByPrefix(props, 'lcategory.'),
            categoryDescriptions: collectByPrefix(props, 'lcategory.', {suffix: '.description', strip: true}),
            instructions: collectByPrefix(props, 'lst.'),
            properties: collectByPrefix(props, 'lenum.')
        }

        const output = {
            locale,
            gameVersion: ids.gameVersion,
            source: `core/assets/bundles/${bundleFile(locale)}`,
            note: 'Файл сгенерирован из бандлов игры, править вручную нельзя. Разметка вида [accent]...[] оставлена как есть.',
            content,
            logic
        }

        const target = `core/data/i18n/${locale}.json`
        writeFileSync(target, JSON.stringify(output, null, 2) + '\n')

        const percent = Math.round(translated / total * 100)
        console.log(
            `${target.padEnd(24)} контент ${String(translated).padStart(3)}/${total} (${percent}%), ` +
            `категорий ${Object.keys(logic.categories).length}, ` +
            `инструкций ${Object.keys(logic.instructions).length}, ` +
            `свойств ${Object.keys(logic.properties).length}`
        )
    }
}

main()
