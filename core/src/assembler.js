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
import {
    Unit, LogicAI, UNIT_SPECS, LOGIC_CONTROL_TIMEOUT, TRANSFER_DELAY, ITEM_TRANSFER_RANGE,
    CTRL_PROCESSOR, CTRL_PLAYER, CTRL_COMMAND, conv, unconv
} from './unit.js'
import {BLOCK_SPECS} from './world.js'
import {damage as explode} from './damage.js'
import {ALIGN_NAMES} from './font.js'
import accessData from '../data/access.json' with {type: 'json'}
import icons from '../data/icons.json' with {type: 'json'}

/**
 * Знаки контента: `printchar @copper` дописывает в буфер именно такой символ.
 * Снимает таблицу `tools/gen-icons.mjs` из `icons/icons.properties`.
 */
const CONTENT_ICONS = icons.content

// Разбор упакованного цвета нужен и снаружи: дисплей достаёт им байты из `draw col`
export {unpackColorBits}

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

/**
 * Свойства, которые читает только мировой процессор. Снято генератором из `LAccess`:
 * в v160 их четыре, и все про камеру.
 */
const PRIVILEGED_ACCESS = new Set(Object.entries(accessData.properties ?? accessData)
    .filter(([, property]) => property !== null && property.privileged === true)
    .map(([name]) => name))

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

    /*
     * Коды `@controlled`. В окне «Переменные» их нет — игра кладёт их простым `put`, без
     * записи в список, — но константы настоящие, и сравнивать с ними правильнее, чем
     * с числами. GlobalVars.java:24,94-96
     */
    constant('@ctrlProcessor', CTRL_PROCESSOR)
    constant('@ctrlPlayer', CTRL_PLAYER)
    constant('@ctrlCommand', CTRL_COMMAND)

    return globals
}

/**
 * Канал 0..1 в байт. `Color.rgba8888` умножает во float и **усекает**, а не округляет:
 * половина яркости даёт 127, а не 128.
 */
/**
 * Раскрывает экранирование в строковом литерале: перевод строки, кавычку, обратную косую
 * и `\u` с четырьмя цифрами. До v160 игра знала только первое. LAssembler.unescape
 */
export function unescape(text) {
    if (!text.includes('\\')) return text

    let out = ''

    for (let i = 0; i < text.length; i++) {
        const char = text[i]
        const next = text[i + 1]

        if (char === '\\' && next !== undefined) {
            if (next === 'n') {
                out += '\n'
                i++
                continue
            }

            if (next === '"' || next === '\\') {
                out += next
                i++
                continue
            }

            if (next === 'u' && i + 5 < text.length) {
                out += String.fromCharCode(parseInt(text.slice(i + 2, i + 6), 16))
                i += 5
                continue
            }
        }

        out += char
    }

    return out
}

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

/**
 * `LVar.team()`: объект-команда отдаёт свой номер, число — само себя, а всё остальное
 * не команда вовсе и даёт null. Инструкции мира на такой ответ просто ничего не делают.
 */
function teamOf(variable) {
    if (variable.isobj) {
        const object = variable.obj()
        return object !== null && object.teamId !== undefined ? object.teamId : null
    }

    const id = variable.numi()
    return id >= 0 && id < 256 ? id : null
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

        /*
         * Здание и юнит печатаются **типом**, а не именем: `print container1` даёт
         * `container`, а не имя связи. В игре это `build.block.name` и `unit.type.name`;
         * у нас у обоих тип лежит в `type`, а `name` — это имя связи, которого в игре
         * у здания нет вовсе. LExecutor.PrintI.toString
         */
        if (object.spec !== undefined && typeof object.type === 'string') return object.type

        if (object.name !== undefined) return object.name
        return '[object]'
    }

    // Порог 1e-5, тот же, что у bool(): близкое к целому печатается целым
    if (Math.abs(variable.numval - Math.round(variable.numval)) < 0.00001) {
        return String(Math.round(variable.numval))
    }

    return javaDoubleToString(variable.numval)
}

/**
 * Адрес для `read` и `write`: строка остаётся строкой, всё прочее становится целым числом.
 *
 * Кому что значит адрес, решает сам блок: у памяти это номер места, у процессора — имя
 * переменной. В игре `LReadable.read` получает переменную целиком и разбирается сам;
 * здесь до блока доходит уже её содержимое. LogicBlock.LogicBuild.read
 */
const readAddress = (position) => position.isobj && typeof position.objval === 'string'
    ? position.objval
    : position.numi()

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

        // @queries появляется только у процессора мира: LExecutor.load кладёт его
        // при `builder.privileged`. У обычного процессора это просто имя переменной
        this.putConst('@queries', null)
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

        /*
         * Ни обрезки пробелов, ни замены их на подчёркивание: с v160 значение приходит
         * из парсера готовым, а чистит его `LStatement.sanitize` при вводе руками.
         * LAssembler.var
         */
        const name = symbol

        if (name.length > 1 && name.startsWith('"') && name.endsWith('"')) {
            return this.putConst(`___${name}`, unescape(name.slice(1, -1)))
        }

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

    read: (asm, params) => {
        const output = asm.var(params[0] ?? 'result')
        const target = asm.var(params[1] ?? 'cell1')
        const position = asm.var(params[2] ?? '0')

        return {
            run: (vm) => {
                const object = target.obj()

                if (object !== null && typeof object.read === 'function') {
                    /*
                     * Читается не только память: процессор отдаёт переменную по имени, а любой
                     * `LReadable` сам решает, что значит адрес. Поэтому адрес идёт как есть —
                     * строкой или числом, — а не приведённым к целому. LExecutor.ReadI
                     *
                     * `undefined` в ответ означает «ничего не делать»: так процессор отказывает
                     * в копировании переменной в константу.
                     */
                    const stored = object.read(readAddress(position), vm, output)
                    if (stored === undefined) return
                    if (typeof stored === 'number') output.setnum(stored)
                    else output.setobj(stored ?? null)
                } else if (Array.isArray(object)) {
                    // Список: так читается @queries, который наполняет `query`
                    const index = position.num() | 0
                    output.setobj(index < 0 || index >= object.length ? null : object[index])
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
            run: (vm) => {
                const object = target.obj()
                if (object === null || typeof object.write !== 'function') return

                // Объект кладётся объектом, число числом — MemoryBlock.write различает их
                object.write(readAddress(position), value.isobj ? value.objval : value.numval, vm)
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
                /*
                 * У предмета, жидкости, блока и юнита есть свой знак: игра держит его
                 * в `icons/icons.properties` и рисует картинкой из атласа
                 * (`Fonts.registerIcon`). Всё прочее — команда, здание, строка, пустота —
                 * не `UnlockableContent`, и инструкция молча ничего не делает.
                 * LExecutor.PrintCharI, UnlockableContent.emojiChar
                 */
                if (value.isobj) {
                    const object = value.objval
                    if (object === null || object.contentType === undefined) return

                    const code = CONTENT_ICONS[object.name]
                    if (code !== undefined) vm.appendText(String.fromCharCode(code))
                    return
                }

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
            run: (vm) => {
                const object = target.obj()
                const name = propertyName(property)

                // Мёртвым считается и отсутствующий объект. SenseI
                if (object === null && name === 'dead') {
                    output.setnum(1)
                    return
                }

                /*
                 * Порядок проверок тот же, что в `SenseI`, и он важен: сначала «а есть ли
                 * кого спрашивать». У несуществующего объекта любой вопрос — и про свойство,
                 * и про предмет — отвечает пустотой, а не нулём. LExecutor.java:691-716
                 */
                if (object !== null && typeof object.sense === 'function') {
                    // Спрашивают не свойство, а контент: сколько в здании меди, что у юнита в руках
                    const content = property.obj()
                    if (name === null && content !== null && content.contentType !== undefined) {
                        // Правила нужны цене блока: в песочнице она ноль. Block.sense(Content)
                        output.setnum(object.senseContent?.(content, vm?.world?.rules) ?? 0)
                        return
                    }

                    const asObject = object.senseObject(name)
                    if (asObject !== NOT_SENSED) {
                        output.setobj(asObject)
                        return
                    }

                    /*
                     * Свойства камеры читает только мировой процессор: с v160 у `LAccess`
                     * есть признак `privileged`, и обычному `sensor` отвечает null.
                     */
                    if (PRIVILEGED_ACCESS.has(name) && !vm.privileged) {
                        output.setobj(null)
                        return
                    }

                    output.setnum(object.sense(name))
                    return
                }

                // Длину спрашивают и у того, что не Senseable: у строки и у списка запросов
                if (name === 'size' || name === 'bufferSize') {
                    if (typeof object === 'string') {
                        output.setnum(object.length)
                        return
                    }
                    if (Array.isArray(object)) {
                        output.setnum(object.length)
                        return
                    }
                }

                output.setobj(null)
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
     *
     * Две команды контролем не считаются и потому контроллер не заводят: `unbind`
     * отпускает юнита, а `within` только спрашивает. С v160 они работают и над чужим
     * юнитом — точнее, над тем, кем управляет не наш процессор. LExecutor.UnitControlI
     */
    ucontrol: (asm, params, line) => {
        const type = params[0] ?? 'move'
        const values = [1, 2, 3, 4, 5].map(i => asm.var(params[i] ?? '0'))
        const unitVar = asm.var('@unit')

        if (!UNIT_CONTROLS.has(type)) {
            asm.report(Diagnostic.NOT_IMPLEMENTED, line, {instruction: `ucontrol ${type}`})
            return null
        }

        // `unbind` и `within` не команды, а обращения: контроль они не берут
        const takesControl = type !== 'unbind' && type !== 'within'

        return {
            run: (vm) => {
                const unit = unitVar.obj()
                if (!(unit instanceof Unit) || unit.dead || unit.team !== vm.team) return
                if (!unit.spec.logicControllable) return

                // checkLogicAI: контроллер создаётся при первой команде и чистит старое занятие
                let ai = unit.controller instanceof LogicAI ? unit.controller : null

                if (takesControl) {
                    if (ai !== null) {
                        ai.controller = vm.building
                    } else {
                        ai = new LogicAI(vm.building)
                        unit.controller = ai
                        unit.mineTile = null
                        unit.clearBuilding()
                    }

                    ai.controlTimer = LOGIC_CONTROL_TIMEOUT
                }

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
                        // Сбрасывается только свой контроллер: чужой приказ не отменяется
                        if (unit.controller instanceof LogicAI) unit.resetController()
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

    /**
     * MakeMarkerI: заводит метку под своим номером. Без `replace` занятый номер не трогается,
     * поэтому программа может звать это каждый круг и не плодить меток.
     */
    makemarker: (asm, params) => {
        const type = params[0] ?? 'shape'
        const id = asm.var(params[1] ?? '0')
        const x = asm.var(params[2] ?? '0')
        const y = asm.var(params[3] ?? '0')
        const replace = asm.var(params[4] ?? 'true')

        return {
            run: (vm) => {
                if (!vm.privileged || vm.world === null) return
                vm.world.markers.add(id.numi(), type, x.num(), y.num(), replace.bool())
            }
        }
    },

    /**
     * SetMarkerI: правит метку. Свойство, которого этот вид не понимает, просто игнорируется —
     * радиус у подписи не меняется, и это не ошибка, а устройство `control`.
     *
     * `flushText` забирает текст из буфера процессора и чистит его, как `printflush`.
     */
    setmarker: (asm, params) => {
        const control = params[0] ?? 'pos'
        const id = asm.var(params[1] ?? '0')
        const values = [2, 3, 4].map(index => asm.var(params[index] ?? '0'))

        return {
            run: (vm) => {
                if (!vm.privileged || vm.world === null) return

                if (control === 'remove') return void vm.world.markers.remove(id.numi())

                const marker = vm.world.markers.get(id.numi())
                if (marker === null) return

                if (control === 'flushText') {
                    marker.setText(vm.textBuffer)
                    vm.textBuffer = ''
                    return
                }

                if (control === 'texture') {
                    if (values[0].bool()) {
                        marker.setTexture(vm.textBuffer)
                        vm.textBuffer = ''
                    } else {
                        marker.setTexture(values[1].obj())
                    }
                    return
                }

                // numOrNan: пустая переменная означает «не трогай это свойство»
                marker.control(control, values[0].numOrNan(), values[1].numOrNan(), values[2].numOrNan())
            }
        }
    },

    /**
     * ApplyEffectI: вешает эффект состояния на юнита или снимает его. Повторное наложение
     * не складывается, а продлевает: берётся большее из оставшегося и нового времени.
     */
    /*
     * ApplyEffectI. С v160 эффект приходит переменной, а не строкой: в поле пишут
     * `@status-burning`, и это такая же константа контента, как `@copper`. Оттого
     * и проверка другая — не «есть ли такой эффект в описи», а «объект ли это эффекта».
     */
    status: (asm, params) => {
        const clear = (params[0] ?? 'false') === 'true'
        const effect = asm.var(params[1] ?? '@status-wet')
        const target = asm.var(params[2] ?? '@unit')
        const duration = asm.var(params[3] ?? '10')

        return {
            run: (vm) => {
                if (!vm.privileged) return

                const unit = target.obj()
                const status = effect.obj()

                if (!(unit instanceof Unit)) return
                if (status === null || status.contentType !== 'status') return

                if (clear) unit.unapply(status.name)
                else unit.apply(status.name, duration.num() * 60)
            }
        }
    },

    /**
     * ExplosionI. Радиус ограничен сотней тайлов — это предел самой игры, а не наш.
     *
     * `pierce` меняет не силу, а способ: сплошной урон идёт по кругу и не глядя на преграды,
     * обычный — лучами из центра, которые гаснут о встреченные стены.
     */
    explosion: (asm, params) => {
        const team = asm.var(params[0] ?? '@crux')
        const x = asm.var(params[1] ?? '0')
        const y = asm.var(params[2] ?? '0')
        const radius = asm.var(params[3] ?? '5')
        const amount = asm.var(params[4] ?? '1')
        const air = asm.var(params[5] ?? 'true')
        const ground = asm.var(params[6] ?? 'true')
        const pierce = asm.var(params[7] ?? 'false')

        return {
            run: (vm) => {
                if (!vm.privileged || vm.world === null) return

                explode(vm.world, {
                    team: teamOf(team),
                    x: unconv(x.num()),
                    y: unconv(y.num()),
                    radius: unconv(Math.min(radius.num(), 100)),
                    amount: amount.num(),
                    complete: pierce.bool(),
                    air: air.bool(),
                    ground: ground.bool()
                })
            }
        }
    },

    /**
     * QueryI: всё, что попало в круг или прямоугольник, складывается в `@queries` — обычный
     * список, из которого потом читают по номеру инструкцией `read`. Пустая команда означает
     * «любая», а пули мы не моделируем.
     *
     * Координаты и размеры приходят в тайлах: `numfWorld` переводит их в мировые единицы.
     */
    query: (asm, params) => {
        const shape = params[0] ?? 'circle'
        const type = params[1] ?? 'unit'
        const team = asm.var(params[2] ?? 'null')
        const x = asm.var(params[3] ?? '0')
        const y = asm.var(params[4] ?? '0')
        const width = asm.var(params[5] ?? '10')
        const height = asm.var(params[6] ?? '10')

        const queries = asm.var('@queries')

        return {
            run: (vm) => {
                if (!vm.privileged || vm.world === null) return

                const results = Array.isArray(queries.obj()) ? queries.obj() : []
                results.length = 0
                queries.setconst(results)

                if (type === 'bullet') return

                const side = team.isobj && team.obj() === null ? null : teamOf(team)

                // Круг задаётся радиусом, прямоугольник — сторонами; и то и другое в тайлах
                const cx = unconv(x.num())
                const cy = unconv(y.num())
                const half = shape === 'circle'
                    ? [unconv(width.num()), unconv(width.num())]
                    : [unconv(width.num()) / 2, unconv(height.num()) / 2]

                const inside = (px, py) => shape === 'circle'
                    ? (px - cx) ** 2 + (py - cy) ** 2 <= half[0] ** 2
                    : Math.abs(px - cx) <= half[0] && Math.abs(py - cy) <= half[1]

                if (type === 'unit') {
                    for (const unit of vm.world.units) {
                        if (unit.dead || (side !== null && unit.team !== side)) continue
                        if (inside(unit.x, unit.y)) results.push(unit)
                    }
                    return
                }

                for (const building of vm.world.buildings) {
                    if (side !== null && building.team !== side) continue
                    if (inside(unconv(building.x + building.offset), unconv(building.y + building.offset))) {
                        results.push(building)
                    }
                }
            }
        }
    },

    /**
     * FlushMessageI: отдаёт накопленный текст миру. Тонкость, которую легко пропустить:
     * когда предыдущее сообщение ещё висит, буфер **не чистится** — программе дают
     * повторить попытку, а в переменную успеха кладётся ноль.
     */
    message: (asm, params) => {
        const type = params[0] ?? 'notify'
        const duration = asm.var(params[1] ?? '1')
        const success = asm.var(params[2] ?? 'result')

        return {
            run: (vm) => {
                if (!vm.privileged || vm.world === null) return

                success.setnum(1)

                // Миссия пишется в правила и никого не ждёт, остальные занимают экран
                if (type === 'mission') {
                    vm.world.rules.set('mission', vm.textBuffer)
                    vm.textBuffer = ''
                    return
                }

                if (vm.world.messageBusy(type)) return void success.setnum(0)

                vm.world.showMessage(type, vm.textBuffer, duration.num())
                vm.textBuffer = ''
            }
        }
    },

    /**
     * FetchI: перебор того, что есть у команды. Порядок — порядок появления, как в `TeamData`,
     * поэтому программа, которая ходит по индексу, видит устойчивый список.
     *
     * Игроков в песочнице нет вовсе, поэтому `player` и `playerCount` отвечают пусто и ноль —
     * так же, как в игре на карте без игроков.
     */
    fetch: (asm, params) => {
        const type = params[0] ?? 'unit'
        const output = asm.var(params[1] ?? 'result')
        const team = asm.var(params[2] ?? '@sharded')
        const index = asm.var(params[3] ?? '0')
        const extra = asm.var(params[4] ?? '@conveyor')

        return {
            run: (vm) => {
                const world = vm.world
                if (world === null) return

                const side = teamOf(team)
                if (side === null) return

                const at = index.numi()
                const filter = extra.obj()

                const units = () => world.units.filter(unit => unit.team === side && !unit.dead
                    && (filter?.contentType !== 'unit' || unit.type === filter.name))

                const builds = () => world.buildings.filter(building => building.team === side
                    && (filter?.contentType !== 'block' || building.type === filter.name))

                const cores = () => world.cores(side)

                const pick = (list) => output.setobj(at < 0 || at >= list.length ? null : list[at])

                switch (type) {
                    case 'unit': return pick(units())
                    case 'unitCount': return output.setnum(units().length)
                    case 'build': return pick(builds())
                    case 'buildCount': return output.setnum(builds().length)
                    case 'core': return pick(cores())
                    case 'coreCount': return output.setnum(cores().length)
                    case 'player': return output.setobj(null)
                    case 'playerCount': return output.setnum(0)
                }
            }
        }
    },

    /**
     * SetPropI: запись свойства напрямую, мимо всякой физики. Свойств меньше, чем читает
     * `sensor`: игра позволяет менять только то, что имеет смысл менять извне.
     */
    setprop: (asm, params) => {
        const property = asm.var(params[0] ?? '@copper')
        const target = asm.var(params[1] ?? 'block1')
        const value = asm.var(params[2] ?? '0')

        return {
            run: (vm) => {
                if (!vm.privileged) return

                const object = target.obj()
                if (object === null) return

                // Свойством может быть и контент: тогда это количество предмета в здании
                const content = property.obj()
                if (content !== null && content.contentType !== undefined) {
                    return void object.setContent?.(content, value.num())
                }

                const name = propertyName(property)
                if (name !== null) object.setProp?.(name, value)
            }
        }
    },

    /**
     * LocalePrintI: строка из словаря карты. Своего текста у ядра нет и быть не должно,
     * поэтому словарь приходит с миром: пустой — и печатать нечего, ровно как в игре
     * на карте без переводов.
     */
    localeprint: (asm, params) => {
        const key = asm.var(params[0] ?? '"name"')

        return {
            run: (vm) => {
                const name = key.obj()
                if (typeof name !== 'string') return

                const text = vm.world?.locales?.get(name)
                if (typeof text === 'string') vm.appendText(text)
            }
        }
    },

    /**
     * ClientDataI и SyncI шлют данные по сети. В одиночной игре слать некому — инструкции
     * не делают ничего, и это не заглушка, а поведение игры.
     */
    clientdata: () => ({run: () => { /* сети нет */ }}),

    /** GetFlagI: флаг это строка, и не-строка даёт пустой ответ, а не ложь. */
    getflag: (asm, params) => {
        const output = asm.var(params[0] ?? 'result')
        const flag = asm.var(params[1] ?? '"flag"')

        return {
            run: (vm) => {
                const name = flag.obj()

                if (typeof name !== 'string') return output.setobj(null)
                output.setbool(vm.world?.rules.flag(name) ?? false)
            }
        }
    },

    /**
     * SetFlagI. Флаги — общий язык процессора мира и **целей карты**: условие `FlagObjective`
     * проверяет ровно этот набор. Поэтому они живут в правилах мира, а не в процессоре.
     */
    setflag: (asm, params) => {
        const flag = asm.var(params[0] ?? '"flag"')
        const value = asm.var(params[1] ?? 'true')

        return {
            run: (vm) => {
                const name = flag.obj()
                if (typeof name !== 'string' || vm.world === null) return

                vm.world.rules.setFlag(name, value.bool())
            }
        }
    },

    /**
     * SetRuleI. Правила пишутся как есть: моделируем мы не все — волн и освещения у нас нет, —
     * но сохранить число честнее, чем потерять его. Секунды и тайлы переводятся в тики
     * и мировые единицы там же, где это делает игра.
     */
    setrule: (asm, params, line) => {
        const rule = params[0] ?? 'waveSpacing'
        const value = asm.var(params[1] ?? '0')
        const corners = [2, 3, 4, 5].map(index => asm.var(params[index] ?? '0'))

        if (rule === 'ban' || rule === 'unban') {
            return {
                run: (vm) => {
                    const content = value.obj()
                    if (content === null || vm.world === null) return

                    const key = `${content.contentType}:${content.name}`
                    if (rule === 'ban') vm.world.rules.banned.add(key)
                    else vm.world.rules.banned.delete(key)
                }
            }
        }

        if (rule === 'mapArea') {
            return {
                run: (vm) => {
                    if (vm.world === null) return
                    vm.world.rules.mapArea = corners.map(corner => corner.numi())
                }
            }
        }

        // Правила, у которых своя мера: секунды в тики, тайлы в мировые единицы
        const scales = {
            currentWaveTime: 60, waveSpacing: 60,
            enemyCoreBuildRadius: 8, dropZoneRadius: 8
        }

        const flags = new Set([
            'waveTimer', 'waves', 'waveSending', 'attackMode', 'lighting',
            'canGameOver', 'pauseDisabled'
        ])

        return {
            run: (vm) => {
                if (vm.world === null) return

                if (flags.has(rule)) return void vm.world.rules.set(rule, value.bool())
                if (rule === 'wave') return void vm.world.rules.set(rule, Math.max(value.numi(), 1))

                vm.world.rules.set(rule, value.num() * (scales[rule] ?? 1))
            }
        }
    },

    /** GetBlockI: слой тайла — пол, руда, блок или здание. */
    getblock: (asm, params) => {
        const layer = params[0] ?? 'block'
        const output = asm.var(params[1] ?? 'result')
        const x = asm.var(params[2] ?? '0')
        const y = asm.var(params[3] ?? '0')

        return {
            run: (vm) => {
                const world = vm.world
                const [tx, ty] = [Math.round(x.num()), Math.round(y.num())]

                if (world === null || !world.inside(tx, ty)) return output.setobj(null)

                const lookup = (name) => name === null ? null : vm.content?.find?.(name) ?? null

                switch (layer) {
                    case 'floor': return output.setobj(lookup(world.floorAt(tx, ty)))
                    case 'ore': return output.setobj(lookup(world.overlayAt(tx, ty) ?? 'air'))
                    case 'building': return output.setobj(world.at(tx, ty) ?? null)
                    default: return output.setobj(lookup(world.blockAt(tx, ty)))
                }
            }
        }
    },

    /**
     * SetBlockI. Слой `building` игра запрещает сама — здание так не поставить.
     * Пол ставится только полом, руда только наложением: иначе тайл превратился бы в кашу.
     */
    setblock: (asm, params) => {
        const layer = params[0] ?? 'block'
        const block = asm.var(params[1] ?? '@air')
        const x = asm.var(params[2] ?? '0')
        const y = asm.var(params[3] ?? '0')
        const team = asm.var(params[4] ?? '@sharded')
        const rotation = asm.var(params[5] ?? '0')

        return {
            run: (vm) => {
                if (!vm.privileged || vm.world === null) return

                /*
                 * Усечение, а не округление: в v160.2 `Mathf.round(x.numf())` заменили
                 * на `x.numi()`. У соседнего `getblock` осталось округление — с этой
                 * версии две инструкции считают координаты по-разному.
                 */
                const [tx, ty] = [x.numi(), y.numi()]
                const content = block.obj()

                if (!vm.world.inside(tx, ty) || content?.contentType !== 'block') return

                const kind = BLOCK_SPECS[content.name]?.kind

                if (layer === 'floor') {
                    if (kind === 'floor') vm.world.setFloor(tx, ty, content.name)
                    return
                }

                if (layer === 'ore') {
                    if (content.name === 'air') return void vm.world.setOverlay(tx, ty, null)
                    if (kind === 'ore' || kind === 'overlay') vm.world.setOverlay(tx, ty, content.name)
                    return
                }

                if (layer === 'block') vm.world.setBlock(tx, ty, content.name, {
                    team: teamOf(team) ?? 0,
                    rotation: Math.min(3, Math.max(0, rotation.numi()))
                })
            }
        }
    },

    /** SpawnUnitI: юнит появляется сразу и целиком, без завода и очереди. */
    spawn: (asm, params) => {
        const type = asm.var(params[0] ?? '@dagger')
        const x = asm.var(params[1] ?? '0')
        const y = asm.var(params[2] ?? '0')
        const rotation = asm.var(params[3] ?? '90')
        const team = asm.var(params[4] ?? '@sharded')
        const output = asm.var(params[5] ?? 'result')

        return {
            run: (vm) => {
                if (!vm.privileged || vm.world === null) return output.setobj(null)

                const content = type.obj()
                const spec = content === null ? undefined : UNIT_SPECS[content.name]

                if (content?.contentType !== 'unit' || spec === undefined || spec.internal) {
                    return output.setobj(null)
                }

                const side = teamOf(team)
                if (side === null) return output.setobj(null)

                output.setobj(vm.world.spawn(content.name, {
                    x: x.num(), y: y.num(), rotation: rotation.num(), team: side
                }))
            }
        }
    },

    /** SetRateI: скорость процессора, но не выше предела его блока. */
    /*
     * SetRateI. С v160 инструкция перестала быть привилегированной: её может исполнить
     * и обычный процессор, только предел у него свой — `instructionsPerTick` вместо
     * `maxInstructionsPerTick` у мирового.
     */
    setrate: (asm, params) => {
        const amount = asm.var(params[0] ?? '10')

        return {
            run: (vm) => {
                const spec = vm.building?.spec
                if (spec === undefined) return

                const limit = vm.privileged
                    ? spec.maxInstructionsPerTick ?? spec.ipt
                    : spec.ipt

                vm.ipt = Math.min(Math.max(amount.numi(), 1), limit)
                vm.bindEnvironment()
            }
        }
    },

    /**
     * SyncI: рассылает переменную клиентам. В одиночной игре рассылать некому, поэтому
     * инструкция ничего не делает — и в игре тоже.
     */
    sync: () => ({run: () => { /* сети нет */ }}),

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
/**
 * Инструкции, у которых есть перенос. Остальные из `KNOWN_INSTRUCTIONS` разбираются,
 * но ничего не делают — справочник помечает их, чтобы читатель не гадал, почему
 * в песочнице ничего не произошло.
 */
export const IMPLEMENTED_INSTRUCTIONS = new Set(Object.keys(builders))

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

