#!/usr/bin/env node
/**
 * Генератор таблицы свойств `LAccess` — того, что читает `sensor` и меняет `control`
 * с `setprop`.
 *
 * Имена свойств игра переводит в бандлах, но **у кого** свойство работает и **что** оно
 * отдаёт — не написано нигде: это `switch` в коде. Их пять штук на разные виды объектов,
 * и человек, читающий справочник, обычно приходит именно с этим вопросом: почему
 * `sensor @poly @health` даёт число, а `sensor @copper @health` — пусто.
 *
 * Отсюда таблица: свойство → у кого читается, что возвращает, кому его можно записать.
 * Строится разбором тел `sense`, `senseObject` и `setProp`.
 *
 * Использование:
 *   node tools/gen-access.mjs <путь-к-Mindustry>
 */

import {readdirSync, readFileSync, writeFileSync} from 'node:fs'
import {basename, join, resolve} from 'node:path'
import {GAME_VERSION} from './version.mjs'
import {BLOCK_SPECS} from '../core/src/specs.js'

/**
 * Кто отвечает на `sensor`. Ключ — как это называется в справочнике, значение — где искать.
 *
 * Тип блока и здание разделены не для красоты: `sensor @router @size` спрашивает **тип**,
 * а `sensor block1 @size` — поставленное здание, и отвечают на них разные `switch`.
 */
const HOLDERS = {
    block: 'core/src/mindustry/world/Block.java',
    building: 'core/src/mindustry/entities/comp/BuildingComp.java',
    unitType: 'core/src/mindustry/type/UnitType.java',
    unit: 'core/src/mindustry/entities/comp/UnitComp.java',
    item: 'core/src/mindustry/type/Item.java',
    liquid: 'core/src/mindustry/type/Liquid.java',
    team: 'core/src/mindustry/game/Team.java',
    bullet: 'core/src/mindustry/entities/comp/BulletComp.java'
}

/*
 * Имён носителей на человеческом языке здесь нет и быть не может: в ядре нет текста
 * для пользователя (CLAUDE.md, «Мультиязычность»). Подписи живут на стороне сайта.
 */

/** Тело метода по сигнатуре: от первой `{` до парной ей. */
function methodBody(text, signature) {
    const at = text.indexOf(signature)
    if (at === -1) return null

    const open = text.indexOf('{', at + signature.length)
    if (open === -1) return null

    let depth = 0

    for (let i = open; i < text.length; i++) {
        if (text[i] === '{') depth++
        else if (text[i] === '}') {
            depth--
            if (depth === 0) return text.slice(open + 1, i)
        }
    }

    return null
}

/**
 * Имена свойств из тела метода. Игра пишет их двумя способами вперемешку: `switch` с
 * ветками (`case health, maxHealth -> health`) и цепочкой сравнений
 * (`if(sensor == LAccess.name) return name`). Обе формы значат одно и то же.
 */
function accessNames(body) {
    if (body === null) return []

    const names = []

    for (const [, list] of body.matchAll(/case\s+([\w\s,]+?)\s*->/g)) {
        for (const name of list.split(',')) names.push(name.trim())
    }

    for (const [, name] of body.matchAll(/==\s*LAccess\.(\w+)/g)) names.push(name)

    return names.filter(name => name !== 'default' && name !== '')
}

/** Все `.java` в каталоге и ниже. */
function javaFiles(root) {
    const files = []

    for (const entry of readdirSync(root, {withFileTypes: true})) {
        const path = join(root, entry.name)

        if (entry.isDirectory()) files.push(...javaFiles(path))
        else if (entry.name.endsWith('.java')) files.push(path)
    }

    return files
}

/** Что читает и пишет один класс: `{имя свойства: 'number' | 'object'}` и список записей. */
function classAccess(source) {
    const numbers = accessNames(methodBody(source, 'double sense(LAccess'))
    const objects = accessNames(methodBody(source, 'Object senseObject(LAccess'))
    const setters = [
        ...accessNames(methodBody(source, 'void setProp(LAccess prop, double')),
        ...accessNames(methodBody(source, 'void setProp(LAccess prop, Object'))
    ]

    return {numbers, objects, setters}
}

/**
 * Привилегированные свойства: `LAccess.privilegedAccess`. Обычный процессор их не читает —
 * `sensor` отвечает `null`. Появилось в v160 и касается только камеры.
 */
function privilegedNames(source) {
    const match = source.match(/privilegedAccess\s*=\s*ObjectSet\.with\(([^)]*)\)/)
    return match === null ? new Set() : new Set(match[1].split(',').map(name => name.trim()))
}

/** Наборы, которые игра собирает сама: `senseable`, `controls`, `settable`. */
function parseSets(source) {
    const settable = source.match(/settable\s*=\s*\{([^}]+)\}/)

    return {
        // senseable = params.length <= 1, controls = params.length > 0 — считаются по параметрам
        settable: settable === null ? [] : settable[1].split(',').map(name => name.trim())
    }
}

/** Свойства и их параметры: `enabled("enabled")`, `color(true, "to")`. */
function parseAccess(source) {
    const body = source.slice(source.indexOf('{') + 1, source.indexOf('public final String[] params'))
    const properties = {}

    for (const [, name, args] of body.matchAll(/(\w+)\s*(?:\(([^)]*)\))?\s*[,;]/g)) {
        if (name === 'all' || name === 'senseable') continue

        const parts = args === undefined || args.trim() === ''
            ? []
            : args.split(',').map(part => part.trim())

        const isObj = parts[0] === 'true' || parts[0] === 'false' ? parts[0] === 'true' : false
        const params = (isObj || parts[0] === 'false' ? parts.slice(1) : parts)
            .map(part => part.replace(/"/g, ''))
            .filter(part => part !== '')

        properties[name] = {params, isObj}
    }

    return properties
}

function main() {
    const gameRoot = resolve(process.argv[2] ?? '../Mindustry')

    let access
    try {
        access = readFileSync(join(gameRoot, 'core/src/mindustry/logic/LAccess.java'), 'utf8')
    } catch {
        console.error('Не найден LAccess.java — см. CLAUDE.md о том, как развернуть исходники')
        process.exit(1)
    }

    const properties = parseAccess(access)
    const {settable} = parseSets(access)

    // Камеру обычный процессор не читает: `sensor` отвечает ему `null`. LAccess, v160
    for (const name of privilegedNames(access)) {
        if (properties[name] !== undefined) properties[name].privileged = true
    }

    // `@controlled` отвечает не «да/нет», а кем именно: коды лежат в GlobalVars
    const globals = readFileSync(join(gameRoot, 'core/src/mindustry/logic/GlobalVars.java'), 'utf8')
    const codes = {}

    for (const [, name, value] of globals.matchAll(/(ctrl\w+)\s*=\s*(\d+)/g)) codes[name] = Number(value)

    for (const [holder, file] of Object.entries(HOLDERS)) {
        const source = readFileSync(join(gameRoot, file), 'utf8')

        const {numbers, objects, setters} = classAccess(source)

        for (const [names, kind] of [[numbers, 'number'], [objects, 'object']]) {
            for (const name of names) {
                if (properties[name] === undefined) continue

                properties[name].sense ??= {}
                properties[name].sense[holder] = kind
            }
        }

        for (const name of setters) {
            if (properties[name] === undefined) continue

            properties[name].set ??= []
            if (!properties[name].set.includes(holder)) properties[name].set.push(holder)
        }
    }

    /*
     * Второй слой: переопределения у конкретных классов блоков. `@ammo` читается не
     * у всякого здания, а только у турели, `@progress` — у бура и фабрики, и это тоже
     * нигде не написано. Класс блока приходит из выгрузки (`block-specs.json`),
     * там же лежит вся цепочка наследования: `sense` может быть объявлен и у предка.
     */
    const classes = {}

    for (const path of javaFiles(join(gameRoot, 'core/src/mindustry/world/blocks'))) {
        const source = readFileSync(path, 'utf8')
        const {numbers, objects, setters} = classAccess(source)

        if (numbers.length + objects.length + setters.length === 0) continue

        // Имя класса — имя файла: `sense` объявлен во вложенном `XBuild`, а блок в игре — `X`
        const name = basename(path, '.java')

        classes[name] = {numbers, objects, setters}
    }

    const blocks = BLOCK_SPECS

    for (const [block, spec] of Object.entries(blocks)) {
        for (const type of spec.javaClasses ?? []) {
            const overrides = classes[type]
            if (overrides === undefined) continue

            for (const [names, kind] of [[overrides.numbers, 'number'], [overrides.objects, 'object']]) {
                for (const name of names) {
                    const property = properties[name]
                    if (property === undefined) continue

                    property.blocks ??= {}
                    property.blocks[block] ??= kind
                }
            }

            for (const name of overrides.setters) {
                const property = properties[name]
                if (property === undefined) continue

                property.setBlocks ??= []
                if (!property.setBlocks.includes(block)) property.setBlocks.push(block)
            }
        }
    }

    const target = 'core/data/access.json'
    writeFileSync(target, JSON.stringify({
        gameVersion: GAME_VERSION,
        source: 'logic/LAccess.java плюс тела sense/senseObject/setProp у восьми носителей',
        note: 'Файл сгенерирован, править вручную нельзя. sense — у кого свойство читается '
            + 'и что отдаёт (число или объект); set — кому его пишет setprop; blocks — '
            + 'блоки, у класса которых своё чтение сверх общего для зданий; settable — '
            + 'список из самой игры, controlled — коды того, кем управляется юнит.',
        holders: Object.keys(HOLDERS),
        settable,
        controlled: codes,
        properties
    }, null, 2) + '\n')

    const sensed = Object.values(properties).filter(property => property.sense !== undefined).length
    const special = Object.values(properties).filter(property => property.blocks !== undefined).length

    console.log(`${target}: свойств ${Object.keys(properties).length}, читается ${sensed},`
        + ` из них ${special} только у отдельных блоков, классов с переопределением ${Object.keys(classes).length}`)
}

main()
