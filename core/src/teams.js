/**
 * Команды и их цвета.
 *
 * Цвет команды видно и в мире, и из логики: им красится «ячейка» юнита поверх корпуса,
 * и его же отдаёт `sensor @color` у юнита и у здания. Таблица снимается дампом из игры,
 * потому что цвета заданы в `game/Team.java` числами и меняются между версиями.
 */

import {packColorHex} from './arc.js'
import teams from '../data/teams.json' with {type: 'json'}

export const TEAMS = teams.teams

/** Команда по номеру. Их шесть базовых, остальные 250 в игре безымянные. */
export function team(id) {
    return Object.values(TEAMS).find(item => item.id === id) ?? null
}

/** Цвет команды записью `#rrggbb`. Неизвестная команда считается ничьей. */
export const teamColor = (id) => team(id)?.color ?? TEAMS.derelict.color

/** Он же упакованный, как его отдаёт `sensor @color`: прозрачность всегда полная. */
export const teamColorBits = (id) => packColorHex(teamColor(id))
