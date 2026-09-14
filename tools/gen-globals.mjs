/**
 * Снимает опись встроенных переменных из `logic/GlobalVars.java` в `core/data/globals.json`.
 *
 * В игре есть отдельное окно «Встроенные переменные» (`GlobalVarsDialog`), и оно показывает
 * не все константы подряд, а те, для которых вызван `putEntry` или `putEntryOnly`. Остальное —
 * контент, цвета, свойства `sensor` — туда не попадает: их тысячи.
 *
 * Но есть и третий случай: переменная заведена обычным `put`, работает в программах, а в окне
 * не показана. Такова `@wait` — стандартный приёмник ответа у `message`. Их опись тоже
 * снимается, с пометкой `hidden`: иначе имя пришлось бы вписывать в движок руками.
 *
 * Порядок важен: окно идёт по списку сверху вниз, а элементы с именем вида `sectionX` работают
 * заголовками разделов. Поэтому опись снимается ровно в том порядке, в каком её строит `init()`.
 *
 * Описания сюда не попадают: они лежат в бандлах под ключами `lglobal.<имя>` и снимаются
 * генератором `tools/gen-bundles.mjs`.
 *
 *   node tools/gen-globals.mjs <путь-к-Mindustry>
 */

import {readFileSync, writeFileSync} from 'node:fs'
import {join, resolve} from 'node:path'
import {GAME_VERSION} from './version.mjs'

/** Тело метода `init()`: от объявления до закрывающей скобки того же уровня. */
function initBody(source) {
    const start = source.indexOf('public void init(){')
    if (start === -1) throw new Error('в GlobalVars.java не нашёлся init()')

    let depth = 0
    for (let i = source.indexOf('{', start); i < source.length; i++) {
        if (source[i] === '{') depth++
        if (source[i] === '}' && --depth === 0) return source.slice(start, i)
    }

    throw new Error('не закрылась скобка init()')
}

/** Типы контента, по которым игра раскладывает счётчики для lookup. */
function lookupTypes(source) {
    const match = source.match(/writableLookableContent\s*=\s*\{([^}]*)\}/)
    if (match === null) throw new Error('не нашёлся writableLookableContent')

    return match[1].split(',').map(entry => entry.trim().replace('ContentType.', '')).filter(Boolean)
}

function collect(body, counts) {
    const entries = []

    // putEntryOnly("x") — только строка описи; putEntry("x", …) — ещё и настоящая константа
    const call = /put(EntryOnly|Entry)\s*\(\s*("(?:[^"]*)"|"@"\s*\+\s*ctype\.name\(\)\s*\+\s*"Count")\s*(?:,([^;]*))?\)/g

    /*
     * Переменные, заведённые обычным `put`: в окне их нет, а в программах они работают.
     * Строки `put(varX = ...)` и присваивания пропускаем — берём только имя в кавычках.
     */
    const hidden = /(?:^|[^a-zA-Z])put\s*\(\s*"(@[^"]+)"\s*(?:,([^;]*))?\)/gm

    for (const match of body.matchAll(call)) {
        const [, kind, name, rest = ''] = match

        // Счётчики контента объявлены в цикле: `putEntry("@" + ctype.name() + "Count", amount)`
        if (name.startsWith('"@"')) {
            for (const type of counts) entries.push({name: `@${type}Count`, privileged: false})
            continue
        }

        entries.push({
            name: name.slice(1, -1),
            // Третий аргумент putEntry — признак «только для процессора мира»
            privileged: kind === 'Entry' && /,\s*true\s*$/.test(rest.trim())
        })
    }

    for (const match of body.matchAll(hidden)) {
        const [, name, rest = ''] = match

        /*
         * `put(имя, значение, привилегия, скрытость)`. Признак берётся по месту, а не
         * по последнему аргументу: у трёхаргументной формы последний — привилегия,
         * у четырёхаргументной — скрытость, и «последний true» перепутал бы их.
         */
        const args = rest.split(',').map(part => part.trim()).filter(Boolean)

        entries.push({name, privileged: args[1] === 'true', hidden: true})
    }

    return entries
}

function main() {
    const gameRoot = resolve(process.argv[2] ?? '../Mindustry')
    const path = join(gameRoot, 'core/src/mindustry/logic/GlobalVars.java')

    let source
    try {
        source = readFileSync(path, 'utf8')
    } catch {
        console.error(`Не найден ${path}`)
        console.error('Укажите путь к исходникам Mindustry: node tools/gen-globals.mjs <путь>')
        process.exit(1)
    }

    const entries = collect(initBody(source), lookupTypes(source))
    const sections = entries.filter(entry => entry.name.startsWith('section')).length

    const output = {
        gameVersion: GAME_VERSION,
        source: 'core/src/mindustry/logic/GlobalVars.java',
        note: 'Файл сгенерирован, править вручную нельзя. Порядок тот же, что в окне игры; '
            + 'строки sectionX — заголовки разделов, описания лежат в i18n под ключами lglobal.',
        entries
    }

    writeFileSync('core/data/globals.json', JSON.stringify(output, null, 2) + '\n')
    console.log(`core/data/globals.json: ${entries.length - sections} переменных в ${sections} разделах`)
}

main()
