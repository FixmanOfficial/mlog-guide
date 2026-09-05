/**
 * Таблица переменных — то же, что кнопка «Переменные» в игре.
 *
 * Строка собирается в `LogicDialog` из шести ячеек: перед каждой из трёх видимых стоит узкая
 * полоска в 8 пикселей того же цвета, но вдвое темнее. Дальше имя цветом `Pal.accent` на
 * `Pal.gray`, значение в рамке `Tex.pane` и название типа на цвете этого типа. Высота строки 45,
 * между строками зазор 4. Ширина колонок общая на всю таблицу: это обычная `Table`, а в ней
 * колонка шириной с самую широкую ячейку.
 *
 * Изменившееся значение вспыхивает: `Actions.color(Pal.accent)`, затем возврат к белому
 * за 0.2 секунды.
 *
 * Правила отбора и печати оттуда же:
 *  - константы не показываются вовсе (`if(s.constant) continue`);
 *  - число печатается целым, если отличается от целого меньше чем на 1e-5;
 *  - тип виден всегда — это единственное место, где игрок вообще замечает, что переменная
 *    держит объект, а не число.
 */

import {javaDoubleToString} from '@mlog/core/src/arc.js'

/** LogicDialog.typeColor. Цвета из graphics/Pal.java */
const TYPE_COLORS = {
    number: '#6335f8',
    null: '#3f3f3f',
    string: '#ff8947',
    content: '#877bad',
    building: '#d4816b',
    unit: '#c7b59d',
    team: '#c7b59d',
    enum: '#a08a8a',
    unknown: '#ffffff'
}

/** Pal.gray, на нём лежит имя переменной. */
const NAME_COLOR = '#454545'

/**
 * `Color.mul(0.5)` из arc: полоска перед ячейкой вдвое темнее самой ячейки. Канал живёт долей
 * от нуля до единицы, а в байт переводится усечением, как `rgba8888`, поэтому 69 даёт 34, а не 35.
 */
function dim(color) {
    const value = parseInt(color.slice(1), 16)
    const half = (channel) => Math.trunc(channel / 255 * 0.5 * 255).toString(16).padStart(2, '0')

    return `#${half(value >> 16 & 0xff)}${half(value >> 8 & 0xff)}${half(value & 0xff)}`
}

/** LogicDialog.typeName. Порядок проверок тот же, что в игре. */
export function typeName(variable) {
    if (!variable.isobj) return 'number'
    if (variable.objval === null) return 'null'
    if (typeof variable.objval === 'string') return 'string'
    if (variable.objval.contentType !== undefined) return 'content'
    if (variable.objval.world !== undefined) return 'building'
    if (variable.objval.access !== undefined) return 'enum'
    return 'unknown'
}

/** Значение так, как его печатает таблица игры. */
export function valueText(variable) {
    if (variable.isobj) {
        if (variable.objval === null) return 'null'
        if (typeof variable.objval === 'string') return variable.objval
        if (variable.objval.name !== undefined) return variable.objval.name
        if (variable.objval.access !== undefined) return `@${variable.objval.access}`
        return 'object'
    }

    const value = variable.numval
    return Math.abs(value - Math.round(value)) < 0.00001
        ? String(Math.round(value))
        : javaDoubleToString(value)
}

/**
 * @param beat меняется, когда пора перечитать значения. Само значение при этом не передаётся:
 *             таблица берёт его прямо из переменных процессора.
 */
export function Variables({processor, beat}) {
    const rows = [...processor.vars.values()].filter(variable => !variable.constant)

    if (rows.length === 0) {
        return <div class="sandbox__empty">Переменных пока нет: программа их ещё не завела.</div>
    }

    return (
        <div class="vars">
            {rows.map(variable => {
                const type = typeName(variable)
                const color = TYPE_COLORS[type]
                const value = valueText(variable)

                return (
                    <div class="vars__row" key={variable.name}>
                        <span class="vars__stub" style={{background: dim(NAME_COLOR)}} />
                        <span class="vars__name">{variable.name}</span>

                        <span class="vars__stub" style={{background: dim(NAME_COLOR)}} />
                        {/* Ключ по значению: при изменении узел пересоздаётся и вспышка играет заново */}
                        <span class="vars__value" key={value}>{value}</span>

                        <span class="vars__stub" style={{background: dim(color)}} />
                        <span class="vars__type" style={{background: color}}>{type}</span>
                    </div>
                )
            })}
        </div>
    )
}
