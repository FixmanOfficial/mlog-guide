/**
 * Данные страницы эффектов состояния.
 *
 * Числа целиком из выгрузки (`core/data/materials.json`, снята `gen-dump.mjs` из самой игры),
 * имена — из официальных бандлов. Руками тут написано только одно: на что эффект влияет
 * словами, потому что в игре такого текста нет вовсе — `StatusEffect` показывает
 * характеристики таблицей, а не фразой.
 *
 * Скрытые эффекты (`none`, `dynamic`) в список не идут: это служебные состояния,
 * `status` ими не пользуются.
 */

import materials from '@mlog/core/data/materials.json' with {type: 'json'}
import sprites from '@mlog/core/data/sprites.json' with {type: 'json'}

import {bundle} from './data.js'

/** Служебные состояния: ни наложить осмысленно, ни увидеть. */
const SKIP = new Set(['none', 'dynamic'])

/** Тик игры — шестидесятая секунды: урон в выгрузке за тик, а читателю нужен за секунду. */
const TICKS = 60

const round = (value) => Math.round(value * 100) / 100

/**
 * Множители, которые стоит показать. Единица означает «не трогает» — такие в строку
 * не попадают вовсе, иначе таблица была бы сплошь из единиц.
 */
const FACTORS = [
    ['speedMultiplier', 'speed'],
    ['healthMultiplier', 'health'],
    ['damageMultiplier', 'damage'],
    ['reloadMultiplier', 'reload'],
    ['buildSpeedMultiplier', 'build'],
    ['dragMultiplier', 'drag']
]

export function effects(locale) {
    const names = bundle(locale).logic.params

    return Object.entries(materials.statuses)
        .filter(([name]) => !SKIP.has(name))
        .map(([name, spec]) => ({
            name,
            title: names[`status.${name}.name`] ?? name,
            color: spec.color,

            /*
             * Значок — `uiIcon` из атласа игры (`status-<имя>-ui`), снятый `gen-sprites.mjs`.
             * У неуязвимости его нет вовсе: в атласе такой картинки не нарисовано.
             */
            icon: sprites.index.status?.[name] ?? null,
            permanent: spec.permanent,
            disarm: spec.disarm,

            /*
             * `StatusComp.apply`: реактивный эффект прямым наложением не ставится вовсе.
             * Он появляется только как реакция — когда на юнита с подходящим состоянием
             * попадает противоположное. `status` такому эффекту не указ.
             */
            reactive: spec.reactive,

            // Урон за секунду: у горения 0.167 за тик, то есть 10.02
            damage: spec.damage === 0 ? null : round(spec.damage * TICKS),

            // Отдельный вид урона — пачкой раз в столько-то тиков (коррозия)
            interval: spec.intervalDamage === 0 ? null : {
                amount: spec.intervalDamage,
                seconds: round(spec.intervalDamageTime / TICKS)
            },

            factors: FACTORS
                .filter(([field]) => spec[field] !== 1)
                .map(([field, key]) => ({key, value: spec[field]}))
        }))
}
