/**
 * Урон: как он считается и как расходится взрывом.
 *
 * Перенос `entities/Damage.java`. Две вещи здесь неочевидны и обе перенесены как есть:
 *
 *  - **броня вычитается, но не спасает совсем**: `max(урон - броня, 0.1 * урон)`, то есть
 *    даже сквозь любую броню проходит десятая часть;
 *  - **взрыв не круг, а лучи**. Игра пускает из центра лучи и ведёт по ним урон, вычитая
 *    здоровье того, что встретилось. Стена прикрывает то, что за ней, — и это не эффект,
 *    а сама механика: `Damage.tileDamage`.
 *
 * Сплошной урон (`pierce`) считается иначе — по кругу и без препятствий, полной величиной
 * каждому зданию внутри.
 */

import {unconv, conv, TILE_SIZE} from './unit.js'

/** Vars.minArmorDamage: сквозь броню всегда проходит хотя бы десятая часть. */
export const MIN_ARMOR_DAMAGE = 0.1

/** Damage.applyArmor */
export const applyArmor = (damage, armor) => Math.max(damage - armor, MIN_ARMOR_DAMAGE * damage)

/**
 * Damage.calculateDamage: спад от центра к краю. Затухание 0.4 означает, что на самом краю
 * взрыва достаётся не ноль, а сорок процентов.
 */
export function falloff(distance, radius, damage) {
    const scale = radius <= 0.00001 ? 1 : 1 - distance / radius
    return damage * (scale + (1 - scale) * 0.4)
}

/**
 * Damage.damage. Урон достаётся врагам указанной команды; без команды — всем подряд.
 * Юниты проверяются с поправкой на свой размер (`scaled`), поэтому крупный юнит цепляет
 * взрыв краем корпуса.
 */
export function damage(world, {team = null, x, y, radius, amount, complete = false, air = true, ground = true}) {
    if (amount < 0) return

    for (const unit of world.units) {
        if (unit.dead) continue
        if (team !== null && unit.team === team) continue
        if (!(unit.isFlying() ? air : ground)) continue

        const half = unit.spec.hitSize / 2
        if (!unit.within(x, y, radius + half)) continue

        unit.damage(falloff(Math.max(0, unit.dst(x, y) - half), radius, amount))
    }

    if (!ground) return

    if (complete) completeDamage(world, x, y, radius, amount, team)
    else tileDamage(world, Math.round(conv(x)), Math.round(conv(y)), radius / TILE_SIZE, amount, team)
}

/**
 * Damage.completeDamage: сплошной урон по кругу, полной величиной и не глядя на препятствия.
 * Радиус здесь считается в тайлах и округляется вниз.
 *
 * Урон раздаётся **по клеткам**, а не по зданиям: большое здание получает его столько раз,
 * сколько его клеток попало в круг. Блок 2×2 целиком внутри — вчетверо. Так в игре.
 */
export function completeDamage(world, x, y, radius, amount, team) {
    const tiles = Math.trunc(radius / TILE_SIZE)
    const [cx, cy] = [Math.round(x / TILE_SIZE), Math.round(y / TILE_SIZE)]

    for (let dx = -tiles; dx <= tiles; dx++) {
        for (let dy = -tiles; dy <= tiles; dy++) {
            if (dx * dx + dy * dy > tiles * tiles) continue

            const building = world.at(cx + dx, cy + dy)
            if (building === undefined) continue
            if (team !== null && building.team === team) continue

            building.damage(amount)
        }
    }
}

/**
 * Damage.tileDamage: взрыв лучами.
 *
 * Из центра пускается `ceil(радиус * 2 * pi)` лучей, каждый идёт по Брезенхэму и на каждом
 * здании оставляет свою долю урона — тем меньшую, чем дальше от центра. Пройденное здоровье
 * копится, и как только его хватило, луч гаснет: то, что за толстой стеной, не пострадает.
 *
 * Отдельный случай в начале — взрыв внутри большого здания. Иначе оно поглотило бы всё одной
 * клеткой и получило бы куда меньше, чем от взрыва рядом.
 */
export function tileDamage(world, tx, ty, baseRadius, amount, team) {
    const inside = world.at(tx, ty)

    if (inside !== undefined && inside.team !== team && inside.size > 1 && inside.health > amount) {
        inside.damage(amount * Math.min(inside.size, baseRadius * 0.4))
        return
    }

    const radius = Math.min(baseRadius, 100)
    const radius2 = radius * radius
    const rays = Math.ceil(radius * 2 * Math.PI)
    const spacing = Math.PI * 2 / rays

    // Наибольший урон на клетку: один луч мог пройти по ней вскользь, другой в упор
    const damages = new Map()

    for (let i = 0; i <= rays; i++) {
        let dealt = 0
        let x = tx
        let y = ty

        const endX = tx + Math.trunc(Math.cos(spacing * i) * radius)
        const endY = ty + Math.trunc(Math.sin(spacing * i) * radius)

        const distanceX = Math.abs(endX - x)
        const distanceY = -Math.abs(endY - y)
        const stepX = x < endX ? 1 : -1
        const stepY = y < endY ? 1 : -1

        let error = distanceX + distanceY

        while (x !== endX || y !== endY) {
            const building = world.at(x, y)

            if (building !== undefined && building.team !== team) {
                // На краю круга остаётся доля edgeScale, а не ноль
                const edgeScale = 0.6
                const away = (x - tx) ** 2 + (y - ty) ** 2
                const multiplier = (1 - away / radius2 + edgeScale) / (1 + edgeScale)

                const next = amount * multiplier - dealt
                const key = `${x}:${y}`

                damages.set(key, Math.max(damages.get(key) ?? 0, next))
                dealt += building.health

                if (next - dealt <= 0) break
            }

            if (2 * error - distanceY > distanceX - 2 * error) {
                error += distanceY
                x += stepX
            } else {
                error += distanceX
                y += stepY
            }
        }
    }

    for (const [key, value] of damages) {
        const [x, y] = key.split(':').map(Number)
        world.at(x, y)?.damage(value)
    }
}
