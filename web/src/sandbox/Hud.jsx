import {ContentIcon, parseMarkup} from '@mlog/editor'

import {objectiveNodes} from './objectives.js'
import {Minimap, CoreItems, Position} from './HudPanels.jsx'

/**
 * Полоса состояния поверх карты — то, что в игре занимает верх экрана (`HudFragment`).
 *
 * Порядок в игре жёсткий и перенесён как есть:
 *
 *  1. миссия перекрывает всё — `state.rules.mission`, её ставит `message mission`;
 *  2. иначе идут цели: каждая работающая и не скрытая, чей текст не пуст;
 *  3. каждая следующая строка начинается с `[white]` — иначе цвет предыдущей потёк бы дальше.
 *
 * Ниже полосы — сообщения от `message`: объявление посередине, уведомление и подсказка
 * своими местами. Дольше своего срока они не висят: `world.tick` считает время сам.
 */

/** Куски текста в узлы: цвет из разметки, иконка контента картинкой из атласа. */
function Nodes({nodes}) {
    return nodes.map((node, index) => node.icon !== undefined
        ? <ContentIcon key={index} type={node.icon.type} name={node.icon.name} size={20} />
        : <span key={index} style={node.color === null ? undefined : {color: node.color}}>{node.text}</span>)
}

/** Строки состояния: миссия либо цели. HudFragment.java:1080-1105 */
function statusLines(world) {
    const mission = world.rules.get('mission')
    if (typeof mission === 'string' && mission !== '') return [parseMarkup(mission)]

    return world.objectives.all
        .filter(objective => objective.qualified() && !objective.hidden)
        .map(objective => objectiveNodes(objective, world))
        .filter(nodes => nodes.length > 0)
}

/** Сообщение живёт столько секунд, сколько попросила программа. */
function currentMessage(world) {
    const message = world.message
    if (message === null) return null

    return world.tick - message.at < message.duration * 60 ? message : null
}

export function Hud({world, beat, hover = null}) {
    const lines = statusLines(world)
    const message = currentMessage(world)

    return (
        <div class="hud">
            <div class="hud__corner hud__corner--right">
                <Minimap world={world} beat={beat} />
                <Position tile={hover} />
            </div>

            <div class="hud__corner hud__corner--top">
                <CoreItems world={world} beat={beat} />
            </div>
            {lines.length > 0 && (
                <div class="hud__status">
                    {lines.map((nodes, index) => (
                        <div class="hud__line" key={index}>
                            <Nodes nodes={nodes} />
                        </div>
                    ))}
                </div>
            )}

            {message !== null && (
                <div class={`hud__message hud__message--${message.type}`}>
                    <Nodes nodes={parseMarkup(message.text)} />
                </div>
            )}
        </div>
    )
}
