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
 * за 0.2 секунды. Константы не показываются вовсе — `if(s.constant) continue`.
 *
 * Разбор переменной — цвет, тип, печать значения — живёт в редакторе: это знание об игре,
 * и оно закрыто тестами. Здесь только разметка.
 */

import {
    TYPE_COLORS, NAME_BACKGROUND, bufferRow, dim, typeName, valueText
} from '@mlog/editor/src/variables.js'

import './variables.css'

/**
 * @param beat меняется, когда пора перечитать значения. Само значение при этом не передаётся:
 *             таблица берёт его прямо из переменных процессора.
 */
export function Variables({processor, beat}) {
    const rows = [...processor.vars.values()].filter(variable => !variable.constant)
    const buffer = bufferRow(processor)

    return (
        <div class="vars">
            {rows.map(variable => {
                const type = typeName(variable)
                const color = TYPE_COLORS[type]
                const value = valueText(variable)

                return (
                    <div class="vars__row" key={variable.name}>
                        <span class="vars__stub" style={{background: dim(NAME_BACKGROUND)}} />
                        <span class="vars__name">{variable.name}</span>

                        <span class="vars__stub" style={{background: dim(NAME_BACKGROUND)}} />
                        {/* Ключ по значению: при изменении узел пересоздаётся и вспышка играет заново */}
                        <span class="vars__value" key={value}>{value}</span>

                        <span class="vars__stub" style={{background: dim(color)}} />
                        <span class="vars__type" style={{background: color}}>{type}</span>
                    </div>
                )
            })}

            {/* Буфер печати: в игре его не видно, строку подсмотрели у мода */}
            <div class="vars__row vars__row--extra" title="Текст, накопленный print. Ждёт printflush или draw print">
                <span class="vars__stub" style={{background: dim(NAME_BACKGROUND)}} />
                <span class="vars__name">{buffer.name}</span>

                <span class="vars__stub" style={{background: dim(NAME_BACKGROUND)}} />
                <span class="vars__value" key={buffer.value}>
                    {buffer.value === '' ? '—' : buffer.value}
                </span>

                <span class="vars__stub" style={{background: dim(TYPE_COLORS[buffer.type])}} />
                <span class="vars__type" style={{background: TYPE_COLORS[buffer.type]}}>
                    {buffer.type}
                </span>
            </div>
        </div>
    )
}
