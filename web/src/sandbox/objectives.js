/**
 * Текст цели — как его собирает игра.
 *
 * Ядро отдаёт ключ строки и числа (`describe`), а строку берёт отсюда: `objective.item`
 * это «[accent]Получите: [][lightgray]{0}[]/{1}\n{2}[lightgray]{3}», и порядок аргументов
 * задан вызовом `Core.bundle.format` в `MapObjectives`. Порядок этот руками не выведешь,
 * поэтому у каждой строки ниже стоит ссылка на её `text()` в исходнике.
 *
 * Аргумент-иконка (`{2}` у предмета) в игре — символ шрифта: игра вшивает иконки контента
 * в шрифт и подставляет `item.emoji()`. У нас иконки лежат атласом, поэтому на её место
 * встаёт метка, а после разбора разметки — узел с картинкой. Порядок именно такой: цвет
 * может открыться до подстановки и закрыться после неё, и разбирать куски по отдельности
 * нельзя.
 */

import {parseMarkup} from '@mlog/editor'
import {nameBundle} from '@mlog/editor/src/names.js'

/** Метка на месте иконки: символ, которого не бывает в тексте игры. */
const MARK = ''

/** Название контента на языке страницы. */
const named = (type, name) => nameBundle().content[type]?.[name] ?? name

/**
 * Аргументы по видам целей — в том порядке, в каком их подставляет игра.
 * MapObjectives: ResearchObjective.text и далее по классам.
 */
const ARGUMENTS = {
    research: (data) => [{type: 'item', name: data.content}, named('item', data.content)],
    produce: (data) => [{type: 'item', name: data.content}, named('item', data.content)],

    item: (data) => [data.have, data.amount, {type: 'item', name: data.item}, named('item', data.item)],
    coreitem: (data) => [data.have, data.amount, {type: 'item', name: data.item}, named('item', data.item)],

    buildcount: (data) => [data.left, {type: 'block', name: data.block}, named('block', data.block)],
    unitcount: (data) => [data.left, {type: 'unit', name: data.unit}, named('unit', data.unit)],

    destroyunits: (data) => [data.left],
    destroyblock: (data) => [{type: 'block', name: data.block}, named('block', data.block)],
    destroyblocks: (data) => [data.done, data.total, {type: 'block', name: data.block}, named('block', data.block)],

    destroycore: () => [],
    commandmode: () => []
}

/**
 * Время до конца таймера строкой «м:сс», как `TimerObjective.text`: секунды целые, минуты
 * отбрасываются, если их нет, а нулём секунды дополняются только когда минуты есть.
 */
export function timeString(ticks) {
    const total = Math.trunc(ticks / 60)
    const [minutes, seconds] = [Math.trunc(total / 60), total % 60]

    if (minutes <= 0) return String(seconds)
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`
}

/** Подстановка `{0}`, `{1}`: иконки заменяются меткой и собираются отдельно. */
function fill(template, args) {
    const icons = []

    const text = template.replace(/\{(\d+)\}/g, (whole, index) => {
        const value = args[Number(index)]

        if (value === undefined) return whole
        if (typeof value !== 'object') return String(value)

        icons.push(value)
        return MARK
    })

    return {text, icons}
}

/**
 * Куски текста цели: `{text, color}` и `{icon, color}`. Цвет приходит из разметки игры.
 *
 * Пустой список означает, что показывать нечего: у флага и таймера строку задаёт карта,
 * и без неё игра цель в углу не показывает вовсе (`text != null && !text.isEmpty()`).
 */
export function objectiveNodes(objective, world) {
    const data = objective.describe(world)

    let template
    let args

    if (data.key === null) {
        // Своя строка карты: у таймера в неё подставляется остаток времени
        if (!data.text) return []

        template = data.text
        args = objective.kind === 'timer' ? [timeString(data.left)] : []
    } else {
        template = nameBundle().objectives.objectives[data.key.replace('objective.', '')]
        if (template === undefined) return []

        args = ARGUMENTS[objective.kind]?.(data) ?? []
    }

    const {text, icons} = fill(template, args)
    let taken = 0

    return parseMarkup(text).flatMap(part => part.text.split(MARK).flatMap((piece, index) => [
        ...(index > 0 ? [{icon: icons[taken++], color: part.color}] : []),
        ...(piece === '' ? [] : [{text: piece, color: part.color}])
    ]))
}
