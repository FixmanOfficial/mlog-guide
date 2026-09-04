/**
 * Модель программы в редакторе.
 *
 * Редактор не знает про виртуальную машину: он держит список инструкций и умеет собирать
 * из него текст mlog. Дальше текст отдаётся ядру. Обратная зависимость запрещена, иначе
 * редактор и ВМ срастутся и по отдельности их писать будет нельзя.
 *
 * Единственное, что редактору нужно от ядра, — схема инструкций: какие у каждой параметры
 * и в каком порядке. Она сгенерирована из исходников игры, см. tools/gen-instructions.mjs.
 */

import schema from '@mlog/core/data/instructions.json' with {type: 'json'}

export const INSTRUCTIONS = new Map(
    schema.instructions.map(instruction => [instruction.opcode, instruction])
)

export const ENUMS = schema.enums

/**
 * Имена полей, которые игра показывает для каждого значения перечисления.
 * Из-за них у `control enabled` видно одно поле, подписанное «to», у `control shoot` — три,
 * а у `ucontrol idle` не видно ни одного.
 */
export const ENUM_PARAMS = schema.enumParams

/** Безымянные ячейки под значения: p1, p2 и так далее. Имена им даёт выбранное значение. */
const isSlot = (name) => /^p\d+$/.test(name)

/**
 * Разбирает инструкцию на видимые поля с учётом выбранного значения перечисления.
 *
 * Возвращает список `{param, label, hidden}`: ячейки, для которых у значения нет имени,
 * помечаются скрытыми — ровно как в игровом редакторе.
 */
export function visibleParams(definition, statement) {
    const driver = definition.params.find(param =>
        param.enum !== undefined && ENUM_PARAMS[param.enum] !== undefined)

    if (driver === undefined) {
        return definition.params.map(param => ({param, label: param.name, hidden: false}))
    }

    const selected = statement.params[driver.name]
    const names = ENUM_PARAMS[driver.enum][selected] ?? []
    let slot = 0

    return definition.params.map(param => {
        if (!isSlot(param.name)) return {param, label: param.name, hidden: false}

        const label = names[slot++]
        return {param, label: label ?? param.name, hidden: label === undefined}
    })
}

/** Свойства, доступные sensor: у них не больше одного параметра. LAccess.senseable */
export const SENSEABLE = ENUMS.LAccess.filter(value =>
    (ENUM_PARAMS.LAccess[value] ?? []).length <= 1)

/** Свойства, доступные control: у них есть хотя бы один параметр. LAccess.controls */
export const CONTROLS = ENUMS.LAccess.filter(value =>
    (ENUM_PARAMS.LAccess[value] ?? []).length > 0)

/** Инструкции, доступные обычному процессору: у процессора мира отдельный набор. */
export const AVAILABLE = schema.instructions.filter(instruction => !instruction.privileged)

let nextId = 1

/** Новая инструкция со значениями по умолчанию из схемы. */
export function createStatement(opcode) {
    const definition = INSTRUCTIONS.get(opcode)
    if (definition === undefined) throw new Error(`неизвестная инструкция: ${opcode}`)

    const params = {}
    for (const param of definition.params) {
        params[param.name] = param.default ?? '0'
    }

    return {id: nextId++, opcode, params}
}

/**
 * Собирает текст mlog. Порядок параметров берётся из схемы — тот же, что у сериализации игры,
 * поэтому результат можно вставить прямо в процессор в Mindustry.
 */
export function toText(statements) {
    return statements.map(statement => {
        const definition = INSTRUCTIONS.get(statement.opcode)
        const values = definition.params.map(param => quote(statement.params[param.name] ?? '0'))

        return [statement.opcode, ...values].join(' ')
    }).join('\n')
}

/**
 * Значение с пробелами и так стало бы одним токеном с подчёркиваниями, а вот пустое
 * сломало бы порядок аргументов — подставляем ноль.
 */
function quote(value) {
    const text = String(value)
    if (text === '') return '0'
    return text
}

/** Операции над списком: редактор держит их отдельно от отрисовки. */
export const operations = {
    insert(statements, index, statement) {
        const next = statements.slice()
        next.splice(index, 0, statement)
        return next
    },

    remove(statements, id) {
        return statements.filter(statement => statement.id !== id)
    },

    duplicate(statements, id) {
        const index = statements.findIndex(statement => statement.id === id)
        if (index === -1) return statements

        const copy = {...statements[index], id: nextId++, params: {...statements[index].params}}
        return operations.insert(statements, index + 1, copy)
    },

    move(statements, from, to) {
        if (from === to) return statements

        const next = statements.slice()
        const [moved] = next.splice(from, 1)
        next.splice(to, 0, moved)
        return next
    },

    setParam(statements, id, name, value) {
        return statements.map(statement => statement.id === id
            ? {...statement, params: {...statement.params, [name]: value}}
            : statement)
    }
}
