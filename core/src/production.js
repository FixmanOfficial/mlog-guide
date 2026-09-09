/**
 * Производство: буры копают, фабрики варят.
 *
 * Всё, что здесь есть, приходит числами из выгрузки: `drillTime`, `craftTime`, рецепты
 * и потребление сняты с запущенной игры (`tools/gen-dump.mjs`), а формулы перенесены
 * из `Drill.updateTile` и `GenericCrafter.updateTile`. Своих коэффициентов тут нет
 * ни одного — иначе первая же лекция про `@progress` разошлась бы с игрой.
 *
 * Чего пока нет: энергии и жидкостей. Блок, которому нужна энергия, работает так, будто она
 * есть; водяное ускорение бура не считается. Это записано в `docs/parity.md` и чинится
 * следующим заходом, а не молчанием.
 */

import {Building, BLOCK_SPECS, TIMER_DUMP, registerBuilders} from './world.js'
import {approachDelta, lerp} from './arc.js'
import materials from '../data/materials.json' with {type: 'json'}

/** Предмет, который даёт клетка: сначала руда сверху, потом сам пол. `Tile.drop` */
function dropAt(world, x, y) {
    const overlay = world.overlayAt(x, y)
    const floor = world.floorAt(x, y)

    return BLOCK_SPECS[overlay]?.itemDrop ?? BLOCK_SPECS[floor]?.itemDrop ?? null
}

/**
 * Бур.
 *
 * Скорость считается не «в секунду», а временем на один предмет: `drillTime` плюс поправка
 * на твёрдость, делённое на число рудных клеток под буром. Поэтому механический бур
 * на четырёх клетках меди быстрее, чем на одной, ровно вчетверо. Drill.java:287-325
 */
export class DrillBuilding extends Building {
    constructor(world, type, options) {
        super(world, type, options)

        this.progress = 0
        this.warmup = 0

        this.countOre()
    }

    reset() {
        super.reset()

        this.progress = 0
        this.warmup = 0
    }

    /**
     * Что и сколько под буром. `Drill.countOre`: считаются клетки каждого предмета, а копать
     * бур будет тот, что победил по трём признакам подряд — не «низкоприоритетный» (песок под
     * водой уступает), потом больше клеток, потом больший номер в описи.
     */
    countOre() {
        const counts = new Map()
        const offset = this.sizeOffset

        for (let dy = 0; dy < this.size; dy++) {
            for (let dx = 0; dx < this.size; dx++) {
                const item = this.canMine(this.x + offset + dx, this.y + offset + dy)
                if (item === null) continue

                counts.set(item, (counts.get(item) ?? 0) + 1)
            }
        }

        const order = [...counts.keys()].sort((first, second) => {
            const priority = Number(!materials.items[first].lowPriority)
                - Number(!materials.items[second].lowPriority)
            if (priority !== 0) return priority

            const amounts = counts.get(first) - counts.get(second)
            if (amounts !== 0) return amounts

            return materials.items[first].id - materials.items[second].id
        })

        this.dominantItem = order.length === 0 ? null : order[order.length - 1]
        this.dominantItems = this.dominantItem === null ? 0 : counts.get(this.dominantItem)
    }

    /** `Drill.canMine`: не статичная стена, предмет по зубам буру и не в запрете. */
    canMine(x, y) {
        if (!this.world.inside(x, y)) return null
        if (this.world.wallAt(x, y) !== null) return null

        const item = dropAt(this.world, x, y)
        if (item === null) return null

        const blocked = this.spec.blockedItems ?? []
        if (blocked.includes(item)) return null

        return materials.items[item].hardness <= this.spec.tier ? item : null
    }

    /** `Drill.getDrillTime`: тиков на один предмет, с поправкой на твёрдость. */
    drillTime(item) {
        const hardness = materials.items[item].hardness
        const multiplier = this.spec.drillMultipliers?.[item] ?? 1

        return (this.spec.drillTime + this.spec.hardnessDrillMultiplier * hardness) / multiplier
    }

    /** Доля до следующего предмета — то, что отдаёт `sensor @progress`. */
    get progressFraction() {
        return this.dominantItem === null
            ? 0
            : Math.min(1, this.progress / this.drillTime(this.dominantItem))
    }

    update(delta = 1) {
        if (this.timer(TIMER_DUMP, this.spec.dumpTime)) {
            this.dump(this.dominantItem !== null && (this.items?.get(this.dominantItem) ?? 0) > 0
                ? this.dominantItem
                : null)
        }

        if (this.dominantItem === null) return

        const delay = this.drillTime(this.dominantItem)
        const total = [...(this.items?.values() ?? [])].reduce((sum, value) => sum + value, 0)

        /*
         * Ускорение водой — необязательное потребление, и его у нас нет: `optionalEfficiency`
         * ноль, значит множитель равен единице. Когда появятся жидкости, здесь заработает
         * `lerp` до `liquidBoostIntensity`.
         */
        const speed = lerp(1, this.spec.liquidBoostIntensity, 0) * this.efficiency

        if (total >= this.maximumAccepted() || this.dominantItems <= 0 || this.efficiency <= 0) {
            this.warmup = approachDelta(this.warmup, 0, this.spec.warmupSpeed, delta)
            return
        }

        this.warmup = approachDelta(this.warmup, speed, this.spec.warmupSpeed, delta)
        this.progress += delta * this.dominantItems * speed * this.warmup

        if (this.progress >= delay) {
            const amount = Math.trunc(this.progress / delay)
            for (let i = 0; i < amount; i++) this.offload(this.dominantItem)

            this.progress %= delay
        }
    }

    sense(property) {
        // `Drill.sense`: у бура `@progress` отдаёт не долю, а накопленное время. Drill.java:334
        if (property === 'progress' && this.dominantItem !== null) return this.progress
        return super.sense(property)
    }

    senseObject(property) {
        // `@firstItem` у бура — то, что он копает, даже когда внутри пусто. Drill.java:282
        if (property === 'firstItem' && this.dominantItem !== null) {
            return this.world?.content?.find?.(this.dominantItem) ?? null
        }

        return super.senseObject(property)
    }
}

/**
 * Фабрика: берёт сырьё, ждёт `craftTime` и выкладывает готовое.
 *
 * Ход считается долей: `progress += efficiency * delta / craftTime`, и как только доля
 * дошла до единицы, происходит выпуск. Поэтому `sensor @progress` у фабрики честно
 * показывает от нуля до единицы, в отличие от бура. GenericCrafter.java:150-200
 */
export class CrafterBuilding extends Building {
    constructor(world, type, options) {
        super(world, type, options)

        this.progress = 0
        this.warmup = 0
    }

    reset() {
        super.reset()

        this.progress = 0
        this.warmup = 0
    }

    /** Сырьё рецепта: то, что блок потребляет предметами. */
    get inputs() {
        return (this.spec.consumes ?? [])
            .filter(consume => consume.kind === 'items' && consume.optional !== true)
            .flatMap(consume => consume.items)
    }

    get outputs() {
        return this.spec.outputItems ?? []
    }

    /** Всё ли сырьё на месте. `ConsumeItems.efficiency`: хватает — единица, нет — ноль. */
    hasInputs() {
        return this.inputs.every(stack => (this.items?.get(stack.item) ?? 0) >= stack.amount)
    }

    /**
     * `GenericCrafter.shouldConsume`: фабрика не начинает, если готовому некуда деться.
     * Отсюда знакомое «стоит с полным складом» — она не ломается, а ждёт.
     */
    shouldConsume() {
        return this.outputs.every(stack => (this.items?.get(stack.item) ?? 0) + stack.amount
            <= this.maximumAccepted())
    }

    /** `BuildingComp.updateConsumption`, сокращённая до того, что смоделировано. */
    get workEfficiency() {
        if (!this.enabled) return 0
        return this.hasInputs() && this.shouldConsume() ? this.efficiency : 0
    }

    update(delta = 1) {
        const efficiency = this.workEfficiency

        if (efficiency > 0) {
            this.progress += efficiency * delta / this.spec.craftTime
            this.warmup = approachDelta(this.warmup, 1, this.spec.warmupSpeed, delta)
        } else {
            this.warmup = approachDelta(this.warmup, 0, this.spec.warmupSpeed, delta)
        }

        if (this.progress >= 1) this.craft()

        // `dumpOutputs`: отдаётся только готовое, сырьё соседям не уходит
        if (this.outputs.length > 0 && this.timer(TIMER_DUMP, this.spec.dumpTime)) {
            for (const stack of this.outputs) this.dump(stack.item)
        }
    }

    /** `GenericCrafter.craft`: списать сырьё, выложить готовое, оставить остаток хода. */
    craft() {
        for (const stack of this.inputs) this.removeStack(stack.item, stack.amount)

        for (const stack of this.outputs) {
            for (let i = 0; i < stack.amount; i++) this.offload(stack.item)
        }

        this.progress %= 1
    }

    sense(property) {
        if (property === 'progress') return this.progress
        return super.sense(property)
    }
}

registerBuilders({Drill: DrillBuilding, GenericCrafter: CrafterBuilding})
