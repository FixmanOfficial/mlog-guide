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
 * Надписи окна логики — те, что игра берёт из общего бандла, а не из логического.
 *
 * Имя слева наше, ключ справа игровой. Список снят с `LogicDialog.java` и `LCanvas.java`:
 * в нём ровно то, что показано на кнопках окна, — и значит, переведено самой игрой.
 * Многоточие в `add` и `edit` игра ставит сама; на кнопке оно и стоит.
 */
const DIALOG_KEYS = [
    ['add', 'add'],
    ['back', 'back'],
    ['cancel', 'cancel'],
    ['clear', 'clear'],
    ['clearConfirm', 'logic.clear.confirm'],
    ['confirm', 'confirm'],
    ['copyClipboard', 'copy.clipboard'],
    ['delete', 'delete'],
    ['edit', 'edit'],
    ['export', 'editor.export'],
    ['globals', 'logic.globals'],
    ['loadClipboard', 'load.clipboard'],
    ['ok', 'ok'],
    ['restart', 'logic.restart'],
    ['search', 'players.search'],
    ['variables', 'variables']
]

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

/**
 * Значения перечислений: ключи вида `<перечисление>.label.<значение>`, оба в нижнем
 * регистре. Раскладываются по перечислениям, чтобы искать двумя шагами.
 */
function collectLabels(props) {
    const out = {}

    for (const [key, value] of props) {
        const match = key.match(/^([a-z]+)\.label\.(.+)$/)
        if (match === null) continue

        const [, enumName, name] = match

        out[enumName] ??= {}
        out[enumName][name] = value
    }

    return out
}

/**
 * Подсказки к подписям параметров: ключи вида `<инструкция>.<подпись>`.
 *
 * Общей приставки у них нет, зато есть список инструкций — по нему и отбираются. Ключи
 * с точкой внутри значения (`lst.`, `lenum.`) отсеиваются сами: их приставка не совпадает
 * ни с одним именем инструкции.
 */
function collectParams(props, opcodes) {
    const out = {}

    for (const [key, value] of props) {
        const dot = key.indexOf('.')
        if (dot === -1) continue

        if (!opcodes.has(key.slice(0, dot))) continue
        out[key] = value
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

    /*
     * Список инструкций нужен для подсказок к подписям параметров: ключ там собран из имени
     * инструкции, и опознать его иначе нельзя. Файл снимает `gen-instructions.mjs`.
     */
    let opcodes = new Set()

    try {
        const schema = JSON.parse(readFileSync('core/data/instructions.json', 'utf8'))
        opcodes = new Set((schema.instructions ?? []).map(entry => entry.opcode))
    } catch {
        console.error('Не найден core/data/instructions.json — подсказки к параметрам пропущены')
    }

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
            properties: collectByPrefix(props, 'lenum.'),
            // Описания встроенных переменных и заголовки их разделов: окно GlobalVarsDialog
            globals: collectByPrefix(props, 'lglobal.'),

            /*
             * Подсказки к подписям параметров. Ключ игра собирает из имени инструкции
             * и текста подписи (`LStatement.param`), поэтому у них нет общей приставки:
             * `radar.from`, `control.of`, `sensor.in`. Собираются по списку инструкций.
             */
            params: collectParams(props, opcodes),

            /*
             * Перевод самого редактора, появившийся в v160: названия инструкций
             * (`instruction.unitbind`), подписи и слова-операции (`name.token.in`,
             * `name.token.and`) и значения перечислений (`laccess.label.totalitems`).
             *
             * Ключ названия — имя класса без «Statement» в нижнем регистре, а не опкод:
             * у `ubind` это `unitbind`. LStatement.statementKey
             */
            names: collectByPrefix(props, 'instruction.'),
            tokens: collectByPrefix(props, 'name.token.'),
            labels: collectLabels(props)
        }

        // Цели карты и метки: названия видов и строки, которыми игра пишет условие
        // в углу экрана. Ядро текста не знает, поэтому строку собирает страница
        const objectives = {
            objectives: collectByPrefix(props, 'objective.'),
            markers: collectByPrefix(props, 'marker.')
        }

        // Мелочь интерфейса: суффиксы больших чисел, которыми `UI.formatAmount`
        // сокращает запасы ядра — «39к» вместо 39000
        const ui = {
            thousands: props.get('unit.thousands') ?? 'k',
            millions: props.get('unit.millions') ?? 'mil',
            billions: props.get('unit.billions') ?? 'b',

            // Подсказка при первом скрытии интерфейса: `HudFragment` показывает её
            // объявлением и подставляет в неё клавишу
            showui: props.get('showui') ?? '',

            // Надписи окна логики. Своих у нас быть не должно: игра пишет на кнопках
            // ровно эти строки, и переведены они официально
            dialog: Object.fromEntries(DIALOG_KEYS
                .map(([name, key]) => [name, props.get(key) ?? ''])
                .filter(([, value]) => value !== ''))
        }

        const output = {
            locale,
            gameVersion: ids.gameVersion,
            source: `core/assets/bundles/${bundleFile(locale)}`,
            note: 'Файл сгенерирован из бандлов игры, править вручную нельзя. Разметка вида [accent]...[] оставлена как есть.',
            content,
            logic,
            objectives,
            ui
        }

        const target = `core/data/i18n/${locale}.json`
        writeFileSync(target, JSON.stringify(output, null, 2) + '\n')

        const percent = Math.round(translated / total * 100)
        console.log(
            `${target.padEnd(24)} контент ${String(translated).padStart(3)}/${total} (${percent}%), ` +
            `категорий ${Object.keys(logic.categories).length}, ` +
            `инструкций ${Object.keys(logic.instructions).length}, ` +
            `свойств ${Object.keys(logic.properties).length}, `
            + `названий ${Object.keys(logic.names).length}, `
            + `слов ${Object.keys(logic.tokens).length}, ` +
            `встроенных переменных ${Object.keys(logic.globals).length}, ` +
            `целей ${Object.keys(objectives.objectives).length}`
        )
    }
}

main()
