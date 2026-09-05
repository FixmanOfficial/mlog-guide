/**
 * Таблица переменных — то же, что кнопка «Переменные» в игре.
 *
 * Правила из `LogicDialog`:
 *  - константы не показываются вовсе (`if(s.constant) continue`);
 *  - число печатается целым, если отличается от целого меньше чем на 1e-5;
 *  - у каждой переменной есть тип и цвет типа, и это единственное место, где игрок
 *    вообще видит, что переменная сейчас держит объект, а не число.
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

export function Variables({processor}) {
    const rows = [...processor.vars.values()].filter(variable => !variable.constant)

    if (rows.length === 0) {
        return <div class="sandbox__empty">Переменных пока нет: программа их ещё не завела.</div>
    }

    return (
        <div class="vars">
            {rows.map(variable => (
                <div class="vars__row" key={variable.name}>
                    <span class="vars__name">{variable.name}</span>
                    <span class="vars__value">{valueText(variable)}</span>
                    <span class="vars__type" style={{'--type': TYPE_COLORS[typeName(variable)]}}>
                        {typeName(variable)}
                    </span>
                </div>
            ))}
        </div>
    )
}
