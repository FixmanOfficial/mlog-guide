/**
 * Разбор переменной для таблицы — `LogicDialog.typeColor`, `typeName` и печать значения.
 *
 * Живёт в редакторе, а не на странице, потому что это знание об игре, и его надо сверять
 * с исходником тестом. Страница только рисует то, что здесь посчитано.
 */

import {javaDoubleToString} from '@mlog/core/src/arc.js'
import {MAX_TEXT_BUFFER} from '@mlog/core/src/vm.js'
import pal from '@mlog/core/data/pal.json' with {type: 'json'}

/**
 * LogicDialog.typeColor. Порядок проверок и цвета — оттуда же: число это `Pal.place`,
 * пустое значение — `Color.darkGray` из arc, а не цвет палитры игры.
 */
export const TYPE_COLORS = {
    number: pal.colors.place,
    null: '#3f3f3f',
    string: pal.colors.ammo,
    content: pal.colors.logicOperations,
    building: pal.colors.logicBlocks,
    unit: pal.colors.logicUnits,
    team: pal.colors.logicUnits,
    enum: pal.colors.logicIo,
    unknown: '#ffffff'
}

/** Цвет имени переменной: `Pal.accent` на подложке `Pal.gray`. */
export const NAME_COLOR = pal.colors.accent
export const NAME_BACKGROUND = pal.colors.gray

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

/**
 * Значение так, как его печатает таблица игры: целое, если отличается от целого меньше
 * чем на 1e-5, иначе полная запись числа.
 */
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
 * Текстовый буфер процессора отдельной строкой таблицы.
 *
 * В ванильной игре его не видно: `print` копит текст внутри исполнителя, и пока не сработает
 * `printflush` или `draw print`, узнать содержимое нельзя. Это неудобно ровно там, где ошибка
 * чаще всего и сидит, поэтому популярный мод показывает буфер в таблице переменных — а вслед
 * за ним и мы.
 *
 * Строка помечена как добавка: она не переменная, записать в неё нельзя, и в списке `vars`
 * её нет. Тип у неё строковый, как у всего, что печатается.
 */
export function bufferRow(processor) {
    return {
        name: 'textBuffer',
        type: 'string',
        value: processor.textBuffer,
        limit: MAX_TEXT_BUFFER,
        extra: true
    }
}

/**
 * `Color.mul(0.5)` из arc: полоска перед ячейкой вдвое темнее самой ячейки. Канал живёт долей
 * от нуля до единицы, а в байт переводится усечением, как `rgba8888`, поэтому 69 даёт 34.
 */
export function dim(color) {
    const value = parseInt(color.slice(1), 16)
    const half = (channel) => Math.trunc(channel / 255 * 0.5 * 255).toString(16).padStart(2, '0')

    return `#${half(value >> 16 & 0xff)}${half(value >> 8 & 0xff)}${half(value & 0xff)}`
}
