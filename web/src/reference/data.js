/**
 * Данные справочника.
 *
 * Своего текста здесь почти нет: инструкции приходят из `instructions.json`, описания —
 * из официальных бандлов игры, свойства `sensor` — из `access.json`. Причина та же, что
 * и у остальных таблиц проекта: справочник, набранный руками, разойдётся с игрой в первом
 * же обновлении, и никто этого не заметит.
 *
 * Локаль передаётся снаружи: страницы `/ru/` и `/en/` собираются одним и тем же кодом.
 */

import schema from '@mlog/core/data/instructions.json' with {type: 'json'}
import access from '@mlog/core/data/access.json' with {type: 'json'}
import blockSpecs from '@mlog/core/data/block-specs.json' with {type: 'json'}
import icons from '@mlog/core/data/icons.json' with {type: 'json'}
import globalVars from '@mlog/core/data/globals.json' with {type: 'json'}
import ru from '@mlog/core/data/i18n/ru.json' with {type: 'json'}
import en from '@mlog/core/data/i18n/en.json' with {type: 'json'}

import {IMPLEMENTED_INSTRUCTIONS} from '@mlog/core/src/assembler.js'

import {INSTRUCTIONS_RU} from './instructions.ru.js'
import {PROPERTIES_RU} from './properties.ru.js'
import {PROCESSOR_RU, PROCESSOR_VARS} from './variables.ru.js'
import {CATEGORY_COLORS, CATEGORY_ICONS, CATEGORY_ORDER, displayName} from '@mlog/editor/src/theme.js'

const BUNDLES = {ru, en}

export const GAME_VERSION = schema.gameVersion

export const bundle = (locale) => BUNDLES[locale] ?? BUNDLES.en

/** Символ иконки категории: в игре это глиф шрифта icon.ttf, а не картинка. */
export function categoryIcon(category) {
    const name = CATEGORY_ICONS[category]
    const code = name === null || name === undefined ? undefined : icons.icons[name]

    return code === undefined ? null : String.fromCodePoint(code)
}

export function categoryTitle(locale, category) {
    return bundle(locale).logic.categories[category] ?? category
}

export const categoryColor = (category) => CATEGORY_COLORS[category] ?? CATEGORY_COLORS.unknown

/**
 * Одна инструкция для страницы. `hidden` не убираем совсем: скрытые в меню `noop`
 * и `sync` в программах встречаются, и человек приходит спросить именно про них.
 */
export function instruction(locale, opcode) {
    const entry = schema.instructions.find(item => item.opcode === opcode)
    if (entry === undefined) return null

    return {
        ...entry,
        title: displayName(entry.opcode),
        /*
         * Описание игры идёт первым: оно официальное и переведено самой Mindustry. Наше
         * подставляется там, где игра молчит, — у `op`, `ubind` и ещё девяти инструкций.
         */
        description: bundle(locale).logic.instructions[entry.opcode]
            ?? (locale === 'ru' ? INSTRUCTIONS_RU[entry.opcode] : undefined)
            ?? null,
        implemented: IMPLEMENTED_INSTRUCTIONS.has(entry.opcode),
        color: categoryColor(entry.category),
        params: entry.params.map(param => ({
            ...param,
            // `control` меняет не всякое свойство, а только те, что игра считает управляемыми
            values: param.enum === undefined
                ? null
                : enumValues(locale, param.enum, param.enum === 'LAccess' ? CONTROLS : null)
        }))
    }
}

export const opcodes = () => schema.instructions.map(entry => entry.opcode)

/**
 * Инструкции по категориям, в порядке самой игры. `unknown` уходит в конец: в меню игры
 * этой категории нет вовсе, в ней одна `noop`, и открывать ею справочник незачем.
 */
export function byCategory(locale) {
    return [...CATEGORY_ORDER.filter(name => name !== 'unknown'), 'unknown']
        .map(category => ({
            category,
            title: categoryTitle(locale, category),
            description: bundle(locale).logic.categoryDescriptions[category] ?? null,
            color: categoryColor(category),
            icon: categoryIcon(category),
            items: schema.instructions
                .filter(entry => entry.category === category)
                .map(entry => instruction(locale, entry.opcode))
        }))
        .filter(group => group.items.length > 0)
}

/**
 * Свойства, которые умеет менять `control`: у них в `LAccess` есть параметры. Игра считает
 * этот набор сама (`LAccess.controls`), и меню инструкции показывает только его — все
 * 77 свойств туда не годятся.
 */
export const CONTROLS = Object.entries(access.properties)
    .filter(([, property]) => property.params.length > 0)
    .map(([name]) => name)

/**
 * Значения перечисления. У операций есть ещё символ (`add` пишется `+`) и признак записи
 * функцией (`max(a, b)`), у остальных перечислений — только имена.
 */
export function enumValues(locale, name, only = null) {
    const symbols = schema.enumSymbols[name] ?? {}
    const flags = schema.enumFlags[name] ?? {}
    const descriptions = bundle(locale).logic.properties

    return (schema.enums[name] ?? [])
        .filter(value => only === null || only.includes(value))
        .map(value => ({
            name: value,
            symbol: symbols[value] ?? null,
            func: flags[value]?.func === true,
            description: descriptions[value] ?? null
        }))
}

/**
 * Как инструкция выглядит в коде: имя и значения параметров по умолчанию. Ровно эту
 * строку игра запишет в схему, если добавить инструкцию и ничего в ней не трогать.
 */
export function syntax(entry) {
    const parts = entry.params.map(param => {
        const value = param.default
        return value === '' || value === null || value === undefined ? '0' : String(value)
    })

    return [entry.opcode, ...parts].join(' ')
}

/** Носители свойств в порядке из генератора: у кого `sensor` вообще что-то спрашивает. */
export const HOLDERS = access.holders

/**
 * Таблица свойств: что читает `sensor`, у кого и что отдаёт.
 *
 * `blocks` — блоки, у класса которых своё чтение сверх общего для зданий: `@ammo` есть
 * у турели, но не у маршрутизатора. Список бывает длинным, поэтому страница показывает
 * начало и число остальных.
 */
export function properties(locale) {
    /*
     * Описания свойств игра почти не даёт: в бандлах есть только те, что показывает
     * `control`. Остальные написаны нами, и наши идут первыми — они полнее.
     */
    const ours = locale === 'ru' ? PROPERTIES_RU : {}
    const descriptions = bundle(locale).logic.properties

    return Object.entries(access.properties).map(([name, property]) => ({
        name,
        params: property.params,
        isObj: property.isObj,
        sense: property.sense ?? {},
        set: property.set ?? [],
        blocks: Object.keys(property.blocks ?? {}),
        setBlocks: property.setBlocks ?? [],
        settable: access.settable.includes(name),
        description: ours[name] ?? descriptions[name] ?? null
    }))
}

/** Русское имя блока — оно есть в бандлах игры. */
export function blockTitle(locale, name) {
    return bundle(locale).content.block?.[name] ?? name
}

export const blockExists = (name) => blockSpecs.blocks[name] !== undefined

/**
 * Встроенные переменные — разделами и в том же порядке, в каком их показывает окно игры.
 * Строки `sectionX` в описи это заголовки разделов, а не переменные.
 */
export function globals(locale) {
    const descriptions = bundle(locale).logic.globals
    const sections = []

    for (const entry of globalVars.entries) {
        if (entry.name.startsWith('section')) {
            // Якорь — имя раздела из игры: заголовок бывает с косой чертой и скобками
            sections.push({
                slug: entry.name.replace(/^section/, '').toLowerCase(),
                title: descriptions[entry.name] ?? entry.name,
                items: []
            })
            continue
        }

        sections.at(-1)?.items.push({
            name: entry.name,
            privileged: entry.privileged,
            description: descriptions[entry.name] ?? null
        })
    }

    return sections
}

/**
 * Переменные самого процессора. В окне игры их нет — они заводятся исполнителем, — а знать
 * про них нужно: `@counter` это переход, `@unit` это цель всех команд юнитам.
 */
export function processorVars(locale) {
    return PROCESSOR_VARS.map(entry => ({
        ...entry,
        description: locale === 'ru' ? PROCESSOR_RU[entry.name] ?? null : null
    }))
}
