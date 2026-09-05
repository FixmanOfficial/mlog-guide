/**
 * Снимает спеки юнитов из `content/UnitTypes.java` в `core/data/unit-specs.json`.
 *
 * Нужны те поля, по которым считается движение и отвечает `sensor`: скорость, ускорение,
 * сопротивление среды, размер, здоровье, полёт, вместимость, добыча, стройка. Умолчания
 * берутся из объявлений полей `type/UnitType.java`, каждый юнит переопределяет своё —
 * так же, как это делает игра.
 *
 * Не всё в `UnitType` записано числом. Часть выводится в `UnitType.init()`:
 *
 *  - `itemCapacity` при отрицательном значении считается из размера,
 *    `max(round((int)(hitSize * 4), 10), 10)`, причём `Mathf.round(int, int)` — это
 *    целочисленное деление, то есть округление вниз (Mathf.java:504);
 *  - `range` и `maxRange` собираются по оружию: минимум и максимум дальности пуль минус
 *    запас 4. Дальность пули, в свою очередь, выводится из её скорости и времени жизни.
 *    Разбирать это регулярками нельзя, поэтому у вооружённых юнитов здесь стоит `null`:
 *    пусть `sensor @range` честно не знает ответа, чем соврёт. Закрывается дампом из игры.
 *
 * Наследование подклассов (`MissileUnitType`, эрекирские) не разворачивается: логика ими
 * всё равно не управляет.
 *
 *   node tools/gen-unit-specs.mjs <путь-к-Mindustry>
 */

import {readFileSync, writeFileSync} from 'node:fs'
import {join, resolve} from 'node:path'

/** Поля, которые нужны модели. Имя в игре — имя у нас. */
const NUMBERS = [
    'speed', 'accel', 'drag', 'rotateSpeed', 'hitSize', 'health', 'armor',
    'itemCapacity', 'mineTier', 'mineSpeed', 'mineRange', 'buildSpeed', 'buildRange',
    'range', 'maxRange', 'payloadCapacity', 'strafePenalty', 'boostMultiplier',
    'riseSpeed', 'descentSpeed'
]

const FLAGS = [
    'flying', 'omniMovement', 'canBoost', 'logicControllable', 'hovering', 'internal',
    'rotateMoveFirst', 'targetable', 'bounded'
]

/** Vars.buildingRange и прочие ссылки на константы: значение подставляется по имени. */
const CONSTANTS = {'Vars.buildingRange': 220}

/** Тело фигурных скобок, начиная с позиции первой. */
function body(source, from) {
    let depth = 0

    for (let i = from; i < source.length; i++) {
        if (source[i] === '{') depth++
        if (source[i] === '}' && --depth === 0) return source.slice(from, i)
    }

    throw new Error('не закрыты скобки')
}

/**
 * Умолчания из объявлений полей. Числовые поля в `UnitType` объявлены одним списком через
 * запятую, поэтому ищем присваивания, а не отдельные строки.
 */
function defaults(source) {
    const found = {}

    for (const name of NUMBERS) {
        const match = source.match(new RegExp(String.raw`(?:^|[\s,])${name}\s*=\s*(-?[\d.]+f?|[\w.]+)\s*[,;]`, 'm'))
        if (match === null) throw new Error(`умолчание ${name} не найдено в UnitType.java`)

        const raw = match[1]
        const value = CONSTANTS[raw] ?? Number(raw.replace(/f$/, ''))
        if (Number.isNaN(value)) throw new Error(`умолчание ${name} = ${raw}: не число и не известная константа`)

        found[name] = value
    }

    for (const name of FLAGS) {
        const match = source.match(new RegExp(String.raw`(?:^|[\s,])${name}\s*=\s*(true|false)\s*[,;]`, 'm'))
        if (match === null) throw new Error(`умолчание ${name} не найдено в UnitType.java`)
        found[name] = match[1] === 'true'
    }

    return found
}

/** UnitType.init: вместимость при отрицательном значении выводится из размера. */
function deriveItemCapacity(hitSize) {
    const rounded = Math.trunc(Math.trunc(hitSize * 4) / 10) * 10
    return Math.max(rounded, 10)
}

function parseUnits(source, base) {
    const units = {}
    const declaration = /(\w+)\s*=\s*new\s+(\w+)\("([\w-]+)"\)\s*\{\{/g

    for (const match of source.matchAll(declaration)) {
        const [, , className, name] = match
        const inner = body(source, source.indexOf('{{', match.index) + 1)

        const spec = {...base}

        for (const field of NUMBERS) {
            const found = inner.match(new RegExp(String.raw`(?:^|[\s;{])${field}\s*=\s*(-?[\d.]+)f?\s*;`, 'm'))
            if (found !== null) spec[field] = Number(found[1])
        }

        for (const field of FLAGS) {
            const found = inner.match(new RegExp(String.raw`(?:^|[\s;{])${field}\s*=\s*(true|false)\s*;`, 'm'))
            if (found !== null) spec[field] = found[1] === 'true'
        }

        if (spec.itemCapacity < 0) spec.itemCapacity = deriveItemCapacity(spec.hitSize)

        // Дальность: без оружия она равна дальности добычи, с оружием — считается по пулям
        const armed = /weapons\.add\(|weapons\s*=/.test(inner)

        if (spec.range < 0) spec.range = armed ? null : spec.mineRange
        if (spec.maxRange < 0) spec.maxRange = armed ? null : spec.mineRange

        units[name] = {class: className, armed, ...spec}
    }

    return units
}

function main() {
    const gameRoot = resolve(process.argv[2] ?? '../Mindustry')
    const read = (path) => readFileSync(join(gameRoot, 'core/src/mindustry', path), 'utf8')

    let types
    let content
    try {
        types = read('type/UnitType.java')
        content = read('content/UnitTypes.java')
    } catch (error) {
        console.error(`Не найдены исходники: ${error.message}`)
        process.exit(1)
    }

    const base = defaults(types)
    const units = parseUnits(content, base)

    if (Object.keys(units).length === 0) throw new Error('в UnitTypes.java не нашлось ни одного юнита')

    writeFileSync('core/data/unit-specs.json', JSON.stringify({
        gameVersion: 'v159.7',
        source: 'core/src/mindustry/content/UnitTypes.java, type/UnitType.java',
        note: 'Файл сгенерирован, править вручную нельзя. range = null означает, что дальность '
            + 'выводится из оружия и здесь не восстановлена.',
        defaults: base,
        units
    }, null, 2) + '\n')

    const all = Object.values(units)
    const unknown = all.filter(unit => unit.range === null).length
    console.log(`core/data/unit-specs.json: ${all.length} юнитов, дальность неизвестна у ${unknown}`)
}

main()
