/**
 * Сцена данными.
 *
 * Мир, блоки, юниты, цели и программы описываются обычным объектом, а собирает его отсюда
 * `buildScene`. Раньше сцена была кодом — пятьдесят строк вызовов `world.add`, — и каждый
 * новый урок или пресет означал бы правку этого кода.
 *
 * Формат нарочно скучный и переносимый: строки, числа и имена контента. Ничего из UI здесь
 * нет, поэтому сцену можно собрать в тесте и в ноде, а не только на странице.
 *
 * Местность задаётся картинкой из символов: строка на ряд, сверху вниз, как её видит глаз.
 * Легенда переводит символ в пол, руду и стену. Это удобнее и точнее шума: карту урока
 * рисуют, а не подбирают к ней частоту.
 */

import {World} from './world.js'

// Побочный эффект: блоки записывают себя в опись классов при загрузке
import './production.js'
import './distribution.js'
import './power.js'
import './sandbox.js'
import {Marker} from './markers.js'
import {packColorHex} from './arc.js'
import {OBJECTIVE_TYPES} from './objectives.js'

/**
 * Позиционные аргументы условий — в том же порядке, в каком их принимают классы.
 * Всё остальное (текст, метки, флаги) идёт вторым параметром и одинаково у всех.
 */
const OBJECTIVE_ARGS = {
    research: (data) => [data.content],
    produce: (data) => [data.content],
    item: (data) => [data.item, data.amount],
    coreItem: (data) => [data.item, data.amount],
    buildCount: (data) => [data.block, data.count],
    unitCount: (data) => [data.unit, data.count],
    destroyUnits: (data) => [data.count],
    timer: (data) => [data.duration],
    destroyBlock: (data) => [data.block, data.x, data.y, data.team],
    destroyBlocks: (data) => [data.block, data.team, data.positions],
    destroyCore: () => [],
    commandMode: () => [],
    flag: (data) => [data.flag]
}

/** Свойства метки, которые задаются цветом, а не числом. */
const COLOR_CONTROLS = new Set(['color'])

/** Собирает метку: вид, место и по одному вызову `control` на каждое свойство. */
function buildMarker({type = 'shape', pos = [0, 0], ...controls}) {
    const marker = new Marker(type)
    marker.control('pos', pos[0], pos[1])

    for (const [control, value] of Object.entries(controls)) {
        if (COLOR_CONTROLS.has(control)) {
            marker.control(control, packColorHex(String(value)))
            continue
        }

        const [first, second, third] = Array.isArray(value) ? value : [value]
        marker.control(control, first, second ?? NaN, third ?? NaN)
    }

    return marker
}

/** Создаёт условие по описанию: вид, его аргументы и общие свойства. */
function buildObjective({kind, markers = [], ...data}) {
    const Objective = OBJECTIVE_TYPES[kind]
    if (Objective === undefined) throw new Error(`Неизвестный вид цели: ${kind}`)

    const options = {
        text: data.text,
        hidden: data.hidden,
        details: data.details,
        flagsAdded: data.flagsAdded,
        flagsRemoved: data.flagsRemoved,
        completionLogicCode: data.completionLogicCode,
        markers: markers.map(buildMarker)
    }

    return new Objective(...(OBJECTIVE_ARGS[kind]?.(data) ?? []), options)
}

/**
 * Раскладывает местность по картинке. Первая строка — верхний ряд карты, поэтому `y`
 * считается снизу: так строки в описании читаются в том же порядке, в каком видны на экране.
 */
function paintTerrain(world, {legend = {}, rows = []}) {
    rows.forEach((row, index) => {
        const y = world.height - 1 - index

        for (let x = 0; x < row.length && x < world.width; x++) {
            const cell = legend[row[x]]
            if (cell === undefined) continue

            if (cell.floor !== undefined) world.setFloor(x, y, cell.floor)
            if (cell.ore !== undefined) world.setOverlay(x, y, cell.ore)
            if (cell.wall !== undefined) world.setWall(x, y, cell.wall)
        }
    })

    return world
}

/**
 * Собирает сцену.
 *
 * @param description описание сцены
 * @param content     таблицы контента: без них `sensor @unit @type` вернёт строку вместо @poly
 * @returns `{world, processors}` — процессоры списком записей `{building, links, program}`,
 *          где связи уже найдены по именам, а программа осталась текстом: собирать её
 *          в машину будет страница, у неё для этого есть скорость блока и команда
 */
export function buildScene(description, {content = null} = {}) {
    const {
        width = 20, height = 11, floor = 'stone',
        rules = {}, terrain = null, blocks = [], units = [],
        processors = [], objectives = []
    } = description

    const world = new World({width, height, content, floor})

    for (const [rule, value] of Object.entries(rules)) world.rules.set(rule, value)
    if (terrain !== null) paintTerrain(world, terrain)

    for (const {type, x, y, items = {}, ...options} of blocks) {
        const building = world.add(type, {x, y, ...options})

        // Запас кладёт карта, а не логика: в игре его задаёт редактор
        for (const [item, amount] of Object.entries(items)) building.handleStack(item, amount)
    }

    for (const {type, x, y, ...options} of units) world.spawn(type, {x, y, ...options})

    world.objectives.add(...objectives.map(buildObjective))

    const built = processors.map(({at, links = [], program = ''}) => {
        const building = world.at(at[0], at[1])
        if (building === undefined) throw new Error(`В клетке ${at} нет блока для процессора`)

        return {
            building,
            links: links.map(name => {
                const linked = world.get(name)
                if (linked === undefined) throw new Error(`Нет блока со связью ${name}`)
                return linked
            }),
            program
        }
    })

    return {world, processors: built}
}
