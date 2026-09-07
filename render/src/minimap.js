/**
 * Миникарта: цвет тайла и отрисовка карты целиком.
 *
 * Цвет считает `MapIO.colorFor` — четыре ветки в одной строке, и порядок в них важен:
 * постройка красится цветом команды, стена своим цветом, а руда перекрывает пол только
 * если у неё поднят `useColor`. Декоративные наложения его не поднимают и потому не видны.
 */

import {BLOCK_SPECS} from '@mlog/core/src/world.js'

/** MapIO.colorFor: цвет одного тайла. */
export function tileColor(world, x, y, teams = {}) {
    const building = world.at(x, y)

    // Синтетический блок — это постройка, и на карте она цвета своей команды
    if (building !== undefined && BLOCK_SPECS[building.type]?.synthetic === true) {
        return teams[building.team] ?? '#ffffff'
    }

    const wall = BLOCK_SPECS[world.wallAt(x, y)]
    if (wall !== undefined && wall.solid) return wall.mapColor

    const overlay = BLOCK_SPECS[world.overlayAt(x, y)]
    if (overlay !== undefined && overlay.useColor) return overlay.mapColor

    return BLOCK_SPECS[world.floorAt(x, y)]?.mapColor ?? '#000000'
}

/**
 * Рисует карту целиком в холст. В игре миникарта показывает кусок вокруг игрока и умеет
 * приближаться; у нас карта маленькая и целиком помещается — поэтому показывается вся.
 *
 * Юниты рисуются поверх точками цвета команды, как `MinimapRenderer.drawEntities`.
 */
export function drawMinimap(canvas, world, {teams = {}, unitSize = 2} = {}) {
    const context = canvas.getContext('2d')
    const step = Math.min(canvas.width / world.width, canvas.height / world.height)

    const left = (canvas.width - step * world.width) / 2
    const top = (canvas.height - step * world.height) / 2

    context.clearRect(0, 0, canvas.width, canvas.height)

    for (let y = 0; y < world.height; y++) {
        for (let x = 0; x < world.width; x++) {
            context.fillStyle = tileColor(world, x, y, teams)

            // Ось Y холста смотрит вниз, мира — вверх
            context.fillRect(
                left + Math.round(x * step), top + Math.round((world.height - 1 - y) * step),
                Math.ceil(step), Math.ceil(step))
        }
    }

    for (const unit of world.units ?? []) {
        if (unit.dead) continue

        context.fillStyle = teams[unit.team] ?? '#ffffff'
        context.fillRect(
            left + unit.x / 8 * step - unitSize / 2,
            top + (world.height - unit.y / 8) * step - unitSize / 2,
            unitSize, unitSize)
    }

    return canvas
}
