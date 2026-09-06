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

import specs from '../data/block-specs.json' with {type: 'json'}
import {Unit, unconv} from './unit.js'
import {NOT_SENSED} from './sense.js'
import {teamColorBits} from './teams.js'
import {Rules} from './rules.js'

export {NOT_SENSED}

/**
 * Спеки блоков: размер, здоровье, стоимость, дальность связи, скорость, объём памяти,
 * сторона дисплея — по всем 446 блокам игры.
 *
 * Снимаются дампом из запущенной игры (`tools/gen-dump.mjs`), уже после `Block.init()`.
 * Руками их писать нельзя: здоровье почти нигде не задано числом, а выводится из размера
 * и состава — `round(size * size * 40 * (1 + сумма healthScaling))`.
 */
export const BLOCK_SPECS = specs.blocks

/** MessageBlock.maxTextLength */
export const MAX_MESSAGE_LENGTH = 400

/** MessageBlock.maxNewlines: столько переносов строки переживёт правка руками. */
export const MAX_MESSAGE_NEWLINES = 24

/** LExecutor.maxDisplayBuffer */
export const MAX_DISPLAY_BUFFER = 1024

/** Door: логика переключает дверь не чаще раза в 80 тиков. Door.java:98 */
export const DOOR_TOGGLE_DELAY = 80

/** А рукой — не чаще раза в 60. У `tapped` свой порог, меньше. Door.java:149 */
export const DOOR_TAP_DELAY = 60

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

        // Хранилище есть не у всех: у процессора и сообщения его нет вовсе
        this.items = spec.hasItems ? new Map() : null

        // Каким здание было при постановке. Нужно перемотке: симуляция детерминированная,
        // поэтому «назад на N тиков» — это сброс и прогон вперёд, а не хранение истории
        this.initial = {health: this.health, enabled: this.enabled, efficiency: this.efficiency}
    }

    /** Сколько в здании этого предмета. BuildingComp.sense(Content) */
    senseContent(content) {
        if (this.items === null || content.contentType !== 'item') return NaN
        return this.items.get(content.name) ?? 0
    }

    /**
     * BuildingComp.setProp: правка свойства напрямую. Игра разрешает менять только здоровье,
     * команду и запас энергии — остальное здание считает само.
     */
    setProp(property, value) {
        if (property === 'health') {
            this.health = Math.min(Math.max(value.num(), 0), this.maxHealth)
            return this
        }

        if (property === 'team') {
            this.team = value.isobj ? value.obj()?.teamId ?? this.team : value.num() | 0
        }

        return this
    }

    /** `setprop` с контентом вместо свойства: столько-то предмета в здании. */
    setContent(content, amount) {
        if (this.items === null || content.contentType !== 'item') return this

        const target = Math.max(0, Math.trunc(amount))
        const now = this.items.get(content.name) ?? 0

        if (target > now) this.handleStack(content.name, this.acceptStack(content.name, target - now))
        else this.removeStack(content.name, now - target)

        return this
    }

    /** BuildingComp.getMaximumAccepted: у обычного блока это вместимость на каждый предмет. */
    maximumAccepted() {
        return this.spec.itemCapacity ?? 0
    }

    /**
     * `acceptStack`: сколько из предложенного поместится. Отдаёт число, а не берёт —
     * забирает потом `handleStack`, и это разные шаги: между ними игра успевает отказать.
     */
    acceptStack(item, amount) {
        if (this.items === null) return 0
        return Math.max(0, Math.min(this.maximumAccepted() - (this.items.get(item) ?? 0), amount))
    }

    handleStack(item, amount) {
        if (this.items === null || amount <= 0) return
        this.items.set(item, (this.items.get(item) ?? 0) + amount)
    }

    removeStack(item, amount) {
        if (this.items === null) return 0

        const taken = Math.min(this.items.get(item) ?? 0, amount)
        if (taken > 0) this.items.set(item, this.items.get(item) - taken)
        return taken
    }

    /** Возвращает здание в исходное состояние. Переопределяется там, где есть что чистить. */
    reset() {
        this.health = this.initial.health
        this.enabled = this.initial.enabled
        this.efficiency = this.initial.efficiency
        this.config = null
    }

    /**
     * Смещение центра. У блока с чётной стороной центр приходится на угол тайла, а не на его
     * середину, поэтому `sensor @x` у такого блока отдаёт половинную координату. Block.java:761
     */
    get offset() {
        return ((this.size + 1) % 2) * 0.5
    }

    /** С какого тайла начинается блок относительно своего. Block.java:762 */
    get sizeOffset() {
        return -Math.trunc((this.size - 1) / 2)
    }

    /** Общие свойства, Block.sense плюс базовая часть Building.sense. */
    sense(property) {
        switch (property) {
            case 'health': return this.health
            case 'maxHealth': return this.maxHealth
            // World.conv: координата в тайлах, у чётных блоков с половиной. BuildingComp:2101
            case 'x': return this.x + this.offset
            case 'y': return this.y + this.offset
            case 'size': return this.size
            case 'team': return this.team
            case 'enabled': return this.enabled ? 1 : 0
            case 'efficiency': return this.efficiency
            case 'dead': return this.health <= 0 ? 1 : 0
            case 'solid': return 0
            case 'itemCapacity': return this.items === null ? 0 : this.maximumAccepted()
            case 'totalItems': return this.items === null
                ? 0
                : [...this.items.values()].reduce((sum, value) => sum + value, 0)
            case 'rotation': return 0

            // Цвет здания — цвет его команды, с полной непрозрачностью. BuildingComp.sense
            case 'color': return teamColorBits(this.team)
            // Неизвестное свойство — именно NaN, а не ноль. Block.java:1671
            default: return NaN
        }
    }

    /** Свойства, отдающие объект. Всё прочее возвращает NOT_SENSED. */
    senseObject(property) {
        if (property === 'config') return this.config

        // Первый предмет — тот, что раньше положили и он ещё не кончился
        if (property === 'firstItem') {
            const found = [...(this.items ?? [])].find(([, amount]) => amount > 0)
            return found === undefined ? null : this.world.content?.find?.(found[0]) ?? null
        }

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

    reset() {
        super.reset()
        this.memory.fill(0)
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

    reset() {
        super.reset()
        this.message = ''
    }

    /** printflush просто копирует буфер: ни обрезки по краям, ни счёта переносов. */
    setMessage(text) {
        this.message = text.slice(0, MAX_MESSAGE_LENGTH)
    }

    /**
     * Правка руками идёт другим путём — через конфигурацию блока, а она строже:
     * пробелы по краям срезаются, а переносов остаётся не больше 24. MessageBlock.config
     */
    configureMessage(text) {
        if (text.length > MAX_MESSAGE_LENGTH) return

        let newlines = 0
        let result = ''

        for (const character of text.trim()) {
            if (character !== '\n') {
                result += character
                continue
            }

            // Счётчик увеличивается ДО проверки, поэтому переносов проходит ровно 24
            if (newlines++ <= MAX_MESSAGE_NEWLINES) result += '\n'
        }

        this.message = result
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

    /**
     * Рендер забирает накопленные команды и рисует их себе в буфер.
     *
     * В игре ровно так же: `processCommands` вычерпывает очередь при каждой отрисовке дисплея,
     * а картинка живёт в `FrameBuffer`, не в здании. Отсюда и `sensor bufferSize`, который почти
     * всегда ноль: команды не копятся, пока дисплей виден. Если рендера нет — например, тест
     * гоняется в ноде, — очередь копится до предела, как у дисплея за краем экрана.
     */
    take() {
        const commands = this.commands
        this.commands = []
        return commands
    }

    clear() {
        this.commands.length = 0
    }

    reset() {
        super.reset()
        this.commands = []
        this.operations = 0
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
        this.initial.open = this.open
    }

    reset() {
        super.reset()
        this.open = this.initial.open
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

    /**
     * Щелчок рукой. `Door.tapped` переключает дверь напрямую, и порог у него свой — 60 тиков
     * вместо 80. Открытую дверь, под которой стоят юниты, закрыть нельзя; юнитов у нас пока
     * нет, поэтому от той проверки остался только таймер.
     */
    tap() {
        if (this.world.tick - this.lastToggle < DOOR_TAP_DELAY) return false

        this.open = !this.open
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

/**
 * Короткое имя связи: `cell1`, `display1`, `container1`. `LogicBlock.getLinkName` берёт
 * последнюю часть имени блока через дефис, а если последняя это `large` или число —
 * то предпоследнюю. Так `memory-cell` становится `cell`, `large-logic-display` — `display`,
 * а `metal-floor-5` — `floor`.
 */
export function linkName(type) {
    if (!type.includes('-')) return type

    const parts = type.split('-')
    const last = parts[parts.length - 1]

    return parts.length >= 2 && (last === 'large' || Number.isFinite(Number(last)))
        ? parts[parts.length - 2]
        : last
}

export class World {
    /**
     * @param floor чем застелен мир изначально. Слоёв у тайла три, как в игре: пол,
     *              наложение (руда) и статичная стена — `Tile.floor`, `overlay`, `block`
     */
    constructor({width = 40, height = 40, content = null, floor = 'stone'} = {}) {
        this.width = width
        this.height = height
        this.content = content
        this.tick = 0
        this.buildings = []
        this.processors = []
        this.units = []
        this.linkCounters = new Map()
        this.nextUnitId = 0

        const size = width * height
        this.floors = new Array(size).fill(floor)
        this.overlays = new Array(size).fill(null)
        this.walls = new Array(size).fill(null)

        // Местность неподвижна, поэтому рендер её кеширует. Номер меняется — кеш протухает
        this.terrainVersion = 0

        // Правила и флаги целей: их читает и пишет процессор мира
        this.rules = new Rules()

        // Словарь карты: из него берёт строки `localeprint`. Пустой, пока карту не загрузили
        this.locales = new Map()

        // Сообщение на экране: `message` кладёт его сюда, а страница показывает
        this.message = null
    }

    inside(x, y) {
        return x >= 0 && y >= 0 && x < this.width && y < this.height
    }

    index(x, y) {
        return y * this.width + x
    }

    /** Пол тайла. За краем мира пола нет — там `null`, как `world.tile()` отдаёт null. */
    floorAt(x, y) {
        return this.inside(x, y) ? this.floors[this.index(x, y)] : null
    }

    /** Наложение: руда или декоративный слой поверх пола. */
    overlayAt(x, y) {
        return this.inside(x, y) ? this.overlays[this.index(x, y)] : null
    }

    /** Статичная стена — часть местности, а не постройка: её нельзя разрушить и настроить. */
    wallAt(x, y) {
        return this.inside(x, y) ? this.walls[this.index(x, y)] : null
    }

    setFloor(x, y, name) {
        if (!this.inside(x, y)) return this
        this.floors[this.index(x, y)] = name
        this.terrainVersion++
        return this
    }

    setOverlay(x, y, name) {
        if (!this.inside(x, y)) return this
        this.overlays[this.index(x, y)] = name
        this.terrainVersion++
        return this
    }

    setWall(x, y, name) {
        if (!this.inside(x, y)) return this
        this.walls[this.index(x, y)] = name
        this.terrainVersion++
        return this
    }

    /**
     * Что стоит на тайле с точки зрения `ucontrol getBlock`: постройка, статичная стена
     * или воздух. Пол сюда не входит — он спрашивается отдельно.
     */
    blockAt(x, y) {
        const building = this.at(x, y)
        if (building !== undefined) return building.type

        return this.wallAt(x, y) ?? 'air'
    }

    /**
     * Ставит блок на тайл, как это делает `setblock`: всё, что попало под след, сносится,
     * а `@air` просто расчищает место. Имя связи новое здание получает обычным порядком.
     */
    setBlock(x, y, type, {team = 1, rotation = 0} = {}) {
        if (!this.inside(x, y)) return null

        const spec = BLOCK_SPECS[type]
        const size = spec?.size ?? 1

        // След блока: у нечётных он вокруг тайла, у чётных — от него вправо и вверх
        const offset = size % 2 === 0 ? 0 : -Math.floor(size / 2)

        for (let dy = 0; dy < size; dy++) {
            for (let dx = 0; dx < size; dx++) {
                const found = this.at(x + offset + dx, y + offset + dy)
                if (found !== undefined) this.remove(found)
            }
        }

        this.terrainVersion++

        if (type === 'air' || spec === undefined) return null
        return this.add(type, {x, y, team, rotation})
    }

    /** Убирает здание из мира вместе с его процессором. */
    remove(building) {
        this.buildings = this.buildings.filter(item => item !== building)

        if (building.processor !== undefined) {
            this.processors = this.processors.filter(item => item !== building.processor)
        }

        this.terrainVersion++
        return this
    }

    /** Ставит здание и выдаёт ему имя связи по типу и порядку подключения. */
    add(type, options = {}) {
        const Kind = BUILDERS[type] ?? Building
        const building = new Kind(this, type, options)

        const prefix = linkName(type)
        const index = (this.linkCounters.get(prefix) ?? 0) + 1
        this.linkCounters.set(prefix, index)
        building.name = options.name ?? `${prefix}${index}`

        this.buildings.push(building)
        return building
    }

    get(name) {
        return this.buildings.find(building => building.name === name)
    }

    /**
     * Здание, занимающее тайл. Блок начинается не со своего тайла, а со сдвига `sizeOffset`:
     * у размера 2 это сам тайл и следующий, у размера 3 — по одному в каждую сторону.
     */
    at(x, y) {
        return this.buildings.find(building => {
            const fromX = building.x + building.sizeOffset
            const fromY = building.y + building.sizeOffset

            return x >= fromX && x < fromX + building.size
                && y >= fromY && y < fromY + building.size
        })
    }

    /**
     * Выпускает юнита. Координаты здесь тайловые, как везде наружу, а внутри юнит живёт
     * в мировых единицах: восемь на тайл.
     */
    spawn(type, {x = 0, y = 0, ...options} = {}) {
        const unit = new Unit(this, type, {...options, x: unconv(x), y: unconv(y), id: this.nextUnitId++})

        // Объект контента нужен, чтобы `sensor @unit @type` отдавал @poly, а не строку
        unit.content = this.content?.types?.unit?.find(item => item.name === type) ?? null

        this.units.push(unit)
        return unit
    }

    /**
     * Юниты команды одного типа, в порядке появления. Это и есть `team.data().unitCache(type)`,
     * по которому `ubind` ходит по кругу.
     */
    unitsOf(team, type) {
        return this.units.filter(unit => unit.team === team && unit.type === type && !unit.dead)
    }

    addProcessor(processor) {
        this.processors.push(processor)
        processor.world = this
        return processor
    }

    /**
     * Один игровой тик. Порядок из `Logic.updateEntities`: сначала юниты, потом здания
     * и процессоры. Из-за него команда `ucontrol`, отданная в этом тике, двигает юнита
     * только в следующем.
     */
    step(delta = 1) {
        this.tick += delta

        for (const unit of this.units) unit.update(delta)
        for (const building of this.buildings) building.update()
        for (const processor of this.processors) processor.tick(delta)

        return this.tick
    }

    /**
     * Возвращает мир и процессоры в исходное состояние.
     *
     * Перемотка назад делается через него: состояние на тике N — это сброс и N шагов вперёд.
     * Хранить историю не нужно, потому что симуляция детерминированная. Цена — то, что игрок
     * успел натыкать руками (тумблер, дверь), при перемотке не воспроизводится: это внешний
     * ввод, а не часть симуляции.
     */
    reset() {
        this.tick = 0
        this.message = null
        this.rules.reset()
        for (const unit of this.units) unit.reset()
        for (const building of this.buildings) building.reset()
        for (const processor of this.processors) processor.reset()
        return this
    }

    steps(count, delta = 1) {
        for (let i = 0; i < count; i++) this.step(delta)
        return this.tick
    }

    /**
     * Занят ли экран предыдущим сообщением. В игре объявление и всплывающая подсказка делят
     * одно место (`ui.hasAnnouncement`), а уведомление — своё, поэтому `notify` не мешает
     * `announce`. Пока место занято, `message` отказывает и буфер не чистит.
     */
    messageBusy(type) {
        if (this.message === null) return false
        if (this.tick - this.message.at >= this.message.duration * 60) return false

        const slot = (kind) => kind === 'notify' ? 'toast' : 'announcement'
        return slot(type) === slot(this.message.type)
    }

    /** Показывает сообщение: тип, текст и сколько секунд ему висеть. */
    showMessage(type, text, duration) {
        this.message = {type, text, duration, at: this.tick}
        return this
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
