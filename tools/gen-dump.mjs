/**
 * Снимает спеки контента, запуская саму игру.
 *
 * Остальные генераторы читают исходники — здесь так нельзя. Половина чисел в игре не записана,
 * а выводится в `init()`: дальность юнита собирается из скорости и времени жизни пуль каждого
 * оружия, здоровье блока — из размера и состава, вместимость — из размера корпуса. Разбирать эту
 * цепочку регулярками означает получить правдоподобные, но неверные числа, что уже случалось.
 *
 * Поэтому берётся официальный jar нужной версии, поднимается `ContentLoader` — ровно тот же,
 * что при запуске игры, только без графики и звука, — и значения читаются из готовых объектов.
 *
 *   node tools/gen-dump.mjs <путь-к-Mindustry.jar>
 *
 * Нужен JDK 17 или новее: игра собрана под 17 и на восьмой не запустится. Ищется он сам —
 * в JAVA_HOME, среди установленных Adoptium и в PATH.
 *
 * Скачать jar (86 МБ, в репозиторий не кладём):
 *   https://github.com/Anuken/Mindustry/releases/download/<версия>/Mindustry.jar
 */

import {execFileSync} from 'node:child_process'
import {existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join, resolve} from 'node:path'

import {decodePng} from './png.mjs'
import {CONTENT_VERSION, checkJar} from './version.mjs'
import {readEntries, readFile} from './zip.mjs'

const MIN_JAVA = 17
const separator = process.platform === 'win32' ? ';' : ':'
const exe = (name) => process.platform === 'win32' ? `${name}.exe` : name

/** Мажорная версия JDK по выводу `javac -version`, или null, если это не JDK. */
function javacVersion(path) {
    try {
        const output = execFileSync(path, ['-version'], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']})
        const match = output.match(/javac (\d+)/)
        return match === null ? null : Number(match[1])
    } catch {
        return null
    }
}

/**
 * Ищет JDK нужной версии. Порядок обычный: сначала то, что выбрал пользователь, потом то,
 * что нашлось на машине. В PATH вполне может стоять восьмёрка — она не подойдёт, и это
 * не повод сдаваться.
 */
function findJdk() {
    const candidates = []

    if (process.env.JAVA_HOME !== undefined) candidates.push(join(process.env.JAVA_HOME, 'bin'))

    const adoptium = 'C:/Program Files/Eclipse Adoptium'
    if (existsSync(adoptium)) {
        for (const entry of readdirSync(adoptium)) candidates.push(join(adoptium, entry, 'bin'))
    }

    candidates.push('')

    for (const bin of candidates) {
        const javac = bin === '' ? exe('javac') : join(bin, exe('javac'))
        const version = javacVersion(javac)

        if (version !== null && version >= MIN_JAVA) {
            return {javac, java: bin === '' ? exe('java') : join(bin, exe('java')), version}
        }
    }

    return null
}

/**
 * Раскрашивает блоки цветами карты. `ContentLoader.loadColors`: пиксель номер `id` в первой
 * строке `sprites/block_colors.png`. Без этой картинки цвет блока чёрный у всех подряд —
 * в коде его нет вовсе.
 */
function colorize(jar, blocks) {
    const png = readFile(readEntries(jar), 'sprites/block_colors.png')
    if (png === null) throw new Error(`${jar}: внутри нет sprites/block_colors.png`)

    const image = decodePng(png)
    const hex = (value) => value.toString(16).padStart(2, '0')

    for (const spec of Object.values(blocks)) {
        if (spec.id >= image.width) continue

        const at = spec.id * 4
        const [r, g, b, a] = image.pixels.slice(at, at + 4)

        /*
         * `ContentLoader.loadColors` пропускает пустой пиксель и чёрный: `color == 0`
         * и `color == 255` в записи RGBA8888. Для руды в картинке как раз ноль, а цвет
         * ей ставит конструктор из предмета — затирать его чёрным нельзя.
         */
        const rgba = ((r << 24) | (g << 16) | (b << 8) | a) >>> 0
        if (rgba === 0 || rgba === 255) continue

        spec.mapColor = `#${hex(r)}${hex(g)}${hex(b)}`
    }
}

/** Размер получившейся описи: файл большой, и следить за ним стоит. */
const statSize = () => readFileSync('core/data/stats.json').length / 1024

function main() {
    const jar = process.argv[2]

    if (jar === undefined || !existsSync(jar)) {
        console.error('Укажите путь к Mindustry.jar нужной версии:')
        console.error('  node tools/gen-dump.mjs <путь-к-Mindustry.jar>')
        console.error(`  скачать: https://github.com/Anuken/Mindustry/releases/download/${CONTENT_VERSION}/Mindustry.jar`)
        process.exit(1)
    }

    /*
     * Версия проверяется до запуска и по самому jar: `version.properties` внутри него.
     * Раньше сверялись две константы — в дампере и здесь, — и поймать чужую сборку это
     * не могло в принципе.
     */
    console.log(`jar: ${checkJar(jar)}`)

    const jdk = findJdk()

    if (jdk === null) {
        console.error(`Не найден JDK ${MIN_JAVA} или новее. Игра собрана под 17, на восьмёрке не запустится.`)
        console.error('Подскажите путь через JAVA_HOME.')
        process.exit(1)
    }

    const work = mkdtempSync(join(tmpdir(), 'mlog-dump-'))
    const source = resolve('tools/dump/ContentDump.java')
    const classpath = [resolve(jar), work].join(separator)

    try {
        execFileSync(jdk.javac, ['-nowarn', '-encoding', 'UTF-8', '-cp', resolve(jar), '-d', work, source],
            {stdio: ['ignore', 'inherit', 'inherit']})

        const units = join(work, 'unit-specs.json')
        const blocks = join(work, 'block-specs.json')
        const teams = join(work, 'teams.json')
        const materials = join(work, 'materials.json')
        const stats = join(work, 'stats.json')
        const weathers = join(work, 'weathers.json')

        const counts = execFileSync(jdk.java,
            ['-cp', classpath, 'ContentDump', units, blocks, teams, materials, stats, weathers],
            {encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit']}).trim().split(' ')

        // Игра печатает всё одной строкой; раскладываем тем же способом, что и прочие таблицы
        for (const [from, to] of [
            [units, 'core/data/unit-specs.json'],
            [blocks, 'core/data/block-specs.json'],
            [teams, 'core/data/teams.json'],
            [materials, 'core/data/materials.json'],
            [stats, 'core/data/stats.json'],
            [weathers, 'core/data/weathers.json']
        ]) {
            const data = JSON.parse(readFileSync(from, 'utf8'))

            // Дампер подписывает выгрузку версией из самого jar — сверяем с закреплённой
            if (data.gameVersion !== CONTENT_VERSION) {
                throw new Error(`дамп снят с версии ${data.gameVersion}, а нужна ${CONTENT_VERSION}`)
            }

            // Цвет блока на карте лежит не в коде, а картинкой: ContentLoader.loadColors
            // читает пиксель с номером блока из первой строки block_colors.png
            if (to.endsWith('block-specs.json')) colorize(resolve(jar), data.blocks)

            writeFileSync(to, JSON.stringify(data, null, 2) + '\n')
        }

        console.log(`core/data/unit-specs.json: ${counts[0]} юнитов`)
        console.log(`core/data/block-specs.json: ${counts[1]} блоков`)
        console.log('core/data/teams.json: шесть базовых команд')
        console.log('core/data/materials.json: предметы и жидкости')
        console.log(`core/data/weathers.json: ${counts[2]} видов погоды`)
        console.log(`core/data/stats.json: полная опись характеристик, ${Math.round(statSize())} КБ`)
    } finally {
        rmSync(work, {recursive: true, force: true})
    }
}

main()
