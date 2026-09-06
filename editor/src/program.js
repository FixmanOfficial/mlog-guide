/**
 * Модель программы в редакторе.
 *
 * Редактор не знает про виртуальную машину: он держит список инструкций и умеет собирать
 * из него текст mlog. Дальше текст отдаётся ядру. Обратная зависимость запрещена, иначе
 * редактор и ВМ срастутся и по отдельности их писать будет нельзя.
 *
 * От ядра редактору нужны две вещи: схема инструкций (какие у каждой параметры и в каком
 * порядке, сгенерирована из исходников игры — tools/gen-instructions.mjs) и разбор текста
 * на токены, чтобы читать программу обратно. Про виртуальную машину он по-прежнему не знает.
 */

import schema from '@mlog/core/data/instructions.json' with {type: 'json'}
import {parse} from '@mlog/core/src/parser.js'

export const INSTRUCTIONS = new Map(
    schema.instructions.map(instruction => [instruction.opcode, instruction])
)

export const ENUMS = schema.enums

/** LExecutor.maxInstructions: за этим пределом кнопки добавления гаснут. */
export const MAX_INSTRUCTIONS = 1000

/**
 * Имена полей, которые игра показывает для каждого значения перечисления.
 * Из-за них у `control enabled` видно одно поле, подписанное «to», у `control shoot` — три,
 * а у `ucontrol idle` не видно ни одного.
 */
export const ENUM_PARAMS = schema.enumParams

/** Символ значения для кнопки: у операций это «+», а не «add». LogicOp.toString */
export const ENUM_SYMBOLS = schema.enumSymbols

/** Признаки значения: func означает запись функцией — max(a, b), а не a max b. */
export const ENUM_FLAGS = schema.enumFlags

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

/**
 * Инструкции, которые показывает меню добавления. `LogicDialog.showAddDialog:302-304`:
 *
 *  - заглушка неразобранной строки (`noop`) и скрытые (`clientdata`) не показываются никогда;
 *  - привилегированные — только у процессора мира, а `nonPrivileged` — только у обычного;
 *  - у обычного при выключенном правиле `logicUnitControl` пропадает вся категория `unit`.
 *
 * То есть процессору мира доступны **и** мировые инструкции, **и** обычные: своего
 * отдельного набора у него нет.
 */
export function available({privileged = false, unitControl = true} = {}) {
    return schema.instructions.filter(instruction => {
        if (instruction.invalid || instruction.hidden) return false
        if (instruction.privileged && !privileged) return false
        if (instruction.nonPrivileged && privileged) return false
        if (!privileged && !unitControl && instruction.category === 'unit') return false

        return true
    })
}

let nextId = 1

/**
 * Приведение введённого значения, как в LStatement.sanitize.
 *
 * Поле в игре не даёт ввести то, что сломает разбор: пробел, кавычка и точка с запятой
 * подменяются. Строковый литерал при этом сохраняется целиком, а кавычки внутри него
 * становятся апострофами.
 */
export function sanitize(value) {
    if (value.length === 0) return ''

    if (value.length === 1) {
        return value === '"' || value === ';' || value === ' ' ? 'invalid' : value
    }

    if (value.startsWith('"') && value.endsWith('"')) {
        return '"' + value.slice(1, -1).split('"').join("'") + '"'
    }

    return [...value].map(char =>
        char === ';' ? 's' : char === '"' ? "'" : char === ' ' ? '_' : char).join('')
}

/** Новая инструкция со значениями по умолчанию из схемы. */
export function createStatement(opcode) {
    const definition = INSTRUCTIONS.get(opcode)
    if (definition === undefined) throw new Error(`неизвестная инструкция: ${opcode}`)

    const params = {}
    for (const param of definition.params) {
        params[param.name] = param.default ?? '0'
    }

    // Цель перехода хранится ссылкой на инструкцию, а не номером строки: в игре это
    // поле dest типа StatementElem, а destIndex считается только при сохранении.
    // Иначе вставка строки выше цели ломала бы все переходы под ней
    return {id: nextId++, opcode, params, target: null}
}

/**
 * Собирает текст mlog. Порядок параметров берётся из схемы — тот же, что у сериализации игры,
 * поэтому результат можно вставить прямо в процессор в Mindustry.
 */
export function toText(statements) {
    return statements.map(statement => {
        const definition = INSTRUCTIONS.get(statement.opcode)

        const values = definition.params.map(param => {
            // Номер строки для перехода считается здесь, из ссылки. LStatement.saveUI
            if (statement.opcode === 'jump' && param.name === 'destIndex') {
                return String(targetIndex(statements, statement))
            }

            return quote(statement.params[param.name] ?? '0')
        })

        return [statement.opcode, ...values].join(' ')
    }).join('\n')
}

/**
 * Разбор текста обратно в строки редактора — `LCanvas.load`, а под ним `LAssembler.read`.
 *
 * Неизвестные инструкции игра превращает в `InvalidStatement`; мы поступаем так же, только
 * помечаем строку `noop`, чтобы программа осталась исполнимой. Лишние параметры отбрасываются,
 * недостающие остаются со значениями по умолчанию.
 *
 * Цель перехода приходит номером строки, а хранится ссылкой: номер разрешается после того,
 * как собраны все строки, иначе переход вперёд некуда указывать.
 */
export function fromText(text) {
    const {statements} = parse(text ?? '')
    const result = []
    const jumps = []

    for (const parsed of statements) {
        const definition = INSTRUCTIONS.get(parsed.op)

        if (definition === undefined) {
            result.push(createStatement('noop'))
            continue
        }

        const statement = createStatement(parsed.op)

        definition.params.forEach((param, index) => {
            const value = parsed.params[index]
            if (value === undefined) return

            // Номер строки перехода разрешается ссылкой, когда собраны все строки
            if (parsed.op === 'jump' && param.name === 'destIndex') {
                jumps.push({statement, index: Number(value)})
                return
            }

            // Значение кладётся как есть, вместе с кавычками: в поле редактора строка
            // тоже хранится с ними, иначе она перестанет быть строкой при сборке
            statement.params[param.name] = value
        })

        result.push(statement)
    }

    for (const {statement, index} of jumps) {
        statement.target = Number.isInteger(index) && index >= 0 && index < result.length
            ? result[index].id
            : null
    }

    return result
}

/** Номер строки, на которую указывает переход, или -1, если цель не задана. */
export function targetIndex(statements, statement) {
    if (statement.target === null || statement.target === undefined) return -1

    const index = statements.findIndex(candidate => candidate.id === statement.target)
    return index
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

        // Копия ссылается на ту же цель: ссылка переживает вставку, в отличие от номера строки
        const copy = {...statements[index], id: nextId++, params: {...statements[index].params}}
        return operations.insert(statements, index + 1, copy)
    },

    /** Задать или снять цель перехода. Цель — идентификатор инструкции, а не её номер. */
    setTarget(statements, id, targetId) {
        return statements.map(statement => statement.id === id
            ? {...statement, target: statement.target === targetId ? null : targetId}
            : statement)
    },

    move(statements, from, to) {
        if (from === to) return statements

        const next = statements.slice()
        const [moved] = next.splice(from, 1)
        next.splice(to, 0, moved)
        return next
    },

    setParam(statements, id, name, value) {
        // Значение чистится сразу при вводе, как в игре: пробел и кавычка сломали бы разбор
        const clean = sanitize(value)

        return statements.map(statement => statement.id === id
            ? {...statement, params: {...statement.params, [name]: clean}}
            : statement)
    }
}
