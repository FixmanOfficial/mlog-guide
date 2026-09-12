/**
 * Константы контента и таблицы для lookup.
 *
 * В игре `GlobalVars` кладёт в константы весь зарегистрированный контент: `@copper`, `@router`,
 * `@dagger` и так далее (`GlobalVars.java:110-151`). Отдельно от них живут логические
 * идентификаторы из `logicids.dat` — их снимает `tools/gen-content.mjs`, и по ним работает
 * `lookup` и константы `@blockCount`, `@unitCount`, `@itemCount`, `@liquidCount`.
 *
 * Данные приходят снаружи: ядро не читает файлы и не знает, как устроена сборка сайта.
 */

import {LVar} from './lvar.js'
import {NOT_SENSED} from './sense.js'
import {packColorHex} from './arc.js'
import {TEAMS} from './teams.js'
import blockSpecs from '../data/block-specs.json' with {type: 'json'}
import unitSpecs from '../data/unit-specs.json' with {type: 'json'}
import materials from '../data/materials.json' with {type: 'json'}

/** Vars.tilesize */
const TILE = 8

/** Типы контента, у которых есть таблица идентификаторов. GlobalVars.writableLookableContent */
export const CONTENT_TYPES = ['block', 'unit', 'item', 'liquid']

/**
 * Объект контента. Достаточно имени и типа: логике доступно только это,
 * а всё остальное — дело рендера.
 */
export class Content {
    constructor(type, name, logicId) {
        this.contentType = type
        this.name = name
        this.logicId = logicId
    }

    /** Structs.eq для контента: одинаковыми считаются одинаковые тип и имя. */
    equals(other) {
        return other instanceof Content && other.contentType === this.contentType && other.name === this.name
    }

    /**
     * Свойства самого контента, а не его воплощения в мире: `sensor x @dagger @health`
     * отдаёт здоровье типа. Спрашивают этим и справочники, и программы, которые выбирают
     * юнита по характеристикам.
     */
    sense(property) {
        if (property === 'id') return this.logicId

        if (this.contentType === 'unit') {
            const spec = unitSpecs.units[this.name]
            if (spec === undefined) return NaN

            switch (property) {
                case 'health': case 'maxHealth': return spec.health
                case 'armor': return spec.armor
                case 'range': return spec.maxRange / TILE
                case 'size': return spec.hitSize / TILE
                case 'flying': return spec.flying ? 1 : 0
                case 'itemCapacity': return spec.itemCapacity
                case 'speed': return spec.speed * 60 / TILE
                default: return NaN
            }
        }

        if (this.contentType === 'block') {
            const spec = blockSpecs.blocks[this.name]
            if (spec === undefined) return NaN

            switch (property) {
                case 'color': return spec.mapColor === undefined ? NaN : packColorHex(spec.mapColor)
                case 'health': case 'maxHealth': return spec.health
                case 'solid': return spec.solid ? 1 : 0
                case 'size': return spec.size
                case 'itemCapacity': return spec.itemCapacity
                case 'liquidCapacity': return spec.liquidCapacity
                default: return NaN
            }
        }

        // У предмета и жидкости из свойств только цвет: Item.sense, Liquid.sense
        const material = materials[this.contentType === 'item' ? 'items' : 'liquids']?.[this.name]
        if (material !== undefined && property === 'color') return packColorHex(material.color)

        return NaN
    }

    /**
     * Сколько в контенте другого контента. У типа блока это **цена постройки**:
     * `sensor медь @duo @copper` отдаёт 35 — столько меди стоит дуо. Малоизвестно, но
     * работает, и режим бесконечных ресурсов честно отвечает нулём.
     *
     * У остальных видов контента ответ ноль, а не пустота: `Senseable.sense(Content)`
     * по умолчанию возвращает 0. Block.java:1677-1690, Senseable.java:10
     */
    senseContent(content, rules = null) {
        if (this.contentType !== 'block') return 0
        if (content?.contentType !== 'item') return NaN

        if (rules?.get('infiniteResources') === true) return 0

        const spec = blockSpecs.blocks[this.name]
        const stack = spec?.requirements?.find(entry => entry.item === content.name)
        if (stack === undefined) return 0

        return Math.round(stack.amount * (rules?.get('buildCostMultiplier') ?? 1))
    }

    /** Единственное объектное свойство контента — имя. */
    senseObject(property) {
        return property === 'name' ? this.name : NOT_SENSED
    }
}

/**
 * Строит константы и таблицы поиска из данных генератора.
 * @param data содержимое core/data/logic-ids.json
 */
export function createContent(data) {
    const globals = new Map()
    const types = {}

    const constant = (name, value, isObject) => {
        const variable = new LVar(name, {constant: true})
        if (isObject) {
            variable.isobj = true
            variable.objval = value
        } else {
            variable.isobj = false
            variable.numval = value
        }
        globals.set(name, variable)
    }

    for (const type of CONTENT_TYPES) {
        const names = data.types[type] ?? []
        types[type] = names.map((name, logicId) => new Content(type, name, logicId))

        for (const item of types[type]) {
            // Имя в константе не переводится: @copper это язык, а не интерфейс
            if (!globals.has(`@${item.name}`)) constant(`@${item.name}`, item, true)
        }

        constant(`@${type}Count`, names.length, false)
    }

    /*
     * Статусы эффектов: в v160 у каждого появилась константа `@status-<имя>`, и `status`
     * берёт эффект переменной, а не строкой. Логического идентификатора у них нет —
     * в таблицу `lookup` статусы не входят. GlobalVars.init, v160
     */
    types.status = Object.keys(materials.statuses ?? {})
        .map(name => new Content('status', name, -1))

    for (const effect of types.status) {
        constant(`@status-${effect.name}`, effect, true)
    }

    /*
     * Кроме перечислимых блоков игра кладёт в константы **все** блоки, включая местность:
     * `@sand-floor`, `@ore-copper`, `@stone-wall` — они приходят из `ucontrol getBlock`,
     * и сравнивать результат не с чем, если константы нет. В таблицу `lookup` они при этом
     * не входят, поэтому логического идентификатора у них нет. GlobalVars.java:122-127
     *
     * Единственное исключение — блоки, у которых есть одноимённый предмет: песок это `@sand`
     * предмет, а не пол. Пол называется `sand-floor` именно поэтому.
     */
    const items = new Set(data.types.item ?? [])
    const environment = []

    for (const [name, spec] of Object.entries(blockSpecs.blocks)) {
        if (items.has(name) || globals.has(`@${name}`)) continue

        const block = new Content('block', name, -1)
        block.kind = spec.kind ?? 'block'

        environment.push(block)
        constant(`@${name}`, block, true)
    }

    types.environment = environment

    /*
     * Команды тоже лежат в константах: `@sharded`, `@crux` и остальные четыре.
     * Это не контент — у них нет ни типа, ни логического номера, — но `fetch`, `spawn`
     * и `setblock` принимают именно их. GlobalVars.java:131
     */
    for (const [name, team] of Object.entries(TEAMS)) {
        constant(`@${name}`, {teamId: team.id, name}, true)
    }

    /** Объект контента по имени. Ищет среди констант, поэтому видит и местность. */
    const find = (name) => globals.get(`@${name}`)?.objval ?? null

    return {globals, types, find}
}
