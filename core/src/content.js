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

    return {globals, types}
}
