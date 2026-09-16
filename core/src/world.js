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

import {BLOCK_SPECS} from './specs.js'
import {Unit, unconv} from './unit.js'
import {NOT_SENSED} from './sense.js'
import {edgeOffsets, facingEdge} from './edges.js'
import materials from '../data/materials.json' with {type: 'json'}
import {teamColorBits} from './teams.js'
import {Rules} from './rules.js'
import {Markers} from './markers.js'
import {Stats} from './stats.js'
import {Objectives} from './objectives.js'

export {NOT_SENSED}

/**
 * Спеки блоков: размер, здоровье, стоимость, дальность связи, скорость, объём памяти,
 * сторона дисплея — по всем 446 блокам игры.
 *
 * Снимаются дампом из запущенной игры (`tools/gen-dump.mjs`), уже после `Block.init()`.
 * Руками их писать нельзя: здоровье почти нигде не задано числом, а выводится из размера
 * и состава — `round(size * size * 40 * (1 + сумма healthScaling))`.
 */
export {BLOCK_SPECS}

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
/**
 * Заменяет ли один блок другой. `Block.canReplace`
 *
 * Ради этого правила в игре и держится `BlockGroup`: конвейер встаёт поверх конвейера
 * и маршрутизатора, стена поверх стены. Тот же блок сам себя заменяет только если его
 * можно быстро повернуть — так конвейер и разворачивают на углу, ставя его поверх себя.
 *
 * Наложенный конвейер (`StackConveyor`) из проверки выпал: его в модели нет вовсе.
 */
export function canReplace(type, other) {
    const spec = BLOCK_SPECS[type]
    const otherSpec = BLOCK_SPECS[other]

    if (spec === undefined || otherSpec === undefined) return false
    if (otherSpec.alwaysReplace === true) return true
    if (otherSpec.privileged === true) return false

    const same = other === type
    const rotatable = spec.rotate === true && spec.quickRotate === true

    const fits = spec.size === otherSpec.size
        || (spec.size >= otherSpec.size
            && ((spec.subclass !== undefined && spec.subclass === otherSpec.subclass)
                || spec.groupAnyReplace === true))

    return otherSpec.replaceable === true
        && (!same || rotatable)
        && ((spec.group !== 'none' && otherSpec.group === spec.group) || same)
        && fits
}

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
        /*
         * Полезность здания в этом такте: минимум по всем его потреблениям. Её считает
         * `updateConsumption` каждый тик, и от неё зависит скорость всего — бура, фабрики,
         * ленты. Единица здесь только до первого такта. BuildingComp.efficiency
         */
        this.efficiency = options.efficiency ?? 1

        /** Запрашивает ли здание энергию. `BuildingComp.shouldConsumePower` */
        this.shouldConsumePower = true


        // Поворот: у невращаемого блока он всё равно есть и всё равно ноль. BuildingComp
        this.rotation = spec.rotate === true ? (options.rotation ?? 0) : 0
        this.config = null
        this.spec = spec

        // Энергия: модуль есть только у блоков с энергией, граф ему выдаёт мир при постановке
        this.power = spec.hasPower === true && POWER !== null ? new POWER.Module() : null

        /*
         * Соседи и указатель раздачи. `BuildingComp.proximity` — здания вокруг блока
         * в порядке `Edges.getEdges`, `cdump` — на ком остановились в прошлый раз: предметы
         * раздаются по кругу, иначе первый же сосед забирал бы всё.
         */
        this.proximity = []
        this.cdump = 0

        /*
         * Таймеры блока, как `Interval` в игре: хранят время последнего срабатывания
         * и сравниваются с общим временем мира. Начинаются с минус бесконечности, потому
         * что в игре часы идут задолго до постройки и первая же проверка срабатывает.
         */
        this.timers = new Float64Array(TIMERS).fill(-Infinity)

        // Хранилище есть не у всех: у процессора и сообщения его нет вовсе
        this.items = spec.hasItems ? new Map() : null

        // Каким здание было при постановке. Нужно перемотке: симуляция детерминированная,
        // поэтому «назад на N тиков» — это сброс и прогон вперёд, а не хранение истории
        this.initial = {
            health: this.health, enabled: this.enabled,
            efficiency: this.efficiency, rotation: this.rotation
        }
    }

    /** Сколько в здании этого предмета. BuildingComp.sense(Content) */
    senseContent(content) {
        if (this.items === null || content.contentType !== 'item') return NaN
        return this.items.get(content.name) ?? 0
    }

    /**
     * BuildingComp.damage. Броня здесь **не** вычитается: её применяет тот, кто стреляет,
     * а взрыв бьёт напрямую. Правило `blockHealth` делит урон, а нулевое означает,
     * что здание рассыпается с одного попадания.
     */
    damage(amount) {
        if (this.health <= 0) return this

        const multiplier = this.world?.rules.teamRule(this.team, 'blockHealth') ?? 1
        this.health -= multiplier === 0 ? this.health + 1 : amount / multiplier

        if (this.health <= 0) this.destroy()
        return this
    }

    /** Разрушенное здание исчезает с карты вместе со своим процессором. */
    destroy() {
        this.health = 0

        // BlockDestroyEvent: своё здание считается штукой, чужое — по видам блока
        const stats = this.world?.stats
        if (stats !== undefined) {
            if (this.team === this.world.rules.defaultTeam) stats.buildingsDestroyed++
            else stats.destroyedBlockCount.increment(this.type)
        }

        this.world?.remove?.(this)
        return this
    }

    /**
     * BuildingComp.setProp: правка свойства напрямую. Игра разрешает менять только здоровье,
     * команду и запас энергии — остальное здание считает само.
     */
    setProp(property, value) {
        if (property === 'health') {
            this.health = Math.min(Math.max(value.num(), 0), this.maxHealth)

            // Ноль здоровья — это снос: `Call.buildDestroyed`
            if (this.health <= 0) this.destroy()
            return this
        }

        // Запас энергии пишется только буферу: `consPower.buffered`
        if (property === 'totalPower') {
            const consume = (this.spec.consumes ?? []).find(entry => entry.kind === 'power')
            if (this.power !== null && consume?.buffered === true && consume.capacity > 0) {
                this.power.status = Math.min(Math.max(value.num() / consume.capacity, 0), 1)
            }
            return this
        }

        if (property === 'team') {
            // Team.get((int)value): номер берётся по модулю 256, как байт
            this.team = value.isobj ? value.obj()?.teamId ?? this.team : value.numi() & 0xff
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

    /**
     * `BuildingComp.isValid`: здание цело и всё ещё стоит на своей клетке. Снесённое
     * или заменённое остаётся объектом в переменных программ, но действовать уже не может.
     */
    isValid() {
        if (this.health <= 0) return false
        return this.world?.at === undefined || this.world.at(this.x, this.y) === this
    }

    /**
     * `readable(exec)`: читать и писать логикой можно целое здание своей команды и не
     * привилегированное; мировому процессору — любое. Так спрашивают процессор и ячейка памяти.
     *
     * Без читателя (прямой вызов из движка или из теста) ограничений нет: в игре читателем
     * всегда выступает исполнитель инструкции, а внутренние обращения проверять не у кого.
     */
    opensTo(other) {
        if (other === null || other === undefined) return true
        if (!this.isValid()) return false
        if (other.privileged === true) return true

        return !this.spec.privileged && this.team === other.team
    }

    /** Возвращает здание в исходное состояние. Переопределяется там, где есть что чистить. */
    reset() {
        this.health = this.initial.health
        this.enabled = this.initial.enabled
        this.efficiency = this.initial.efficiency
        if (this.power !== null) this.power.status = 0
        this.rotation = this.initial.rotation
        this.config = null
        this.cdump = 0
        this.timers.fill(-Infinity)
        this.items?.clear()

        // Запас, положенный картой до первого тика, возвращается: его перемотка не отменяет
        for (const [item, amount] of this.initial.items ?? []) this.items?.set(item, amount)
    }

    /** Запоминает запас как исходный. Мир зовёт это, когда снимает основу перемотки. */
    captureInitial() {
        this.initial.items = this.items === null ? null : new Map(this.items)
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

    /**
     * Соседи пересчитаны. `BuildingComp.onProximityUpdate` — у большинства блоков пусто,
     * а конвейер по нему выбирает, каким куском ленты нарисоваться.
     */
    onProximityUpdate() {}

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

            /*
             * Энергия сети, а не блока: все четыре свойства спрашивают граф, к которому
             * здание подключено. Приход и расход в игре переводятся в секунды — отсюда
             * умножение на 60, — а запас и вместимость отдаются как есть. BuildingComp:2119
             */
            case 'powerCapacity': {
                const consume = (this.spec.consumes ?? []).find(entry => entry.kind === 'power')
                return consume === undefined ? 0 : consume.capacity
            }
            case 'powerNetIn': return this.power === null ? 0 : this.power.graph.lastScaledPowerIn * 60
            case 'powerNetOut': return this.power === null ? 0 : this.power.graph.lastScaledPowerOut * 60
            case 'powerNetStored': return this.power === null ? 0 : this.power.graph.lastPowerStored
            case 'powerNetCapacity': return this.power === null ? 0 : this.power.graph.lastCapacity
            case 'efficiency': return this.efficiency
            // Снесённое и заменённое тоже мертво: `!isValid()`
            case 'dead': return this.isValid() ? 0 : 1
            // BuildingComp: block.solid || checkSolid(). Дверь считает по-своему, см. ниже
            case 'solid': return this.spec.solid === true ? 1 : 0
            // Из блока, а не из `getMaximumAccepted`: `block.hasItems ? block.itemCapacity : 0`
            case 'itemCapacity': return this.spec.hasItems === true ? this.spec.itemCapacity ?? 0 : 0
            case 'liquidCapacity': return this.spec.hasLiquids === true ? this.spec.liquidCapacity ?? 0 : 0

            // Жидкостей в модели нет, поэтому и в здании их ноль
            case 'totalLiquids': return 0

            /*
             * Заряд: у буфера — доля, умноженная на ёмкость, у обычного потребителя — сама доля
             * удовлетворённого запроса. `power.status * (buffered ? capacity : 1)`
             */
            case 'totalPower': {
                const consume = (this.spec.consumes ?? []).find(entry => entry.kind === 'power')
                if (this.power === null || consume === undefined) return 0
                return this.power.status * (consume.buffered === true ? consume.capacity : 1)
            }

            case 'armor': return this.spec.armor ?? 0

            // Ускорителей в модели нет: время здания идёт как у всех
            case 'timescale': return 1

            /*
             * Дальность есть только у `Ranged`: турелей и логических процессоров — у них она
             * в выгрузке. Прочим игра отвечает нулём, а не пустотой.
             */
            case 'range': return this.spec.range === undefined ? 0 : this.spec.range / 8

            // Игроков, грузов и управляемых блоков в модели нет: ответ игры для прочих зданий
            case 'controlled':
            case 'payloadCount':
            case 'cameraX':
            case 'cameraY':
            case 'cameraWidth':
            case 'cameraHeight': return 0

            case 'totalItems': return this.items === null
                ? 0
                : [...this.items.values()].reduce((sum, value) => sum + value, 0)
            case 'rotation': return this.rotation

            // Цвет здания — цвет его команды, с полной непрозрачностью. BuildingComp.sense
            case 'color': return teamColorBits(this.team)
            // Неизвестное свойство — именно NaN, а не ноль. Block.java:1671
            default: return NaN
        }
    }

    /** Свойства, отдающие объект. Всё прочее возвращает NOT_SENSED. */
    senseObject(property) {
        // Тип здания — объект контента, тот же, что константа `@container`. BuildingComp:2137
        if (property === 'type') return this.world?.content?.find?.(this.type) ?? null

        /*
         * Настройка отдаётся не всякая: `configSenseable()` поднят только у блоков,
         * которые настраиваются контентом — предметом, жидкостью, типом юнита.
         * У остальных `@config` это пустота. BuildingComp:2140
         */
        if (property === 'config') {
            if (this.spec.configSenseable !== true) return null

            // Настроенный предмет хранится именем, а логике отдаётся объектом контента
            const value = this.configItem ?? null
            return typeof value === 'string' ? this.world?.content?.find?.(value) ?? null : value
        }

        // Первый предмет — тот, что раньше положили и он ещё не кончился
        if (property === 'firstItem') {
            const found = [...(this.items ?? [])].find(([, amount]) => amount > 0)
            return found === undefined ? null : this.world.content?.find?.(found[0]) ?? null
        }

        return NOT_SENSED
    }

    /**
     * Настройка блока: предмет у сортировщика, тип юнита у завода.
     *
     * У большинства зданий её нет, и поле пустует; те, у кого настройка есть, подменяют
     * эти две строки своим полем — `configItem` у сортировщика и источника предметов.
     */
    get configItem() {
        return this.config
    }

    set configItem(value) {
        this.config = value
    }

    control(property, p1) {
        if (property === 'enabled') {
            this.enabled = truthy(p1)
            return true
        }

        /*
         * `control config` меняет настройку только у блоков, которые игра считает
         * настраиваемыми логикой (`logicConfigurable` — есть настройка контентом),
         * и только объектом: число не настраивает ничего. BuildingComp:2165-2171
         */
        if (property === 'config') {
            if (this.spec.logicConfigurable !== true) return false
            if (typeof p1 !== 'object' || p1 === null) return false

            this.configItem = p1
            return true
        }

        return false
    }

    /** Вызывается миром каждый тик. Базовому зданию делать нечего. */
    /**
     * Такт здания. Заготовка пустая: работают только те блоки, которым есть что делать,
     * и каждый делает это в своём классе — как в игре, где `updateTile` переопределяют.
     */
    update() { }

    /**
     * Сработал ли таймер. `Interval.get`: время у мира одно на всех, у здания хранится
     * только отметка последнего срабатывания. Поэтому таймер не копит дельту и не врёт
     * при рывках кадра. Interval.java:20-30
     */
    timer(id, period) {
        const now = this.world?.tick ?? 0
        const last = this.timers[id]

        if (now - last < period && now >= last) return false

        this.timers[id] = now
        return true
    }

    /** Сосед по стороне света: ноль вправо, единица вверх. `BuildingComp.nearby` */
    nearby(direction) {
        const step = D4[direction]
        return step === undefined ? null : this.world.at(this.x + step.x, this.y + step.y) ?? null
    }

    /**
     * В какую сторону от нас лежит клетка. `Tile.absoluteRelativeTo`
     *
     * Ось выбирается по большему смещению, и потому у блока по диагонали стороны нет вовсе —
     * ответ минус один. У блока с чётной стороной центр смещён на полклетки, и сравнение
     * идёт с этой поправкой.
     */
    relativeTo(cx, cy) {
        const shift = this.size % 2 === 1 ? 0 : 0.5

        if (Math.abs(this.x - cx + shift) > Math.abs(this.y - cy + shift)) {
            if (this.x + shift <= cx - 1) return 0
            if (this.x + shift >= cx + 1) return 2
        } else {
            if (this.y + shift <= cy - 1) return 1
            if (this.y + shift >= cy + 1) return 3
        }

        return -1
    }

    /**
     * То же, но до ближнего края блока, а не до его начала. `BuildingComp.relativeToEdge`:
     * у склада три на три сторона считается от той клетки, что смотрит на нас.
     */
    relativeToEdge(other) {
        const edge = facingEdge(other, this.x, this.y)
        return edge === null ? -1 : this.relativeTo(edge.x, edge.y)
    }

    /**
     * С кем здание соединено по энергии. `BuildingComp.getPowerConnections`
     *
     * Соседство по стороне проводит ток само по себе, но не между двумя потребителями:
     * две фабрики рядом энергией не делятся, и это правило записано прямо в условии.
     * Связи мачт добавляются сверх соседства.
     */
    getPowerConnections() {
        if (this.power === null) return []

        const out = []

        for (const other of this.proximity) {
            if (other.power === null || other.team !== this.team) continue

            const bothConsume = this.spec.consumesPower === true && other.spec.consumesPower === true
                && this.spec.outputsPower !== true && other.spec.outputsPower !== true
                && this.spec.conductivePower !== true && other.spec.conductivePower !== true

            if (bothConsume) continue
            if (this.spec.insulated === true || other.spec.insulated === true) continue
            if (this.power.links.includes(other)) continue

            out.push(other)
        }

        for (const link of this.power.links) {
            if (link.team === this.team) out.push(link)
        }

        return out
    }

    /** Слить графы соседей в свой. `BuildingComp.updatePowerGraph` */
    updatePowerGraph() {
        if (this.power === null) return

        for (const other of this.getPowerConnections()) {
            other.power.graph.addGraph(this.power.graph)
        }
    }

    /** Снос: граф разрезается, а связи мачт снимаются с обеих сторон. */
    powerGraphRemoved() {
        if (this.power === null) return

        this.power.graph.remove(this)

        for (const other of this.power.links) {
            if (other.power === null) continue
            other.power.links = other.power.links.filter(link => link !== this)
        }

        this.power.links = []
    }

    /**
     * Мощность генератора за тик. У обычного здания её нет вовсе.
     * `BuildingComp.getPowerProduction`
     */
    powerProduction() {
        return 0
    }

    /**
     * Полезность здания в этом такте. `BuildingComp.updateConsumption`
     *
     * Считается как минимум по всем обязательным потреблениям: нет сырья — ноль, энергии
     * половина — половина. Выключенное здание не работает вовсе, а блок без потреблений
     * работает всегда — потому лента и не зависит ни от чего.
     */
    updateConsumption() {
        const consumes = (this.spec.consumes ?? []).filter(consume => consume.optional !== true
            && consume.boost !== true && consume.kind !== 'itemExplode')

        if (consumes.length === 0) {
            this.efficiency = this.enabled === false ? 0 : 1
            this.shouldConsumePower = true
            return
        }

        if (this.enabled === false) {
            this.efficiency = 0
            this.shouldConsumePower = false
            return
        }

        const update = this.shouldConsume()
        let minimum = 1

        this.shouldConsumePower = true

        for (const consume of consumes) {
            const result = this.consumeEfficiency(consume)

            // Блок без сырья не запрашивает и энергию: иначе он тянул бы её впустую
            if (consume.kind !== 'power' && result <= 0.0000001) this.shouldConsumePower = false

            minimum = Math.min(minimum, result)
        }

        this.efficiency = update ? minimum : 0
    }

    /** Полезность одного потребления. `Consume.efficiency` у каждого своя. */
    consumeEfficiency(consume) {
        if (consume.kind === 'power') {
            // Буфер работает от своего запаса, а обычный потребитель — от покрытия сети
            return this.power === null ? 0 : this.power.status
        }

        if (consume.kind === 'items') {
            return consume.items.every(stack => (this.items?.get(stack.item) ?? 0) >= stack.amount) ? 1 : 0
        }

        if (consume.kind === 'itemFilter') {
            // `ConsumeItemFilter.efficiency`: годится всё, что подходит фильтру
            if (this.consumeTriggerValid?.()) return 1
            return consume.items.some(item => (this.items?.get(item) ?? 0) > 0) ? 1 : 0
        }

        // Жидкостей в модели нет: блок, которому нужна вода, работать не будет
        return 0
    }

    /** Стоит ли работать вообще. У фабрики переопределено: некуда девать — не работает. */
    shouldConsume() {
        return true
    }

    /** `BuildingComp.acceptItem`: берут только то, что потребляют, и только до вместимости. */
    acceptItem(source, item) {
        return this.consumesItem(item) && (this.items?.get(item) ?? 0) < this.maximumAccepted(item)
    }

    /** `Block.consumesItem`: фильтр предметов собирается из потребления блока. */
    consumesItem(item) {
        return (this.spec.consumes ?? []).some(consume => consume.kind === 'items'
            && consume.items.some(stack => stack.item === item))
    }

    handleItem(source, item) {
        this.handleStack(item, 1)
    }

    /** `BuildingComp.canDump`: у обычного блока запретов нет, у сортировщика и моста есть. */
    canDump() {
        return true
    }

    incrementDump(size) {
        this.cdump = (this.cdump + 1) % size
    }

    /**
     * Отдать один предмет соседу. `BuildingComp.dump`: обход соседей по кругу от `cdump`,
     * у каждого перебор предметов в порядке описи игры. Без предмета отдаётся первый, какой
     * возьмут.
     */
    dump(item = null) {
        if (this.items === null || this.proximity.length === 0) return false
        if (item !== null && (this.items.get(item) ?? 0) <= 0) return false

        const total = [...this.items.values()].reduce((sum, value) => sum + value, 0)
        if (total === 0) return false

        const start = this.cdump
        const size = this.proximity.length

        for (let i = 0; i < size; i++) {
            const other = this.proximity[(i + start) % size]

            for (const name of item === null ? ITEM_ORDER : [item]) {
                if ((this.items.get(name) ?? 0) <= 0) continue

                if (other.acceptItem(this, name) && this.canDump(other, name)) {
                    other.handleItem(this, name)
                    this.removeStack(name, 1)
                    this.incrementDump(size)
                    return true
                }
            }

            this.incrementDump(size)
        }

        return false
    }

    /**
     * Отдать соседу только что произведённое, а если никто не берёт — оставить себе.
     * `BuildingComp.offload`. Отличие от `dump` не только в этом: указатель здесь двигается
     * до проверки, а не после.
     */
    offload(item) {
        const size = this.proximity.length
        const start = this.cdump

        for (let i = 0; i < size; i++) {
            this.incrementDump(size)
            const other = this.proximity[(i + start) % size]

            if (other.acceptItem(this, item) && this.canDump(other, item)) {
                other.handleItem(this, item)
                return
            }
        }

        this.handleItem(this, item)
    }
}

/**
 * Части энергосети. Их приносит `power.js` тем же способом, каким блоки приносят свои
 * классы: иначе `world.js` и `power.js` импортировали бы друг друга по кругу.
 */
let POWER = null

export function registerPower(parts) {
    POWER = parts
}

/** Смещения по сторонам света: `Geometry.d4`, где ноль это вправо. */
const D4 = [{x: 1, y: 0}, {x: 0, y: 1}, {x: -1, y: 0}, {x: 0, y: -1}]

/** Сколько таймеров держит здание. В игре их у каждого блока свой набор, у нас общий. */
const TIMERS = 4

/** Номера таймеров: раздача содержимого соседям — `BuildingComp.timerDump`. */
export const TIMER_DUMP = 0

/**
 * Предметы в порядке описи игры: по нему `dump` перебирает содержимое, и от него зависит,
 * что уедет соседу первым.
 */
export const ITEM_ORDER = Object.entries(materials.items)
    .sort(([, first], [, second]) => first.id - second.id)
    .map(([name]) => name)

/** LVar.bool: порог 1e-5. Здесь он же, чтобы control вёл себя как в игре. */
const truthy = (value) => typeof value === 'number' ? Math.abs(value) >= 0.00001 : value !== null

/**
 * Ячейка и банк памяти. MemoryBlock.java
 *
 * Хранит не только числа: `write` кладёт объект как объект (`objectMemory`), а число как
 * число (`numberMemory`), и `read` отдаёт обратно то же самое. В игре это два массива
 * и метка `sentinel`, потому что в Java они разных типов; в JS хватает одного массива.
 *
 * Чтение за границей даёт **пустое значение, а не ноль** — в `MemoryBlock.read` это
 * написано отдельным комментарием.
 */
export class MemoryBuilding extends Building {
    constructor(world, type, options = {}) {
        super(world, type, options)

        this.memory = new Array(this.spec.memoryCapacity ?? 64).fill(0)

        // Карта может прийти с заполненной ячейкой: её содержимое лежит в сохранении
        const preset = options.memory ?? []
        for (let address = 0; address < preset.length && address < this.memory.length; address++) {
            this.memory[address] = preset[address]
        }

        this.preset = preset
    }

    sense(property) {
        if (property === 'memoryCapacity') return this.memory.length
        return super.sense(property)
    }

    reset() {
        super.reset()
        this.memory.fill(0)
        for (let address = 0; address < this.preset.length && address < this.memory.length; address++) {
            this.memory[address] = this.preset[address]
        }
    }

    /*
     * Адрес у ячейки — всегда `position.numi()`. Строка в игре — непустой объект, и её
     * `numi()` равен единице: `read x cell1 "abc"` читает место 1, а не пустоту.
     *
     * Читать и писать может только своя команда и только не в привилегированную ячейку;
     * мировому процессору можно всё. Чужому `read` отвечает пустотой, `write` молчит.
     * MemoryBuild.readable, writable
     */
    read(address, reader = null) {
        if (!this.opensTo(reader)) return null

        const at = typeof address === 'number' ? address : 1
        return at < 0 || at >= this.memory.length ? null : this.memory[at]
    }

    write(address, value, writer = null) {
        if (!this.opensTo(writer)) return

        const at = typeof address === 'number' ? address : 1
        if (at < 0 || at >= this.memory.length) return
        this.memory[at] = value
    }
}

/**
 * Логический процессор как блок. LogicBlock.LogicBuild
 *
 * Он тоже читается и пишется — и это не память, а его собственные переменные:
 *
 *  - адрес строкой — имя переменной у соседа. Нет такой переменной — отдаётся его **связь**
 *    с этим именем (`optionalLink`), и потому `read блок процессор1 "cell1"` достаёт ячейку,
 *    подключённую к соседу, а не к нам;
 *  - адрес числом — связь соседа по номеру, как `getlink` у него самого;
 *  - запись работает только по имени и только по существующей непостоянной переменной:
 *    завести соседу новую нельзя, испортить константу — тоже.
 *
 * Кому отвечать, решает `readable(exec)`: блок должен быть цел, а читатель — либо
 * привилегированным, либо своей команды и не через привилегированный блок. Запись
 * спрашивает ровно то же самое (`writable`).
 */
export class LogicBuilding extends Building {
    read(address, reader = null, output = null) {
        const processor = this.processor
        if (processor === undefined || processor === null) return null
        if (!this.opensTo(reader)) return null

        if (typeof address === 'string') {
            const variable = processor.get(address)
            if (variable === undefined) return this.linkNamed(address)

            // Копировать переменную в константу нельзя, а связь по имени положить можно
            if (output !== null && output.constant) return undefined

            return variable.isobj ? variable.objval : variable.numval
        }

        return processor.links[address] ?? null
    }

    write(address, value, writer = null) {
        if (typeof address !== 'string') return

        const processor = this.processor
        if (processor === undefined || processor === null) return
        if (!this.opensTo(writer)) return

        const variable = processor.get(address)
        if (variable === undefined || variable.constant) return

        if (typeof value === 'number') variable.setnum(value)
        else variable.setobj(value)
    }

    /**
     * Связь по её имени. В игре перед поиском стоит быстрая проверка: имя связи всегда
     * кончается цифрой, и без неё в карту связей лезть незачем. `optionalLink`
     */
    linkNamed(name) {
        if (name.length === 0) return null

        const last = name[name.length - 1]
        if (last < '0' || last > '9') return null

        return this.processor.links.find(building => building.name === name) ?? null
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

/**
 * Склад: контейнер, хранилище, ядро. `StorageBlock.acceptItem` не смотрит на фильтр
 * потребления — берёт что угодно, пока есть место. Этим склад и отличается от фабрики,
 * которая примет только своё сырьё.
 */
export class StorageBuilding extends Building {
    acceptItem(source, item) {
        return (this.items?.get(item) ?? 0) < this.maximumAccepted(item)
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

/**
 * Какой класс отвечает за блок.
 *
 * Ключ — класс блока в самой игре (`javaClasses` из выгрузки), а не имя блока: в игре
 * поведение задаёт класс, и памяти всё равно, ячейка она или банк. Список по именам пришлось
 * бы дописывать на каждый новый блок, а так `StorageBlock` разом накрывает контейнер,
 * хранилище и оба усиленных.
 */
const BUILDERS = {
    LogicBlock: LogicBuilding,
    MemoryBlock: MemoryBuilding,
    LogicDisplay: DisplayBuilding,
    MessageBlock: MessageBuilding,
    SwitchBlock: SwitchBuilding,
    Door: DoorBuilding,
    StorageBlock: StorageBuilding
}

/** Первый подходящий класс из цепочки наследования: от своего к общему. */
export function builderFor(type) {
    for (const name of BLOCK_SPECS[type]?.javaClasses ?? []) {
        const found = BUILDERS[name] ?? EXTRA_BUILDERS[name]
        if (found !== undefined) return found
    }

    return Building
}

/**
 * Классы, которые живут в других файлах: производство завело бы в `world.js` рецепты
 * и руду, а этому файлу и так есть чем заняться. Заполняется при загрузке `production.js`.
 */
const EXTRA_BUILDERS = {}

export function registerBuilders(entries) {
    Object.assign(EXTRA_BUILDERS, entries)
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

        /*
         * Пули в полёте. Живут они недолго и считаются отдельным списком, а не через здания:
         * стреляет турель, а летит пуля сама по себе — как `Bullet` в игре.
         */
        this.bullets = []
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

        /*
         * Погода: набор имён, которые сейчас идут. В игре это живые объекты со временем
         * жизни и частицами, логике же видно ровно одно — идёт или нет. `SenseWeatherI`
         */
        this.weather = new Set()

        // Сообщение на экране: `message` кладёт его сюда, а страница показывает
        this.message = null

        // Метки: их рисует процессор мира, и те же классы носят цели карты
        this.markers = new Markers()

        // Счётчики игры: из них читает половина условий у целей
        this.stats = new Stats()

        // Цели карты. Пустой список ничего не стоит: `update` по нему не ходит
        this.objectives = new Objectives()

        // Открытый контент. Дерева технологий у нас нет, а `ResearchObjective` его читает
        this.unlocked = new Set()

        /*
         * Исходное состояние для перемотки. Снимается перед первым тиком (`markBaseline`):
         * всё, что появилось позже по воле симуляции — юнит от `spawn`, здание от `setblock`,
         * пол от `setblock floor`, — сброс убирает, а погибшее и снесённое возвращает.
         * Постройка и снос руками игрока — внешний ввод: они правят саму основу.
         */
        this.baseline = null
    }

    /** Запоминает текущее состояние как исходное для `reset`. */
    markBaseline() {
        this.baseline = {
            buildings: [...this.buildings],
            units: [...this.units],
            floors: [...this.floors],
            overlays: [...this.overlays],
            walls: [...this.walls],
            linkCounters: new Map(this.linkCounters),
            nextUnitId: this.nextUnitId,
            links: new Map()
        }

        for (const building of this.buildings) building.captureInitial()

        this.recordLinks()
        return this
    }

    /** Связи мачт в основе — только между зданиями основы. */
    recordLinks() {
        const base = this.baseline
        if (base === null) return

        const members = new Set(base.buildings)
        base.links = new Map(base.buildings
            .filter(building => building.power !== null)
            .map(building => [building, building.power.links.filter(link => members.has(link))]))
    }

    /** Пуля в полёте. Складывается в общий список и живёт до попадания или до срока. */
    addBullet(bullet) {
        this.bullets.push(bullet)
        return bullet
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

        // След блока: `-(size - 1) / 2`, у двойки это ноль, у тройки и четвёрки — минус один
        const offset = -Math.trunc((size - 1) / 2)

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

    /** Убирает юнита из мира: мёртвый нигде больше не ищется. */
    removeUnit(unit) {
        this.units = this.units.filter(item => item !== unit)
        return this
    }

    /** Убирает здание из мира вместе с его процессором. */
    remove(building) {
        building.powerGraphRemoved?.()
        this.buildings = this.buildings.filter(item => item !== building)

        if (building.processor !== undefined) {
            this.processors = this.processors.filter(item => item !== building.processor)
        }

        // Соседи снесённого остаются с ссылкой на него, если их не пересчитать
        for (const other of building.proximity) this.updateProximity(other)
        building.proximity = []

        this.terrainVersion++
        return this
    }

    /**
     * Пересчитывает соседей здания. `BuildingComp.updateProximity`: соседи берутся
     * по клеткам вокруг блока в порядке `Edges.getEdges` и только своей команды —
     * чужому складу руду не отдают.
     */
    updateProximity(building) {
        const seen = new Set()
        const found = []

        for (const point of edgeOffsets(building.size)) {
            const other = this.at(building.x + point.x, building.y + point.y)

            if (other === undefined || other.team !== building.team || seen.has(other)) continue

            seen.add(other)
            found.push(other)
        }

        building.proximity = found

        /*
         * Пересчёт узнаёт и сам блок, и его соседи: у конвейера от соседей зависит рисунок,
         * и поставленный рядом блок должен перерисовать не только себя. BuildingComp:1905-1910
         */
        building.onProximityUpdate()
        for (const other of found) other.onProximityUpdate()

        return building
    }

    /** Ставит здание и выдаёт ему имя связи по типу и порядку подключения. */
    add(type, options = {}) {
        const Kind = builderFor(type)
        const building = new Kind(this, type, options)

        const prefix = linkName(type)
        const index = (this.linkCounters.get(prefix) ?? 0) + 1
        this.linkCounters.set(prefix, index)
        building.name = options.name ?? `${prefix}${index}`

        this.buildings.push(building)

        // Своя сеть на одно здание: соседние сольются с ней в `updatePowerGraph`
        if (building.power !== null) {
            building.power.graph = new POWER.Graph()
            building.power.graph.add(building)
        }

        this.updateProximity(building)
        for (const other of building.proximity) this.updateProximity(other)

        building.updatePowerGraph?.()

        // Мачта тянет связи сама, а к обычному блоку связь тянут мачты вокруг
        if (building.autolink !== undefined) building.autolink()
        else POWER?.linkNodes?.(building)

        return building
    }

    get(name) {
        return this.buildings.find(building => building.name === name)
    }

    /**
     * Можно ли поставить блок так, чтобы его центр пришёлся на этот тайл.
     *
     * `Build.validPlace` в игре куда длиннее: там туман войны, радиусы чужих ядер,
     * глубокая вода и пределы на количество. Здесь проверяется то, что у нас
     * смоделировано, — и это перечислено явно:
     *
     *  - блок целиком внутри карты;
     *  - под каждым его тайлом пол, на который вообще можно ставить (`placeableOn`);
     *  - там нет статичной стены;
     *  - здание там либо отсутствует, либо заменяется этим блоком (см. `canReplace`);
     *  - `checkNoUnitOverlap`: сплошной блок нельзя поставить поверх юнита.
     *
     * Поворот здесь не для красоты: тот же блок тем же поворотом ставить некуда, а тот же
     * блок другим поворотом — это и есть разворот конвейера на углу.
     */
    canPlace(type, x, y, rotation = 0) {
        const spec = BLOCK_SPECS[type]
        if (spec === undefined) return false

        const offset = -Math.trunc((spec.size - 1) / 2)

        for (let dy = 0; dy < spec.size; dy++) {
            for (let dx = 0; dx < spec.size; dx++) {
                const [tx, ty] = [x + offset + dx, y + offset + dy]

                if (!this.inside(tx, ty)) return false
                if (BLOCK_SPECS[this.floorAt(tx, ty)]?.placeableOn === false) return false
                if (this.wallAt(tx, ty) !== null) return false

                const other = this.at(tx, ty)
                if (other === undefined) continue

                // Тот же блок тем же поворотом: ставить нечего. Build.validPlace
                if (other.type === type && spec.rotate === true && other.rotation === rotation) return false
                if (!canReplace(type, other.type)) return false

                // Новый блок должен накрыть старый целиком, а не наполовину
                const from = other.x + other.sizeOffset
                const under = other.y + other.sizeOffset

                if (from < x + offset || from + other.size > x + offset + spec.size) return false
                if (under < y + offset || under + other.size > y + offset + spec.size) return false
            }
        }

        if (spec.solid !== true) return true

        // Юнит под сплошным блоком мешает: Build.checkNoUnitOverlap
        const half = spec.size / 2
        return !this.units.some(unit => !unit.dead
            && Math.abs(unit.x / 8 - (x + (spec.offset ?? 0) / 8 + 0.5)) < half
            && Math.abs(unit.y / 8 - (y + (spec.offset ?? 0) / 8 + 0.5)) < half)
    }

    /**
     * Разбирается ли здание. `Build.validBreak` спрашивает у тайла, а `Tile.breakable`
     * складывает три поля: `destructible || breakable || update`. Само поле `breakable`
     * у построек снято — оно про кусты и валуны, — поэтому проверять только его нельзя.
     */
    canBreak(building) {
        if (building === undefined || building === null) return false

        const spec = building.spec
        return spec.destructible === true || spec.breakable === true || spec.update === true
    }

    /**
     * Ставит блок, если место годится. Отдаёт здание или `null`.
     *
     * Счётчик построек ведётся здесь: в игре его увеличивает `BlockBuildEndEvent`, и
     * только для своей команды — по нему считает цель «построить столько-то».
     */
    place(type, x, y, options = {}) {
        const rotation = options.rotation ?? 0
        if (!this.canPlace(type, x, y, rotation)) return null

        // Заменяемое уходит молча: в игре старый блок не разбирается, а исчезает под новым
        for (const other of this.covered(type, x, y)) this.demolish(other)

        const building = this.add(type, {...options, x, y})
        if (building.team === this.rules.defaultTeam) this.stats.placedBlockCount.increment(type)

        // Поставленное игроком входит в основу: перемотка его не уберёт
        if (this.baseline !== null) {
            building.captureInitial()
            this.baseline.buildings.push(building)
            this.recordLinks()
        }

        return building
    }

    /** Снос руками игрока: здание уходит и из мира, и из основы перемотки. */
    demolish(building) {
        this.remove(building)

        if (this.baseline !== null) {
            this.baseline.buildings = this.baseline.buildings.filter(item => item !== building)
            this.recordLinks()
        }

        return this
    }

    /** Здания под следом блока: те, что заменит постановка. */
    covered(type, x, y) {
        const spec = BLOCK_SPECS[type]
        if (spec === undefined) return []

        const offset = -Math.trunc((spec.size - 1) / 2)
        const found = new Set()

        for (let dy = 0; dy < spec.size; dy++) {
            for (let dx = 0; dx < spec.size; dx++) {
                const other = this.at(x + offset + dx, y + offset + dy)
                if (other !== undefined) found.add(other)
            }
        }

        return [...found]
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

        // UnitCreateEvent: считаются только свои — это читает цель «количество единиц»
        if (unit.team === this.rules.defaultTeam) this.stats.unitsCreated++

        return unit
    }

    /**
     * Юниты команды одного типа, в порядке появления. Это и есть `team.data().unitCache(type)`,
     * по которому `ubind` ходит по кругу.
     */
    unitsOf(team, type) {
        return this.units.filter(unit => unit.team === team && unit.type === type && !unit.dead)
    }

    /** Ядра команды в порядке появления. `TeamData.cores` */
    cores(team) {
        return this.buildings.filter(building => building.team === team
            && BLOCK_SPECS[building.type]?.core === true)
    }

    /**
     * Первое ядро команды. Его склад в игре и есть «предметы команды»: `TeamData.items()`
     * отдаёт склад первого ядра, а не сумму по всем.
     */
    core(team) {
        return this.cores(team)[0] ?? null
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
        if (this.baseline === null) this.markBaseline()

        this.tick += delta

        // Цели проверяются раньше всего остального: так они стоят в `Logic.update`.
        // Флаг, поднятый программой в этом тике, цель увидит только в следующем
        this.objectives.update(this, delta)

        for (const unit of this.units) unit.update(delta)

        // Пули летят вместе с юнитами: и те, и другие в игре обновляются как сущности
        for (const bullet of this.bullets) bullet.update(delta)
        if (this.bullets.some(bullet => bullet.dead)) {
            this.bullets = this.bullets.filter(bullet => !bullet.dead)
        }

        /*
         * Энергия считается до зданий: сеть раздаёт покрытие, `updateConsumption` переводит
         * его в полезность, и только потом здание работает — с той скоростью, на которую
         * ему хватило. В игре порядок задан очередью сущностей, здесь он записан явно.
         */
        const graphs = new Set()

        for (const building of this.buildings) {
            if (building.power === null) continue
            if (graphs.has(building.power.graph)) continue

            graphs.add(building.power.graph)
            building.power.graph.update(delta)
        }

        for (const building of this.buildings) building.updateConsumption()
        for (const building of this.buildings) building.update(delta)
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
        this.markers.clear()
        this.weather.clear()
        this.rules.reset()
        this.stats.reset()
        this.objectives.reset()
        this.bullets = []

        if (this.baseline !== null) this.restoreBaseline()

        for (const unit of this.units) unit.reset()
        for (const building of this.buildings) building.reset()
        for (const processor of this.processors) processor.reset()
        return this
    }

    /**
     * Возвращает состав мира к основе: здания, юнитов, местность, счётчики имён и связи
     * мачт. Соседство и энергосети после этого пересобираются заново — снесённое здание
     * вернулось, а созданное симуляцией исчезло, и старые графы ничего об этом не знают.
     */
    restoreBaseline() {
        const base = this.baseline

        this.buildings = [...base.buildings]
        this.units = [...base.units]
        this.floors = [...base.floors]
        this.overlays = [...base.overlays]
        this.walls = [...base.walls]
        this.linkCounters = new Map(base.linkCounters)
        this.nextUnitId = base.nextUnitId
        this.terrainVersion++

        /*
         * Процессоры — в прежнем порядке, без чужих основе, и с возвращёнными: порядок
         * списка задаёт страница, а у снесённого здания процессор из него уже выпал.
         */
        const members = new Set(this.buildings)
        const kept = this.processors.filter(processor =>
            processor.building === undefined || processor.building === null || members.has(processor.building))

        for (const building of this.buildings) {
            if (building.processor !== undefined && !kept.includes(building.processor)) kept.push(building.processor)
        }

        this.processors = kept

        for (const building of this.buildings) {
            if (building.power === null) continue

            building.power.links = [...(base.links.get(building) ?? [])]
            building.power.graph = new POWER.Graph()
            building.power.init = false
            building.power.graph.add(building)
        }

        for (const building of this.buildings) this.updateProximity(building)
        for (const building of this.buildings) building.updatePowerGraph?.()
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
