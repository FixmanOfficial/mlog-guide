import {useEffect, useRef} from 'preact/hooks'

import {ContentIcon, parseMarkup, METRICS} from '@mlog/editor'
import {formatAmount} from '@mlog/editor/src/format.js'
import {drawMinimap} from '@mlog/render/src/minimap.js'

import teamData from '@mlog/core/data/teams.json'

/**
 * Углы игрового HUD: миникарта с координатами справа сверху и запасы ядра по центру.
 *
 * В игре это отдельные куски `HudFragment.build`: «minimap/position» прижат к правому
 * верхнему углу, а `CoreItemsDisplay` показывает предметы команды сеткой по четыре.
 * Размеры сняты генератором — 140 на миникарту, 52 на число, отступы 5 и 4.
 */

const teamColors = Object.fromEntries(
    Object.values(teamData.teams ?? teamData).map(team => [team.id, team.color]))

/** Цвета кусков разметки: число приходит с серым суффиксом. */
function Markup({text}) {
    return parseMarkup(text).map((part, index) => (
        <span key={index} style={part.color === null ? undefined : {color: part.color}}>{part.text}</span>
    ))
}

/**
 * Миникарта. Фон — девятипатч `Tex.pane` с отступом 5, сторона 140 (`Minimap`).
 * Перерисовывается каждый кадр вместе с миром: карта маленькая, дешевле, чем следить
 * за изменениями.
 */
export function Minimap({world, beat}) {
    const canvas = useRef(null)
    const side = METRICS.minimapSize ?? 140

    useEffect(() => {
        if (canvas.current === null) return

        const ratio = globalThis.devicePixelRatio ?? 1
        const pixels = Math.round(side * ratio)

        if (canvas.current.width !== pixels) {
            canvas.current.width = pixels
            canvas.current.height = pixels
        }

        drawMinimap(canvas.current, world, {teams: teamColors, unitSize: Math.max(2, ratio * 2)})
    }, [world, beat, side])

    return (
        <div class="hud-minimap" style={{padding: `${METRICS.minimapMargin ?? 5}px`}}>
            <canvas ref={canvas} style={{width: `${side}px`, height: `${side}px`}} />
        </div>
    )
}

/**
 * Запасы ядра. Игра показывает предмет, который хоть раз там побывал, и больше его
 * не убирает (`usedItems`), поэтому набор только растёт — иначе панель прыгала бы.
 */
export function CoreItems({world, beat}) {
    const seen = useRef(new Set())
    const core = world.core(world.rules.defaultTeam)

    if (core !== null && core.items !== null) {
        for (const [item, amount] of core.items) if (amount > 0) seen.current.add(item)
    }

    const items = [...seen.current]
    if (items.length === 0) return null

    return (
        <div
            class="hud-core"
            style={{
                padding: `${METRICS.coreItemsMargin ?? 4}px`,
                gridTemplateColumns: `repeat(${METRICS.coreItemsColumns ?? 4}, auto)`
            }}
        >
            {items.map(item => (
                <div class="hud-core__item" key={item}>
                    <ContentIcon type="item" name={item} size={8 * (METRICS.iconSmallFactor ?? 3)} />
                    <span class="hud-core__amount" style={{minWidth: `${METRICS.coreAmountWidth ?? 52}px`}}>
                        <Markup text={formatAmount(core?.items.get(item) ?? 0)} />
                    </span>
                </div>
            ))}
        </div>
    )
}

/**
 * Координаты под миникартой. В игре их две строки: своя клетка и клетка под курсором,
 * вторая серая (`[lightgray]`), и каждая включается своей настройкой. Игрока у нас нет,
 * поэтому остаётся курсор.
 */
export function Position({tile}) {
    if (tile === null) return null

    return <div class="hud-position"><Markup text={`[lightgray]${tile.x},${tile.y}`} /></div>
}
