/**
 * Сборка разобранных строк в исполняемые инструкции и таблицу переменных.
 *
 * Перенос logic/LAssembler.java. Тонкости:
 *
 *  - имя сначала ищется среди глобальных констант, и только потом считается литералом или переменной;
 *  - строковый литерал становится скрытой константой с именем ___"текст";
 *  - в нестроковых токенах пробелы заменяются подчёркиванием;
 *  - поддерживаются 0b, 0x со знаком и цвета вида %RRGGBB и %RRGGBBAA;
 *  - бесконечность в литерале превращается в ноль, а не в NaN;
 *  - переменная по умолчанию — объект null, а не ноль.
 */

import {LVar} from './lvar.js'
import {Diagnostic, diagnostic} from './errors.js'
import {operations, conditions} from './ops.js'
import {parse} from './parser.js'
import {
    PI, E, degRad, radDeg, parseDouble, parseLong, javaDoubleToString,
    packColorBits, unpackColorBits
} from './arc.js'
import {NOT_SENSED} from './sense.js'

export {unpackColorBits}
import {Unit, LogicAI, UNIT_SPECS, LOGIC_CONTROL_TIMEOUT, TRANSFER_DELAY, ITEM_TRANSFER_RANGE, conv, unconv} from './unit.js'
import {BLOCK_SPECS} from './world.js'
import {ALIGN_NAMES} from './font.js'

/** Все 53 инструкции из LStatements.java: нужны, чтобы отличать опечатку от неперенесённого. */
export const KNOWN_INSTRUCTIONS = new Set([
    'noop', 'read', 'write', 'draw', 'print', 'printchar', 'format', 'drawflush', 'printflush',
    'getlink', 'control', 'radar', 'sensor', 'set', 'op', 'select', 'wait', 'stop', 'lookup',
    'packcolor', 'unpackcolor', 'end', 'jump', 'ubind', 'ucontrol', 'uradar', 'ulocate',
    'query', 'getblock', 'setblock', 'spawn', 'bullet', 'status', 'weathersense', 'weatherset',
    'spawnwave', 'setrule', 'message', 'cutscene', 'effect', 'explosion', 'setrate', 'fetch',
    'sync', 'clientdata', 'getflag', 'setflag', 'setprop', 'playsound', 'playmusic', 'setmarker',
    'makemarker', 'localeprint'
])

/** Константы, не зависящие от контента игры. GlobalVars.java:45-70 */
function baseGlobals() {
    const globals = new Map()

    const constant = (name, value, isObject = false) => {
        const variable = new LVar(name, {constant: true})
        if (isObject) {
            variable.isobj = true
            variable.objval = value
        } else {
            variable.isobj = false
            variable.numval = value
        }
        globals.set(name, variable)
    }

    constant('false', 0)
    constant('true', 1)
    constant('null', null, true)

    // Все четыре берутся из Mathf, где они объявлены как float. Поэтому @pi в mlog это
    // 3.1415927410125732, а вовсе не число пи двойной точности
    constant('@pi', PI)
    constant('π', PI)
    constant('@e', E)
    constant('@degToRad', degRad)
    constant('@radToDeg', radDeg)

    // Выравнивание для draw print. GlobalVars.java:151 раскладывает LStatement.nameToAlign
    for (const [name, value] of Object.entries(ALIGN_NAMES)) constant(`@${name}`, value)

    // Свойства sensor: в игре они кладутся в константы обходом LAccess.all
    for (const access of LACCESS) constant(`@${access}`, {access}, true)

    return globals
}

/**
 * Канал 0..1 в байт. `Color.rgba8888` умножает во float и **усекает**, а не округляет:
 * половина яркости даёт 127, а не 128.
 */
const channelByte = (value) => Math.trunc(Math.fround(Math.fround(clamp01(Math.fround(value))) * 255))

const clamp01 = (value) => Math.min(1, Math.max(0, value))

const hex = (text, from, to) => {
    const value = parseInt(text.slice(from, to), 16)
    return Number.isNaN(value) ? 0 : value
}

/** Свойства LAccess, читаемые через sensor. Имена совпадают с logic/LAccess.java. */
export const LACCESS = [
    'totalItems', 'firstItem', 'totalLiquids', 'totalPower', 'itemCapacity', 'liquidCapacity',
    'powerCapacity', 'powerNetStored', 'powerNetCapacity', 'powerNetIn', 'powerNetOut', 'ammo',
    'ammoCapacity', 'currentAmmoType', 'memoryCapacity', 'health', 'maxHealth', 'heat', 'shield',
    'armor', 'efficiency', 'progress', 'timescale', 'rotation', 'x', 'y', 'velocityX', 'velocityY',
    'shootX', 'shootY', 'cameraX', 'cameraY', 'cameraWidth', 'cameraHeight', 'displayWidth',
    'displayHeight', 'bufferSize', 'operations', 'size', 'solid', 'dead', 'range', 'shooting',
    'boosting', 'mineX', 'mineY', 'mining', 'buildX', 'buildY', 'pingX', 'pingY', 'pingText',
    'building', 'breaking', 'speed', 'team', 'type', 'flag', 'flying', 'controlled', 'controller',
    'name', 'payloadCount', 'payloadType', 'totalPayload', 'payloadCapacity', 'maxUnits', 'id',
    'selectedBlock', 'selectedRotation', 'bulletLifetime', 'bulletTime', 'enabled', 'shoot',
    'shootp', 'config', 'color'
]

/** Свойства control, принимающие объект, а не число. LAccess: isObj */
/**
 * Команды `ucontrol`, которые песочница исполняет. Остальные — добыча, стройка, снос,
 * передача предметов и грузов — требуют модели ресурсов и планов постройки; пока их нет,
 * сборщик честно ставит диагностику, а не притворяется, что команда прошла.
 */
const UNIT_CONTROLS = new Set([
    'idle', 'stop', 'move', 'approach', 'pathfind', 'autoPathfind',
    'boost', 'target', 'targetp', 'flag', 'getBlock', 'within', 'unbind',
    'mine', 'itemDrop', 'itemTake'
])

const OBJECT_CONTROLS = new Set(['shootp', 'config'])

/**
 * Условия отбора цели. `RadarTarget`: три условия складываются логическим И.
 *
 * `player` и `boss` всегда ложны — игроков в песочнице нет, а звание босса раздают волны.
 * `attacker` в игре это «умеет стрелять»; у нас оружия нет, поэтому спрашиваем, есть ли оно
 * у типа вообще.
 */
const RADAR_TARGETS = {
    any: () => true,
    enemy: (team, unit) => team !== unit.team && unit.team !== 0,
    ally: (team, unit) => team === unit.team,
    player: () => false,
    attacker: (team, unit) => unit.spec.weapons > 0,
    flying: (team, unit) => unit.isFlying(),
    boss: () => false,
    ground: (team, unit) => unit.isGrounded()
}

/** Чем меряется «лучшая» цель. `RadarSort`: расстояние со знаком минус — ближе значит больше. */
const RADAR_SORTS = {
    distance: (source, unit) => -unit.dst2(source.x, source.y),
    health: (source, unit) => unit.health,
    shield: () => 0,
    armor: (source, unit) => unit.spec.armor,
    maxHealth: (source, unit) => unit.maxHealth
}

/** RadarI: у здания цель пересчитывается раз в 30 тиков, у юнита — по своему циклу в 40. */
const RADAR_PERIOD = 30

/** Режимы `ulocate`, которые песочница исполняет: остальным нужны ядра, волны и повреждения. */
const LOCATES = new Set(['ore'])

/**
 * Общая часть `radar` и `uradar`. Инструкция кеширует найденное: в игре она пересчитывает
 * цель раз в 30 тиков, чтобы десяток радаров в программе не съедал кадр. Поэтому цель бывает
 * устаревшей — это поведение игры, а не наша вольность.
 */
function radarBuilder(asm, params, fromUnit) {
    const targets = [0, 1, 2].map(index => params[index] ?? 'any')
    const sort = params[3] ?? 'distance'
    const from = asm.var(params[4] ?? 'turret1')
    const order = asm.var(params[5] ?? '1')
    const output = asm.var(params[6] ?? 'result')

    const filters = targets.map(name => RADAR_TARGETS[name] ?? RADAR_TARGETS.any)
    const measure = RADAR_SORTS[sort] ?? RADAR_SORTS.distance

    // Своё состояние на каждую инструкцию: в игре кеш живёт в самом объекте инструкции
    const state = {found: null, at: -Infinity}

    return {
        run: (vm) => {
            const base = fromUnit ? asm.var('@unit').obj() : from.obj()

            if (base === null || base === undefined || base.team !== vm.team || vm.world === null) {
                return output.setobj(null)
            }

            // У юнита дальность своя, у здания это дальность связи: LogicBlock.range
            const range = fromUnit ? base.range() : base.spec?.range
            if (range === undefined || range === null) return output.setobj(null)

            // Здание живёт в тайлах, юнит в мировых единицах — считаем в мировых
            const source = fromUnit
                ? base
                : {x: unconv(base.x + base.offset), y: unconv(base.y + base.offset)}

            if (vm.world.tick - state.at >= RADAR_PERIOD) {
                state.at = vm.world.tick
                state.found = null

                const direction = order.bool() ? 1 : -1
                let best = 0

                for (const unit of vm.world.units) {
                    if (unit === base || unit.dead || !unit.spec.targetable) continue
                    if (!unit.within(source.x, source.y, range)) continue
                    if (!filters.every(filter => filter(base.team, unit))) continue

                    const value = measure(source, unit) * direction
                    if (value > best || state.found === null) {
                        best = value
                        state.found = unit
                    }
                }
            }

            output.setobj(state.found)
        }
    }
}

/** Достаёт имя свойства из константы вида @enabled. */
function propertyName(variable) {
    const object = variable.obj()
    return object !== null && object.access !== undefined ? object.access : null
}

/** PrintI.toString плюс правило «целое печатается без дробной части». */
function printValue(variable) {
    if (variable.isobj) {
        const object = variable.objval

        if (object === null) return 'null'
        if (typeof object === 'string') return object
        if (object.access !== undefined) return object.access
        if (object.name !== undefined) return object.name
        return '[object]'
    }

    // Порог 1e-5, тот же, что у bool(): близкое к целому печатается целым
    if (Math.abs(variable.numval - Math.round(variable.numval)) < 0.00001) {
        return String(Math.round(variable.numval))
    }

    return javaDoubleToString(variable.numval)
}

export class Assembler {
    /**
     * @param options.globals дополнительные константы: @copper, @router и прочий контент игры
     * @param options.colors  именованные цвета для синтаксиса %[name]
     */
    constructor({globals = new Map(), colors = new Map()} = {}) {
        this.vars = new Map()
        this.diagnostics = []
        this.colors = colors

        this.globals = baseGlobals()
        for (const [name, value] of globals) this.globals.set(name, value)

        // @counter существует как обычная переменная и обязательно числовая
        this.counter = this.putVar('@counter')
        this.counter.isobj = false
        this.counter.numval = 0

        this.putConst('@unit', null)
        this.putConst('@this', null)
    }

    putVar(name) {
        const existing = this.vars.get(name)
        if (existing !== undefined) return existing

        // Переменные по умолчанию — объекты null
        const variable = new LVar(name)
        this.vars.set(name, variable)
        return variable
    }

    putConst(name, value) {
        const variable = this.putVar(name)

        if (typeof value === 'number') {
            variable.isobj = false
            variable.numval = value
            variable.objval = null
        } else {
            variable.isobj = true
            variable.objval = value
        }

        variable.constant = true
        return variable
    }

    /** LAssembler.var: превращает токен в переменную или скрытую константу. */
    var(symbol) {
        const global = this.globals.get(symbol)
        if (global !== undefined) return global

        let name = symbol.trim()

        if (name.length > 1 && name.startsWith('"') && name.endsWith('"')) {
            // Единственное экранирование, которое игра раскрывает в литерале
            const text = name.slice(1, -1).split('\\n').join('\n')
            return this.putConst(`___${name}`, text)
        }

        name = name.split(' ').join('_')

        const value = this.parseNumber(name)

        if (Number.isNaN(value)) return this.putVar(name)

        // Бесконечность превращается в ноль, а не остаётся недопустимым числом
        return this.putConst(`___${value}`, Number.isFinite(value) ? value : 0)
    }

    /** LAssembler.parseDouble. */
    parseNumber(symbol) {
        for (const [prefix, base] of [['0b', 2], ['+0b', 2], ['-0b', 2], ['0x', 16], ['+0x', 16], ['-0x', 16]]) {
            if (!symbol.startsWith(prefix)) continue

            const parsed = parseLong(symbol, base, prefix.length, symbol.length)
            if (parsed === null) return NaN

            return prefix[0] === '-' ? -Number(parsed) : Number(parsed)
        }

        if (symbol.startsWith('%[') && symbol.endsWith(']') && symbol.length > 3) {
            const color = this.colors.get(symbol.slice(2, -1))
            return color === undefined ? NaN : color
        }

        if (symbol.startsWith('%') && (symbol.length === 7 || symbol.length === 9)) {
            // Strings.parseInt отдаёт ноль на мусоре, поэтому %zzzzzz — это чёрный, а не ошибка
            return packColorBits(
                hex(symbol, 1, 3),
                hex(symbol, 3, 5),
                hex(symbol, 5, 7),
                symbol.length === 9 ? hex(symbol, 7, 9) : 255
            )
        }

        return parseDouble(symbol)
    }

    report(code, line, data) {
        this.diagnostics.push(diagnostic(code, line, data))
    }
}

/** Построители инструкций первой версии. Остальные осознанно не перенесены, см. PLAN.md. */
const builders = {
    set: (asm, params) => {
        const to = asm.var(params[0] ?? 'result')
        const from = asm.var(params[1] ?? '0')
        return {run: () => { if (!to.constant) to.set(from) }}
    },

    op: (asm, params, line) => {
        const name = params[0] ?? 'add'
        const operation = operations[name]

        if (operation === undefined) {
            asm.report(Diagnostic.UNKNOWN_OPERATION, line, {operation: name})
            return null
        }

        const dest = asm.var(params[1] ?? 'result')
        const a = asm.var(params[2] ?? '0')
        const b = asm.var(params[3] ?? '0')

        return {
            run: () => {
                if (name === 'strictEqual') {
                    dest.setnum(strictEqualValue(a, b))
                } else if (operation.unary === true) {
                    dest.setnum(operation.fn(a.num()))
                } else if (operation.objFn !== undefined && a.isobj && b.isobj) {
                    dest.setnum(operation.objFn(a.obj(), b.obj()))
                } else {
                    dest.setnum(operation.fn(a.num(), b.num()))
                }
            }
        }
    },

    jump: (asm, params, line) => {
        const address = Number.parseInt(params[0] ?? '-1', 10)
        const name = params[1] ?? 'always'

        if (conditions[name] === undefined) {
            asm.report(Diagnostic.UNKNOWN_CONDITION, line, {condition: name})
            return null
        }

        const value = asm.var(params[2] ?? '0')
        const compare = asm.var(params[3] ?? '0')

        return {
            run: (vm) => {
                if (address !== -1 && vm.test(name, value, compare)) {
                    vm.counter.numval = address
                }
            }
        }
    },

    // EndI ставит счётчик за последнюю инструкцию, а не в ноль: на ноль его вернёт следующий шаг
    read: (asm, params) => {
        const output = asm.var(params[0] ?? 'result')
        const target = asm.var(params[1] ?? 'cell1')
        const position = asm.var(params[2] ?? '0')

        return {
            run: () => {
                const object = target.obj()

                if (object !== null && typeof object.read === 'function') {
                    output.setnum(object.read(position.num() | 0))
                } else if (typeof object === 'string') {
                    // Чтение из строки отдаёт код символа, а за границами — NaN
                    const index = position.num() | 0
                    output.setnum(index < 0 || index >= object.length ? NaN : object.charCodeAt(index))
                } else {
                    output.setobj(null)
                }
            }
        }
    },

    write: (asm, params) => {
        const value = asm.var(params[0] ?? 'result')
        const target = asm.var(params[1] ?? 'cell1')
        const position = asm.var(params[2] ?? '0')

        return {
            run: () => {
                const object = target.obj()
                if (object !== null && typeof object.write === 'function') {
                    object.write(position.num() | 0, value.num())
                }
            }
        }
    },

    print: (asm, params) => {
        const value = asm.var(params[0] ?? '"frog"')
        return {run: (vm) => vm.appendText(printValue(value))}
    },

    printchar: (asm, params) => {
        const value = asm.var(params[0] ?? '0')

        return {
            run: (vm) => {
                if (value.isobj) return
                vm.appendText(String.fromCharCode(Math.floor(value.numval)))
            }
        }
    },

    format: (asm, params) => {
        const value = asm.var(params[0] ?? '0')
        return {run: (vm) => vm.formatText(printValue(value))}
    },

    printflush: (asm, params) => {
        const target = asm.var(params[0] ?? 'message1')

        return {
            run: (vm) => {
                const building = target.obj()
                if (building !== null && typeof building.setMessage === 'function') {
                    building.setMessage(vm.textBuffer)
                }
                // Буфер чистится всегда, даже если цель не подходит
                vm.textBuffer = ''
            }
        }
    },

    draw: (asm, params) => {
        const type = params[0] ?? 'clear'
        const args = [1, 2, 3, 4, 5, 6].map(i => asm.var(params[i] ?? '0'))

        return {
            run: (vm) => vm.appendDraw(type, args)
        }
    },

    drawflush: (asm, params) => {
        const target = asm.var(params[0] ?? 'display1')

        return {
            run: (vm) => {
                const building = target.obj()
                if (building !== null && typeof building.flush === 'function') {
                    building.flush(vm.graphicsBuffer)
                }
                vm.graphicsBuffer = []
            }
        }
    },

    sensor: (asm, params) => {
        const output = asm.var(params[0] ?? 'result')
        const target = asm.var(params[1] ?? 'block1')
        const property = asm.var(params[2] ?? '@copper')

        return {
            run: () => {
                const object = target.obj()
                const name = propertyName(property)

                // Мёртвым считается и отсутствующий объект. SenseI
                if (object === null && name === 'dead') {
                    output.setnum(1)
                    return
                }

                // Спрашивают не свойство, а контент: сколько в здании меди, что у юнита в руках
                const content = property.obj()
                if (name === null && content !== null && content.contentType !== undefined) {
                    output.setnum(object?.senseContent?.(content) ?? 0)
                    return
                }

                if (object === null || typeof object.sense !== 'function') {
                    if ((name === 'size' || name === 'bufferSize') && typeof object === 'string') {
                        output.setnum(object.length)
                        return
                    }
                    output.setobj(null)
                    return
                }

                const asObject = object.senseObject(name)
                if (asObject !== NOT_SENSED) {
                    output.setobj(asObject)
                    return
                }

                output.setnum(object.sense(name))
            }
        }
    },

    control: (asm, params) => {
        const property = params[0] ?? 'enabled'
        const target = asm.var(params[1] ?? 'block1')
        const values = [2, 3, 4, 5].map(i => asm.var(params[i] ?? '0'))

        return {
            run: () => {
                const object = target.obj()
                if (object === null || typeof object.control !== 'function') return

                // Объектные свойства передают объект, остальные — число. ControlI
                const first = OBJECT_CONTROLS.has(property) && values[0].isobj
                    ? values[0].obj()
                    : values[0].num()

                object.control(property, first, values[1].num(), values[2].num(), values[3].num())
            }
        }
    },

    /**
     * UnitBindI: обход юнитов команды по кругу. Счётчик у процессора свой на каждый тип,
     * поэтому два `ubind @poly` подряд дают разных юнитов, а не одного и того же.
     * Привязка к `null` в игре когда-то работала и была убрана как слишком сильная.
     */
    ubind: (asm, params) => {
        const type = asm.var(params[0] ?? '@poly')
        const unit = asm.var('@unit')

        return {
            run: (vm) => {
                const object = type.obj()

                if (object !== null && object.contentType === 'unit') {
                    const spec = UNIT_SPECS[object.name]
                    if (spec === undefined || !spec.logicControllable) return unit.setconst(null)

                    const seq = vm.world?.unitsOf(vm.team, object.name) ?? []
                    if (seq.length === 0) return unit.setconst(null)

                    const index = (vm.binds.get(object.name) ?? 0) % seq.length
                    unit.setconst(seq[index])
                    vm.binds.set(object.name, index + 1)
                    return
                }

                // Привязка к конкретному юниту: только своей команды и только управляемому
                if (object instanceof Unit && object.team === vm.team && object.spec.logicControllable) {
                    return unit.setconst(object)
                }

                unit.setconst(null)
            }
        }
    },

    /**
     * UnitControlI. Ничего не двигает: вешает на юнита LogicAI и пишет в него поля.
     * Каждый вызов продлевает контроль на десять секунд — отсюда привычка держать
     * `ucontrol move` в цикле, а не отдавать команду один раз.
     */
    ucontrol: (asm, params, line) => {
        const type = params[0] ?? 'move'
        const values = [1, 2, 3, 4, 5].map(i => asm.var(params[i] ?? '0'))
        const unitVar = asm.var('@unit')

        if (!UNIT_CONTROLS.has(type)) {
            asm.report(Diagnostic.NOT_IMPLEMENTED, line, {instruction: `ucontrol ${type}`})
            return null
        }

        return {
            run: (vm) => {
                const unit = unitVar.obj()
                if (!(unit instanceof Unit) || unit.dead || unit.team !== vm.team) return
                if (!unit.spec.logicControllable) return

                // checkLogicAI: контроллер создаётся при первой команде и чистит старое занятие
                let ai = unit.controller
                if (ai instanceof LogicAI) {
                    ai.controller = vm.building
                } else {
                    ai = new LogicAI(vm.building)
                    unit.controller = ai
                    unit.mineTile = null
                    unit.clearBuilding()
                }

                ai.controlTimer = LOGIC_CONTROL_TIMEOUT

                const x1 = unconv(values[0].numf())
                const y1 = unconv(values[1].numf())
                const d1 = unconv(values[2].numf())

                switch (type) {
                    case 'idle':
                    case 'autoPathfind':
                        ai.control = type
                        break

                    case 'move':
                    case 'stop':
                    case 'approach':
                    case 'pathfind':
                        ai.control = type
                        ai.moveX = x1
                        ai.moveY = y1
                        if (type === 'approach') ai.moveRad = d1

                        if (type === 'stop') {
                            unit.mineTile = null
                            unit.clearBuilding()
                        }
                        break

                    case 'unbind':
                        unit.resetController()
                        break

                    case 'within':
                        values[3].setnum(unit.within(x1, y1, d1) ? 1 : 0)
                        break

                    case 'target':
                        ai.posTarget = {x: x1, y: y1}
                        ai.aimControl = type
                        ai.mainTarget = null
                        ai.shoot = values[2].bool()
                        break

                    case 'targetp':
                        ai.aimControl = type
                        ai.mainTarget = values[0].obj()
                        ai.shoot = values[1].bool()
                        break

                    case 'boost':
                        ai.boost = values[0].bool()
                        break

                    case 'flag':
                        unit.flag = values[0].num()
                        break

                    case 'mine': {
                        const tile = {x: Math.round(conv(x1)), y: Math.round(conv(y1))}

                        // Копать умеют не все, и цель должна быть по зубам: MinerComp
                        if (unit.spec.mineTier >= 0 && unit.spec.mineSpeed > 0) {
                            unit.mineTile = unit.validMine(tile) ? tile : null
                        }
                        break
                    }

                    case 'itemDrop': {
                        const target = values[0].obj()

                        // Сброс «в воздух» просто выбрасывает груз и таймера не ждёт
                        if (target?.name === 'air') {
                            unit.clearItem()
                            break
                        }

                        if (!vm.timeoutDone(unit)) break
                        if (target === null || target.team !== vm.team || target.items === undefined) break

                        const dropped = Math.min(unit.itemAmount, values[1].numi())
                        const reach = ITEM_TRANSFER_RANGE + (target.size ?? 1) * 8 / 2

                        if (dropped <= 0 || unit.item === null) break
                        if (!unit.within(unconv(target.x + target.offset), unconv(target.y + target.offset), reach)) break

                        const accepted = target.acceptStack(unit.item, dropped)
                        if (accepted <= 0) break

                        target.handleStack(unit.item, accepted)
                        unit.itemAmount -= accepted
                        if (unit.itemAmount <= 0) unit.clearItem()

                        vm.updateTimeout(unit)
                        break
                    }

                    case 'itemTake': {
                        if (!vm.timeoutDone(unit)) break

                        const target = values[0].obj()
                        const item = values[1].obj()

                        if (target === null || target.team !== vm.team || target.items === null) break
                        if (item?.contentType !== 'item') break

                        const reach = ITEM_TRANSFER_RANGE + (target.size ?? 1) * 8 / 2
                        if (!unit.within(unconv(target.x + target.offset), unconv(target.y + target.offset), reach)) break

                        const wanted = Math.min(values[2].numi(), unit.maxAccepted(item.name))
                        const taken = target.removeStack(item.name, Math.max(0, wanted))

                        if (taken > 0) {
                            unit.addItem(item.name, taken)
                            vm.updateTimeout(unit)
                        }
                        break
                    }

                    case 'getBlock': {
                        const range = Math.max(unit.range() ?? 0, unit.spec.buildRange)

                        if (!unit.within(x1, y1, range)) {
                            values[2].setobj(null)
                            values[3].setobj(null)
                            values[4].setobj(null)
                            break
                        }

                        // World.tileWorld округляет к ближайшему тайлу, а не отбрасывает дробь
                        const tx = Math.round(conv(x1))
                        const ty = Math.round(conv(y1))

                        if (vm.world === null || !vm.world.inside(tx, ty)) {
                            values[2].setobj(null)
                            values[3].setobj(null)
                            values[4].setobj(null)
                            break
                        }

                        const lookup = (name) => vm.content?.find?.(name) ?? null

                        values[2].setobj(lookup(vm.world.blockAt(tx, ty)))
                        values[3].setobj(vm.world.at(tx, ty) ?? null)

                        // Третий результат — руда, если она есть, иначе пол. Так же в игре
                        values[4].setobj(lookup(vm.world.overlayAt(tx, ty) ?? vm.world.floorAt(tx, ty)))
                        break
                    }
                }
            }
        }
    },

    radar: (asm, params) => radarBuilder(asm, params, false),
    uradar: (asm, params) => radarBuilder(asm, params, true),

    /**
     * UnitLocateI: поиск по карте. Перенесён режим `ore` — руду мы моделируем; `building`,
     * `spawn` и `damaged` требуют флагов зданий, точек появления волн и учёта повреждений,
     * которых в песочнице нет.
     */
    ulocate: (asm, params, line) => {
        const mode = params[0] ?? 'building'
        const ore = asm.var(params[3] ?? '@copper')
        const [outX, outY, found, build] = [4, 5, 6, 7].map(i => asm.var(params[i] ?? 'result'))

        if (!LOCATES.has(mode)) {
            asm.report(Diagnostic.NOT_IMPLEMENTED, line, {instruction: `ulocate ${mode}`})
            return null
        }

        return {
            run: (vm) => {
                const unit = asm.var('@unit').obj()
                const target = ore.obj()

                if (!(unit instanceof Unit) || vm.world === null || target?.contentType !== 'item') {
                    found.setnum(0)
                    return
                }

                // Ближайшая руда: игра держит для этого указатель, у нас мир маленький
                let best = null
                let distance = Infinity

                for (let y = 0; y < vm.world.height; y++) {
                    for (let x = 0; x < vm.world.width; x++) {
                        const overlay = vm.world.overlayAt(x, y)
                        if (BLOCK_SPECS[overlay]?.itemDrop !== target.name) continue

                        const away = unit.dst2(unconv(x), unconv(y))
                        if (away >= distance) continue

                        distance = away
                        best = {x, y}
                    }
                }

                found.setnum(best === null ? 0 : 1)
                build.setobj(null)

                if (best !== null) {
                    outX.setnum(best.x)
                    outY.setnum(best.y)
                }
            }
        }
    },

    getlink: (asm, params) => {
        const output = asm.var(params[0] ?? 'result')
        const index = asm.var(params[1] ?? '0')

        return {
            run: (vm) => {
                const address = index.num() | 0
                output.setobj(address >= 0 && address < vm.links.length ? vm.links[address] : null)
            }
        }
    },

    lookup: (asm, params) => {
        const type = params[0] ?? 'block'
        const output = asm.var(params[1] ?? 'result')
        const index = asm.var(params[2] ?? '0')

        return {
            run: (vm) => output.setobj(vm.lookup(type, index.num() | 0))
        }
    },

    packcolor: (asm, params) => {
        const result = asm.var(params[0] ?? 'result')
        const channels = [1, 2, 3, 4].map(i => asm.var(params[i] ?? '0'))

        return {
            run: () => {
                // Каналы здесь в долях от нуля до единицы, а не 0-255 как в литерале %RRGGBB
                const [r, g, b, a] = channels.map(channel => channelByte(channel.num()))
                result.setnum(packColorBits(r, g, b, a))
            }
        }
    },

    unpackcolor: (asm, params) => {
        const outputs = [0, 1, 2, 3].map(i => asm.var(params[i] ?? 'result'))
        const value = asm.var(params[4] ?? '0')

        return {
            run: () => {
                const channels = unpackColorBits(value.num())
                outputs.forEach((output, index) => output.setnum(channels[index]))
            }
        }
    },

    select: (asm, params, line) => {
        const result = asm.var(params[0] ?? 'result')
        const name = params[1] ?? 'always'

        if (conditions[name] === undefined) {
            asm.report(Diagnostic.UNKNOWN_CONDITION, line, {condition: name})
            return null
        }

        const [compareA, compareB, whenTrue, whenFalse] =
            [2, 3, 4, 5].map(i => asm.var(params[i] ?? '0'))

        return {
            run: (vm) => {
                if (result.constant) return
                result.set(vm.test(name, compareA, compareB) ? whenTrue : whenFalse)
            }
        }
    },

    /**
     * WaitI хранит собственный счётчик времени, поэтому у инструкции есть состояние.
     * Ноль и меньше — просто уступить, не залипая на себе.
     */
    wait: (asm, params) => {
        const value = asm.var(params[0] ?? '0.5')
        let elapsed = 0

        return {
            run: (vm) => {
                const target = value.num()

                if (target <= 0) {
                    vm.yield = true
                    elapsed = 0
                } else if (elapsed >= target) {
                    elapsed = 0
                } else {
                    vm.counter.numval--
                    vm.yield = true
                    elapsed += vm.delta / 60
                }
            }
        }
    },

    end: () => ({run: (vm) => { vm.counter.numval = vm.instructions.length }}),

    // StopI отступает на шаг назад, чтобы застрять на себе же, и просит исполнителя уступить
    stop: () => ({run: (vm) => { vm.counter.numval--; vm.yield = true; vm.stopped = true }}),

    noop: () => ({run: () => { /* пустая инструкция */ }})
}

function strictEqualValue(a, b) {
    if (a.isobj !== b.isobj) return 0
    if (a.isobj) return a.objval === b.objval ? 1 : 0
    return a.numval === b.numval ? 1 : 0
}

/**
 * Собирает текст программы в инструкции.
 * Нераспознанное имя и неперенесённая инструкция дают диагностику и место в коде остаётся пустым:
 * молча пропускать нельзя, иначе ученик решит, что ошибся сам.
 */
export function assemble(text, options = {}) {
    const {statements, diagnostics} = parse(text)
    const asm = new Assembler(options)
    const instructions = []

    for (const statement of statements) {
        const builder = builders[statement.op]

        if (builder === undefined) {
            const code = KNOWN_INSTRUCTIONS.has(statement.op)
                ? Diagnostic.NOT_IMPLEMENTED
                : Diagnostic.UNKNOWN_INSTRUCTION

            asm.report(code, statement.line, {instruction: statement.op})
            instructions.push({op: statement.op, line: statement.line, run: () => { /* нет реализации */ }})
            continue
        }

        const built = builder(asm, statement.params, statement.line)

        instructions.push({
            op: statement.op,
            line: statement.line,
            run: built === null ? () => { /* нет реализации */ } : built.run
        })
    }

    return {
        instructions,
        vars: asm.vars,
        counter: asm.counter,
        diagnostics: [...diagnostics, ...asm.diagnostics]
    }
}

