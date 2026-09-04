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
