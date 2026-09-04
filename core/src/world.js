/**
 * Модель мира: тайловая сетка и здания, которые процессор видит через sensor, control,
 * read, write, printflush и drawflush.
 *
 * Уровень детализации ограничен намеренно: моделируется ровно то, что видно из логики.
 * Предметы и энергия — числа в здании, физики конвейеров, энергосети и крафта нет.
 * См. PLAN.md, раздел «Песочница».
 *
 * Ядро ничего не знает про рендер: дисплей хранит список команд отрисовки, а не пиксели.
 * Проигрывает их canvas на стороне сайта.
 */

/** Sentinel из Senseable: свойство отдаёт число, а не объект. */
export const NOT_SENSED = Symbol('notSensed')

/** Размеры из content/Blocks.java. */
export const BLOCK_SPECS = {
    'memory-cell': {size: 1, memoryCapacity: 64, health: 130},
    'memory-bank': {size: 2, memoryCapacity: 512, health: 400},
    'logic-display': {size: 3, displaySize: 80, health: 300},
    'large-logic-display': {size: 6, displaySize: 176, health: 1200},
    'message': {size: 1, health: 20},
    'switch': {size: 1, health: 20},
    'door': {size: 1, health: 100},
    'micro-processor': {size: 1, health: 240, ipt: 2},
    'logic-processor': {size: 2, health: 640, ipt: 8},
    'hyper-processor': {size: 3, health: 960, ipt: 25}
}

/** MessageBlock.maxTextLength */
export const MAX_MESSAGE_LENGTH = 400

/** LExecutor.maxDisplayBuffer */
export const MAX_DISPLAY_BUFFER = 1024

/** Door.timerToggle: дверь не переключается чаще, чем раз в 80 тиков. */
export const DOOR_TOGGLE_DELAY = 80

/**
 * Здание. Разделение sense и senseObject повторяет Senseable: сначала спрашивают объект,
 * и только если его нет — число. Неизвестное свойство даёт NaN, а не ноль.
 */
export class Building {
    constructor(world, type, {x = 0, y = 0, team = 1, ...options} = {}) {
        const spec = BLOCK_SPECS[type] ?? {size: 1, health: 100}

        this.world = world
        this.type = type
        this.x = x
        this.y = y
        this.size = spec.size
        this.team = team
        this.maxHealth = spec.health ?? 100
        this.health = options.health ?? this.maxHealth
        this.enabled = options.enabled ?? true
        this.efficiency = options.efficiency ?? 1
        this.config = null
        this.spec = spec
    }

    /** Общие свойства, Block.sense плюс базовая часть Building.sense. */
    sense(property) {
        switch (property) {
            case 'health': return this.health
            case 'maxHealth': return this.maxHealth
            case 'x': return this.x
            case 'y': return this.y
            case 'size': return this.size
            case 'team': return this.team
            case 'enabled': return this.enabled ? 1 : 0
            case 'efficiency': return this.efficiency
            case 'dead': return this.health <= 0 ? 1 : 0
            case 'solid': return 0
            case 'totalItems': return 0
            case 'itemCapacity': return 0
            case 'rotation': return 0
            // Неизвестное свойство — именно NaN, а не ноль. Block.java:1671
            default: return NaN
        }
    }

    /** Свойства, отдающие объект. Всё прочее возвращает NOT_SENSED. */
    senseObject(property) {
        if (property === 'config') return this.config
        return NOT_SENSED
    }

    control(property, p1) {
        if (property === 'enabled') {
            this.enabled = truthy(p1)
            return true
        }
        if (property === 'config') {
            this.config = p1
            return true
        }
        return false
    }

    /** Вызывается миром каждый тик. Базовому зданию делать нечего. */
    update() { }
}

/** LVar.bool: порог 1e-5. Здесь он же, чтобы control вёл себя как в игре. */
const truthy = (value) => typeof value === 'number' ? Math.abs(value) >= 0.00001 : value !== null

/** Ячейка и банк памяти. Чтение за границами даёт NaN, а не ноль. MemoryBlock.java */
export class MemoryBuilding extends Building {
    constructor(world, type, options) {
        super(world, type, options)
        this.memory = new Float64Array(this.spec.memoryCapacity ?? 64)
    }

    sense(property) {
        if (property === 'memoryCapacity') return this.memory.length
        return super.sense(property)
    }

    read(address) {
        return address < 0 || address >= this.memory.length ? NaN : this.memory[address]
    }

    write(address, value) {
        if (address < 0 || address >= this.memory.length) return
        this.memory[address] = value
    }
}

/** Блок сообщений: хранит текст, отданный printflush. */
export class MessageBuilding extends Building {
    constructor(world, type, options) {
        super(world, type, options)
        this.message = ''
    }

    sense(property) {
        if (property === 'bufferSize') return this.message.length
        return super.sense(property)
    }

    setMessage(text) {
        this.message = text.slice(0, MAX_MESSAGE_LENGTH)
    }
}

/**
 * Дисплей. Хранит список команд отрисовки, а не картинку: ядро остаётся без рендера,
 * проверка урока читает команды, а canvas просто их проигрывает.
 */
export class DisplayBuilding extends Building {
    constructor(world, type, options) {
        super(world, type, options)
        this.commands = []
        this.operations = 0
    }

    sense(property) {
        switch (property) {
            case 'displayWidth':
            case 'displayHeight': return this.spec.displaySize
            case 'bufferSize': return this.commands.length
            case 'operations': return this.operations
            default: return super.sense(property)
        }
    }

    /** LogicDisplay.flushCommands: буфер не переполняется, счётчик операций растёт всегда. */
    flush(buffer) {
        const added = Math.min(buffer.length, MAX_DISPLAY_BUFFER - this.commands.length)
        for (let i = 0; i < added; i++) this.commands.push(buffer[i])
        this.operations++
    }

    clear() {
        this.commands.length = 0
    }
}

/** Тумблер: единственное, что он умеет — быть включённым. */
export class SwitchBuilding extends Building { }

/**
 * Дверь. Пример того, что control не обязан срабатывать сразу: у двери таймер,
 * и слишком частое переключение просто игнорируется. Door.java
 */
export class DoorBuilding extends Building {
    constructor(world, type, options) {
        super(world, type, options)
        this.open = options.open ?? false
        this.lastToggle = -Infinity
    }

    sense(property) {
        if (property === 'enabled') return this.open ? 1 : 0
        if (property === 'solid') return this.open ? 0 : 1
        return super.sense(property)
    }

    control(property, p1) {
        if (property !== 'enabled') return super.control(property, p1)

        const shouldOpen = truthy(p1)
        if (this.open === shouldOpen) return false
        if (this.world.tick - this.lastToggle < DOOR_TOGGLE_DELAY) return false

        this.open = shouldOpen
        this.lastToggle = this.world.tick
        return true
    }
}

const BUILDERS = {
    'memory-cell': MemoryBuilding,
    'memory-bank': MemoryBuilding,
    'logic-display': DisplayBuilding,
    'large-logic-display': DisplayBuilding,
    message: MessageBuilding,
    switch: SwitchBuilding,
    door: DoorBuilding
}

/** Короткие имена связей: cell1, display1 и так далее. */
const LINK_PREFIX = {
    'memory-cell': 'cell',
    'memory-bank': 'bank',
    'logic-display': 'display',
    'large-logic-display': 'display',
    message: 'message',
    switch: 'switch',
    door: 'door',
    'micro-processor': 'processor',
    'logic-processor': 'processor',
    'hyper-processor': 'processor'
}

export class World {
    constructor({width = 40, height = 40} = {}) {
        this.width = width
        this.height = height
        this.tick = 0
        this.buildings = []
        this.processors = []
        this.linkCounters = new Map()
    }

    /** Ставит здание и выдаёт ему имя связи по типу и порядку подключения. */
    add(type, options = {}) {
        const Kind = BUILDERS[type] ?? Building
        const building = new Kind(this, type, options)

        const prefix = LINK_PREFIX[type] ?? 'block'
        const index = (this.linkCounters.get(prefix) ?? 0) + 1
        this.linkCounters.set(prefix, index)
        building.name = options.name ?? `${prefix}${index}`

        this.buildings.push(building)
        return building
    }

    get(name) {
        return this.buildings.find(building => building.name === name)
    }

    /** Здание, занимающее тайл. Нужно для sensor по координатам и для будущего radar. */
    at(x, y) {
        return this.buildings.find(building => {
            const half = (building.size - 1) / 2
            return Math.abs(x - building.x) <= half && Math.abs(y - building.y) <= half
        })
    }

    addProcessor(processor) {
        this.processors.push(processor)
        processor.world = this
        return processor
    }

    /** Один игровой тик: сначала здания, потом процессоры. */
    step(delta = 1) {
        this.tick += delta

        for (const building of this.buildings) building.update()
        for (const processor of this.processors) processor.tick(delta)

        return this.tick
    }

    steps(count, delta = 1) {
        for (let i = 0; i < count; i++) this.step(delta)
        return this.tick
    }

    /** Значения времени, которые процессор отдаёт в @time и соседние константы. */
    get time() {
        return {
            tick: this.tick,
            time: this.tick / 60 * 1000,
            second: this.tick / 60,
            minute: this.tick / 3600
        }
    }
}
