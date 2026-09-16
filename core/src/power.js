/**
 * Энергия: сеть, генераторы, батареи, мачты.
 *
 * Сети в Mindustry нет как объекта на карте — есть граф. Каждое здание с энергией держит
 * ссылку на общий `PowerGraph`, соседи сливают свои графы в один, а снос разрезает граф
 * на новые, обходя оставшиеся связи в ширину. Ни узлов, ни рёбер отдельно никто не хранит.
 *
 * Раз в тик граф считает баланс: сколько произвели, сколько запросили, и раздаёт покрытие —
 * долю от нуля до единицы. Эта доля становится `status` у каждого потребителя и через него
 * попадает в `efficiency` здания: при нехватке энергии фабрика не встаёт, а замедляется.
 *
 * Перенос `PowerGraph`, `PowerModule`, `PowerNode`, `PowerGenerator` и `ConsumeGenerator`.
 */

import {Building, registerBuilders, registerPower} from './world.js'
import {clamp, lerpDelta} from './arc.js'

/** `Vars.tilesize`: восемь мировых единиц на тайл. Дальность мачты задана в тайлах. */
const TILE_UNITS = 8

/** `Mathf.FLOAT_ROUNDING_ERROR`: порог `Mathf.zero` и `Mathf.equal`, включительно. Mathf.java:10 */
const ZERO = 0.000001

const zero = (value) => Math.abs(value) <= ZERO

/**
 * Энергетический модуль здания. `PowerModule`
 *
 * `status` значит разное у разных блоков: у обычного потребителя это доля покрытия,
 * у батареи — насколько она заполнена. Одно поле на два смысла — так в игре.
 */
export class PowerModule {
    constructor() {
        this.status = 0
        this.init = false
        this.graph = null
        this.links = []
    }
}

/**
 * Энергетическая сеть. `PowerGraph`
 *
 * Здания разложены по трём спискам: кто выдаёт, кто потребляет и кто хранит. Блок, который
 * и выдаёт, и потребляет без буфера (например, реактор), попадает сразу в два списка,
 * а с буфером — считается батареей.
 */
export class PowerGraph {
    constructor() {
        this.producers = []
        this.consumers = []
        this.batteries = []
        this.all = []

        this.lastPowerProduced = 0
        this.lastPowerNeeded = 0
        this.lastPowerStored = 0
        this.lastScaledPowerIn = 0
        this.lastScaledPowerOut = 0
        this.lastCapacity = 0
    }

    /** Мощность потребителя: `ConsumePower` из описи блока. */
    static consumePower(building) {
        return (building.spec.consumes ?? []).find(consume => consume.kind === 'power') ?? null
    }

    /** `PowerGraph.add`: место здания в списках выбирается по трём флагам блока. */
    add(building) {
        if (building === null || building.power === null) return
        if (building.power.graph === this && building.power.init) return

        building.power.graph = this
        building.power.init = true
        this.all.push(building)

        const spec = building.spec
        const consume = PowerGraph.consumePower(building)

        if (spec.outputsPower === true && spec.consumesPower === true && consume?.buffered !== true) {
            this.producers.push(building)
            this.consumers.push(building)
        } else if (spec.outputsPower === true && spec.consumesPower === true) {
            this.batteries.push(building)
        } else if (spec.outputsPower === true) {
            this.producers.push(building)
        } else if (spec.consumesPower === true && consume !== null) {
            this.consumers.push(building)
        }
    }

    /** `PowerGraph.addGraph`: сливается меньший в больший, чтобы обход был короче. */
    addGraph(other) {
        if (other === this) return

        if (other.all.length > this.all.length) {
            other.addGraph(this)
            return
        }

        for (const building of [...other.all]) this.add(building)
    }

    /** Произведено за такт. Мощность генератора — за тик, поэтому умножается на дельту. */
    powerProduced(delta) {
        let total = 0
        for (const producer of this.producers) total += producer.powerProduction() * delta

        return total
    }

    /**
     * Запрошено за такт. `ConsumePower.requestedPower`: буферу нужно ровно столько, сколько
     * не хватает до полного, а обычному потребителю — его мощность, и только когда он хочет
     * работать (`shouldConsume`). Фабрика, которой некуда класть готовое, энергию не тянет.
     */
    powerNeeded(delta) {
        let total = 0

        for (const consumer of this.consumers) {
            const consume = PowerGraph.consumePower(consumer)
            if (consume === null || !consumer.shouldConsumePower) continue

            total += (consume.buffered === true
                ? (1 - consumer.power.status) * consume.capacity
                : consume.usage * (consumer.shouldConsume() ? 1 : 0)) * delta
        }

        return total
    }

    /** Сколько энергии лежит в батареях сети. */
    batteryStored() {
        let total = 0

        for (const battery of this.batteries) {
            if (battery.enabled === false) continue
            total += battery.power.status * PowerGraph.consumePower(battery).capacity
        }

        return total
    }

    /** Сколько ещё влезет. */
    batteryCapacity() {
        let total = 0

        for (const battery of this.batteries) {
            if (battery.enabled === false) continue
            total += (1 - battery.power.status) * PowerGraph.consumePower(battery).capacity
        }

        return total
    }

    /** Общая вместимость батарей: она и отвечает на `@powerNetCapacity`. */
    totalBatteryCapacity() {
        let total = 0

        for (const battery of this.batteries) {
            if (battery.enabled === false) continue
            total += PowerGraph.consumePower(battery).capacity
        }

        return total
    }

    /**
     * `PowerGraph.useBatteries`: все батареи разряжаются на одну и ту же долю, а не по очереди.
     * Поэтому две батареи рядом с потребителем пустеют одинаково.
     */
    useBatteries(needed) {
        const stored = this.batteryStored()
        if (zero(stored)) return 0

        const used = Math.min(stored, needed)
        const share = Math.min(1, needed / stored)

        for (const battery of this.batteries) {
            if (battery.enabled === false) continue
            battery.power.status *= 1 - share
        }

        return used
    }

    /** `PowerGraph.chargeBatteries`: так же и заряд — одинаковой долей от недостающего. */
    chargeBatteries(excess) {
        const capacity = this.batteryCapacity()
        const share = Math.min(excess / capacity, 1)

        if (zero(capacity)) return 0

        for (const battery of this.batteries) {
            const consume = PowerGraph.consumePower(battery)
            if (battery.enabled === false || consume.capacity <= 0) continue

            battery.power.status += (1 - battery.power.status) * share
        }

        return Math.min(excess, capacity)
    }

    /**
     * `PowerGraph.distributePower`: покрытие раздаётся всем потребителям сразу, а не по очереди.
     *
     * Неработающий потребитель тоже получает число — оценку того, что ему досталось бы,
     * начни он работать. Она и показывается полоской в игре, и видна через `sensor @efficiency`.
     */
    distributePower(needed, produced, charged, delta) {
        const idle = zero(needed) && zero(produced) && !charged && zero(this.lastPowerStored)

        const coverage = idle ? 0
            : zero(needed) ? 1
                : Math.min(1, produced / needed)

        for (const consumer of this.consumers) {
            const consume = PowerGraph.consumePower(consumer)

            if (consume.buffered === true) {
                if (zero(consume.capacity)) continue

                const rate = (1 - consumer.power.status) * consume.capacity * coverage * delta
                consumer.power.status = clamp(consumer.power.status + rate / consume.capacity)
                continue
            }

            if (consumer.shouldConsumePower) {
                consumer.power.status = coverage
            } else {
                const status = produced / (needed + consume.usage * delta)
                consumer.power.status = Number.isFinite(status) ? Math.min(1, status) : 0
            }
        }
    }

    /** Такт сети. `PowerGraph.update` */
    update(delta = 1) {
        const needed = this.powerNeeded(delta)
        let produced = this.powerProduced(delta)

        this.lastPowerNeeded = needed
        this.lastPowerProduced = produced

        this.lastScaledPowerIn = produced / delta
        this.lastScaledPowerOut = needed / delta
        this.lastCapacity = this.totalBatteryCapacity()
        this.lastPowerStored = this.batteryStored()

        if (this.all.length === 0) return

        let charged = false

        if (!zero(needed - produced)) {
            if (needed > produced) {
                const fromBatteries = this.useBatteries(needed - produced)

                produced += fromBatteries
                this.lastPowerProduced += fromBatteries
            } else {
                charged = true
                produced -= this.chargeBatteries(produced - needed)
            }
        }

        this.distributePower(needed, produced, charged, delta)
    }

    /**
     * Снос. `PowerGraph.remove`: здание не вычёркивается из графа — вместо этого каждая
     * оставшаяся ветка обходится в ширину и получает свой, новый граф. Старый после этого
     * недействителен и просто исчезает вместе с последней ссылкой на него.
     */
    remove(building) {
        for (const other of building.getPowerConnections()) {
            if (other.power.graph !== this) continue

            const graph = new PowerGraph()
            graph.add(other)

            const queue = [other]

            while (queue.length > 0) {
                const child = queue.shift()
                graph.add(child)

                for (const next of child.getPowerConnections()) {
                    if (next !== building && next.power.graph !== graph) {
                        graph.add(next)
                        queue.push(next)
                    }
                }
            }

            // Чтобы потребители без источника сразу остались без энергии, а не через такт
            graph.update()
        }
    }
}

/**
 * Генератор. `PowerGenerator.GeneratorBuild`
 *
 * Выдаёт `powerProduction * productionEfficiency` за тик. Доля считается каждым генератором
 * по-своему: солнечная панель смотрит на освещение, сжигатель — на топливо.
 */
export class GeneratorBuilding extends Building {
    constructor(world, type, options) {
        super(world, type, options)
        this.productionEfficiency = 0
    }

    reset() {
        super.reset()
        this.productionEfficiency = 0
    }

    powerProduction() {
        return this.enabled === false ? 0 : this.spec.powerProduction * this.productionEfficiency
    }
}

/**
 * Солнечная панель. `SolarGenerator`
 *
 * В игре доля считается от освещения карты: `solarMultiplier * (свет среды + 1 - тьма)`.
 * У нас света нет вовсе, а правила по умолчанию дают ровно единицу, поэтому включённая
 * панель всегда выдаёт свою мощность.
 */
export class SolarGeneratorBuilding extends GeneratorBuilding {
    update() {
        this.productionEfficiency = this.enabled === false ? 0 : 1
    }
}

/**
 * Сжигатель. `ConsumeGenerator`
 *
 * Порция сырья берётся не каждый тик, а когда догорела предыдущая: `generateTime` падает
 * от единицы до нуля за `itemDuration` тиков, и только тогда из содержимого уходит один
 * предмет. Поэтому генератор работает и с пустым входом — пока горит то, что уже взято.
 *
 * Мощность зависит от топлива: у угля множитель единица, у пиратита 1.4 — они сняты
 * в опись генератором, потому что в исходнике это метод, а не число.
 */
export class ConsumeGeneratorBuilding extends GeneratorBuilding {
    constructor(world, type, options) {
        super(world, type, options)

        this.generateTime = 0
        this.warmup = 0
        this.efficiencyMultiplier = 1
    }

    reset() {
        super.reset()

        this.generateTime = 0
        this.warmup = 0
        this.efficiencyMultiplier = 1
    }

    /** Фильтр сырья: у сжигателя это любое горючее, список снят в опись. */
    get filter() {
        return (this.spec.consumes ?? []).find(consume => consume.kind === 'itemFilter') ?? null
    }

    /** Первый подходящий предмет из содержимого, в порядке описи игры. `getConsumed` */
    consumedItem() {
        const filter = this.filter
        if (filter === null || this.items === null) return null

        for (const item of filter.items) {
            if ((this.items.get(item) ?? 0) > 0) return item
        }

        return null
    }

    /** `ConsumeGenerator.consumeTriggerValid`: пока предыдущая порция горит, топливо не нужно. */
    consumeTriggerValid() {
        return this.generateTime > 0
    }

    update(delta = 1) {
        const valid = this.efficiency > 0

        this.warmup = lerpDelta(this.warmup, valid ? 1 : 0, this.spec.warmupSpeed ?? 0.05, delta)
        this.productionEfficiency = this.efficiency * this.efficiencyMultiplier

        // Порция берётся, только когда предыдущая догорела
        if (valid && this.generateTime <= 0) {
            const item = this.consumedItem()

            if (item !== null) {
                this.efficiencyMultiplier = this.filter.multipliers?.[item] ?? 1
                this.removeStack(item, 1)
            }

            this.generateTime = 1
        }

        this.generateTime -= delta * this.efficiency / this.spec.itemDuration
    }
}

/**
 * Мачта. `PowerNode`
 *
 * Ставится и сама тянет связи: до `maxNodes` штук, в пределах `laserRange` тайлов,
 * сперва к другим мачтам, потом по близости. Соседей по стороне она не берёт — с ними
 * ток и так идёт, — и не тянет вторую связь туда, где уже есть общий граф.
 */
export class PowerNodeBuilding extends Building {
    /**
     * Есть ли пересечение круга дальности со следом блока. `PowerNode.overlaps`:
     * дальность считается от центра мачты до **прямоугольника** блока, а не до его центра,
     * поэтому большой блок цепляется краем.
     */
    overlaps(other) {
        const range = this.spec.laserRange * TILE_UNITS

        const cx = (this.x + this.offset / TILE_UNITS + 0.5) * TILE_UNITS
        const cy = (this.y + this.offset / TILE_UNITS + 0.5) * TILE_UNITS

        const half = other.size * TILE_UNITS / 2
        const ox = (other.x + other.offset / TILE_UNITS + 0.5) * TILE_UNITS
        const oy = (other.y + other.offset / TILE_UNITS + 0.5) * TILE_UNITS

        const dx = Math.max(Math.abs(cx - ox) - half, 0)
        const dy = Math.max(Math.abs(cy - oy) - half, 0)

        return dx * dx + dy * dy <= range * range
    }

    /** Соседи по стороне: с ними ток идёт и без связи, поэтому связь к ним не тянется. */
    adjacent(other) {
        return this.proximity.includes(other)
    }

    /**
     * Кого зацепить при постановке. `PowerNode.getPotentialLinks`: сперва другие мачты,
     * потом всё остальное по близости, и не больше `maxNodes` штук. Здание, чей граф уже
     * зацеплен, пропускается — иначе одна и та же сеть соединялась бы дважды.
     */
    autolink() {
        if (this.spec.autolink === false) return

        const graphs = new Set([this.power.graph])
        for (const other of this.proximity) {
            if (other.power !== null && other.team === this.team) graphs.add(other.power.graph)
        }

        const suitable = this.world.buildings.filter(other => other !== this
            && other.power !== null
            && other.team === this.team
            && other.spec.connectedPower !== false
            && (other.spec.outputsPower === true || other.spec.consumesPower === true
                || other.spec.laserRange !== undefined)
            && this.overlaps(other)
            && this.spec.insulated !== true && other.spec.insulated !== true
            && !this.adjacent(other)
            && !(other.spec.laserRange !== undefined && other.power.links.length >= other.spec.maxNodes))

        const nodes = other => other.spec.laserRange !== undefined ? 0 : 1
        const distance = other => (other.x - this.x) ** 2 + (other.y - this.y) ** 2

        suitable.sort((first, second) => nodes(first) - nodes(second) || distance(first) - distance(second))

        for (const other of suitable) {
            if (this.power.links.length >= this.spec.maxNodes) break
            if (graphs.has(other.power.graph)) continue

            graphs.add(other.power.graph)
            this.link(other)
        }
    }

    /** Протянуть связь в обе стороны и слить графы. */
    link(other) {
        if (this.power.links.includes(other)) return

        this.power.links.push(other)
        other.power.links.push(this)

        this.power.graph.addGraph(other.power.graph)
    }
}

/**
 * Источник песочницы. `PowerSource` — это мачта, а не генератор: он и связи тянет, и
 * выдаёт свой миллион в секунду, лишь бы был включён.
 */
export class PowerSourceBuilding extends PowerNodeBuilding {
    powerProduction() {
        return this.enabled === false ? 0 : this.spec.powerProduction
    }
}

/**
 * Поставили обычный блок с энергией — к нему тянутся мачты, а не он к ним.
 * `BuildingComp.placed` вызывает `PowerNode.getNodeLinks`, и связь заводит мачта.
 *
 * Без этого порядок постройки решал бы всё: поставил мачту раньше фабрики — работает,
 * позже — нет. В игре так же тянется связь и к только что поставленному блоку.
 */
export function linkNodes(building) {
    const spec = building.spec

    if (building.power === null || spec.connectedPower === false) return
    if (spec.consumesPower !== true && spec.outputsPower !== true) return

    const graphs = new Set([building.power.graph])
    for (const other of building.proximity) {
        if (other.power !== null && other.team === building.team) graphs.add(other.power.graph)
    }

    const nodes = building.world.buildings.filter(other => other !== building
        && other instanceof PowerNodeBuilding
        && other.team === building.team
        && other.spec.autolink !== false
        && other.power.links.length < other.spec.maxNodes
        && other.overlaps(building)
        && !other.proximity.includes(building))

    nodes.sort((first, second) => (first.x - building.x) ** 2 + (first.y - building.y) ** 2
        - ((second.x - building.x) ** 2 + (second.y - building.y) ** 2))

    for (const node of nodes) {
        if (graphs.has(node.power.graph)) continue

        graphs.add(node.power.graph)
        node.link(building)
    }
}

registerPower({Module: PowerModule, Graph: PowerGraph, linkNodes})

registerBuilders({
    PowerGenerator: GeneratorBuilding,
    SolarGenerator: SolarGeneratorBuilding,
    ConsumeGenerator: ConsumeGeneratorBuilding,
    PowerNode: PowerNodeBuilding,
    PowerSource: PowerSourceBuilding
})
