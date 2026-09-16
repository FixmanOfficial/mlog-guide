/**
 * Данные страницы игровых правил — тех, что меняет `setrule`.
 *
 * Список значений приходит из схемы инструкций (`LogicRule`, снят `gen-instructions.mjs`),
 * поэтому новое правило в игре появится здесь само. А вот что каждое делает, игра нигде
 * не пишет: в `Rules.java` это поля без описаний, и подписи к ним приходится держать свои.
 *
 * Зато **как** правило принимает значение — не мнение, а код: `SetRuleI` одни правила
 * читает как «да/нет», другие переводит из секунд и клеток, третьи требуют команду
 * в третьем поле, а `mapArea` — четыре последних.
 */

import schema from '@mlog/core/data/instructions.json' with {type: 'json'}
import {TEAM_RULES} from '@mlog/core/src/rules.js'

import {RULES_RU} from './rules.ru.js'
import {RULES_EN} from './rules.en.js'

/** `SetRuleI`: правила, читаемые как «да/нет» (`value.bool()`). */
const FLAGS = new Set([
    'waveTimer', 'waves', 'waveSending', 'attackMode',
    'lighting', 'canGameOver', 'pauseDisabled', 'unitLight'
])

/** Правила, которые игра переводит из привычных единиц во внутренние. */
const SCALED = {
    currentWaveTime: 'seconds',
    waveSpacing: 'seconds',
    enemyCoreBuildRadius: 'tiles',
    dropZoneRadius: 'tiles'
}

/** Правила, берущие не число, а контент — блок или тип юнита. */
const CONTENT = new Set(['ban', 'unban'])

export function rules(locale) {
    const descriptions = locale === 'ru' ? RULES_RU : RULES_EN

    return schema.enums.LogicRule.map(name => ({
        name,
        description: descriptions[name] ?? null,
        kind: CONTENT.has(name) ? 'content'
            : name === 'mapArea' ? 'area'
            : FLAGS.has(name) ? 'flag'
            : 'number',
        team: TEAM_RULES[name] !== undefined,
        scale: SCALED[name] ?? null,
        limits: TEAM_RULES[name] ?? null
    }))
}
