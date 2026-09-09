/**
 * Транспорт: конвейеры и маршрутизаторы.
 *
 * Конвейер в Mindustry — не очередь, а лента с координатами: у каждого предмета своё место
 * от нуля до единицы вдоль ленты и смещение поперёк неё. Отсюда всё знакомое поведение —
 * предметы не наезжают друг на друга ближе `itemSpace`, лента забивается с конца, а вход
 * сбоку кладёт предмет в середину, а не в начало.
 *
 * Перенос из `Conveyor.updateTile` и `Router.updateTile`. Скорости — из выгрузки:
 * у обычного конвейера 0.046 доли ленты за тик, у титанового 0.0801.
 */

import {Building, registerBuilders} from './world.js'
import {facingEdge} from './edges.js'
import {approach, clamp} from './arc.js'

/** `Conveyor.itemSpace`: ближе этого предметы на ленте не стоят. Conveyor.java:27 */
const ITEM_SPACE = 0.4

/** `Conveyor.capacity`: сколько предметов помещается на одну клетку ленты. Conveyor.java:28 */
const CAPACITY = 3

/** Смещения по сторонам света: `Geometry.d4`, где ноль это вправо. */
const D4 = [{x: 1, y: 0}, {x: 0, y: 1}, {x: -1, y: 0}, {x: 0, y: -1}]

/** Направление от одной клетки к соседней: 0..3, а если клетки не соседние — минус один. */
function relative(fromX, fromY, toX, toY) {
    const index = D4.findIndex(step => fromX + step.x === toX && fromY + step.y === toY)
    return index
}

/**
 * Конвейер.
 *
 * Предметы держатся тремя массивами, как в игре: что за предмет, где он вдоль ленты и куда
 * смещён поперёк. Порядок в массиве — от хвоста к голове, поэтому обход идёт с конца.
 */
export class ConveyorBuilding extends Building {
    constructor(world, type, options) {
        super(world, type, options)

        this.line = []
        this.minitem = 1
        this.mid = 0
    }

    reset() {
        super.reset()

        this.line = []
        this.minitem = 1
        this.mid = 0
    }

    /** Здание, в которое смотрит лента. `BuildingComp.front` */
    get next() {
        const step = D4[this.rotation]
        return this.world.at(this.x + step.x, this.y + step.y) ?? null
    }

    /** Продолжение ленты: следующий конвейер, повёрнутый так же. `Conveyor.aligned` */
    get aligned() {
        const next = this.next
        return next instanceof ConveyorBuilding && next.rotation === this.rotation
    }

    /**
     * `Conveyor.acceptItem`: сзади предмет принимают, когда голова ленты отошла на `itemSpace`,
     * сбоку — когда отошла дальше семи десятых. Плюс запрет отдавать назад тому, на кого лента
     * смотрит: иначе два встречных конвейера перекидывали бы предмет друг другу вечно.
     */
    acceptItem(source, item) {
        if (this.line.length >= CAPACITY) return false
        if (source === null || source === undefined) return false

        const edge = facingEdge(source, this.x, this.y)
        const direction = relative(edge.x, edge.y, this.x, this.y)
        if (direction === -1) return false

        const relativeToRotation = Math.abs(direction - this.rotation)
        const fromBehind = relativeToRotation === 0

        if (source.spec.rotate === true && this.next === source) return false

        return fromBehind
            ? this.minitem >= ITEM_SPACE
            : relativeToRotation % 2 === 1 && this.minitem > 0.7
    }

    /**
     * `Conveyor.handleItem`: сзади предмет встаёт в начало ленты, сбоку — в середину.
     * Поперечное смещение показывает, с какой стороны он заехал, и потом сходит к нулю.
     */
    handleItem(source, item) {
        if (this.line.length >= CAPACITY) return

        const edge = facingEdge(source, this.x, this.y)
        const direction = relative(edge.x, edge.y, this.x, this.y)
        const angle = direction - this.rotation
        const across = (angle === -1 || angle === 3) ? 1 : (angle === 1 || angle === -3) ? -1 : 0

        this.handleStack(item, 1)

        if (Math.abs(direction - this.rotation) === 0) {
            this.line.unshift({item, y: 0, x: across})
        } else {
            this.line.splice(this.mid, 0, {item, y: 0.5, x: across})
        }
    }

    /** Отдать предмет дальше по ленте. `Conveyor.pass` */
    pass(item) {
        const next = this.next

        if (next === null || next.team !== this.team || !next.acceptItem(this, item)) return false

        next.handleItem(this, item)
        return true
    }

    /**
     * Ход ленты. `Conveyor.updateTile`: предметы двигаются от головы к хвосту, каждый не ближе
     * `itemSpace` к следующему, а голова упирается в начало соседней ленты.
     */
    update(delta = 1) {
        this.minitem = 1
        this.mid = 0

        if (this.line.length === 0) return

        const next = this.next
        const nextMax = this.aligned ? 1 - Math.max(ITEM_SPACE - next.minitem, 0) : 1
        const moved = this.spec.speed * this.efficiency * delta

        for (let i = this.line.length - 1; i >= 0; i--) {
            const entry = this.line[i]
            const ahead = (i === this.line.length - 1 ? 100 : this.line[i + 1].y) - ITEM_SPACE

            entry.y += clamp(ahead - entry.y, 0, moved)
            if (entry.y > nextMax) entry.y = nextMax
            if (entry.y > 0.5 && i > 0) this.mid = i - 1

            entry.x = approach(entry.x, 0, moved * 2)

            if (entry.y >= 1 && this.pass(entry.item)) {
                /*
                 * Голова уехала к соседу. Счётчик правится напрямую, мимо своего `removeStack`:
                 * тот ищет предмет по ленте сам и снял бы заодно чужой, стоящий в хвосте.
                 */
                super.removeStack(entry.item, 1)
                this.line.splice(i, this.line.length - i)
            } else if (entry.y < this.minitem) {
                this.minitem = entry.y
            }
        }
    }

    /** Снятие предмета с ленты убирает его и с координат, а не только из счётчика. */
    removeStack(item, amount) {
        const removed = super.removeStack(item, amount)

        for (let left = removed; left > 0; left--) {
            const index = this.line.findIndex(entry => entry.item === item)
            if (index === -1) break

            this.line.splice(index, 1)
        }

        return removed
    }
}

/**
 * Маршрутизатор: держит один предмет и раздаёт его соседям по кругу.
 *
 * Тот самый блок, из-за которого базы стоят: он отдаёт назад тому, кто ему принёс, и двум
 * маршрутизаторам подряд предмет перекидывается туда-сюда. Здесь это воспроизведено,
 * а не поправлено, — иначе урок про маршрутизаторы учил бы неправде.
 */
export class RouterBuilding extends Building {
    constructor(world, type, options) {
        super(world, type, options)

        this.lastItem = null
        this.lastInput = null
        this.time = 0
    }

    reset() {
        super.reset()

        this.lastItem = null
        this.lastInput = null
        this.time = 0
    }

    /** `Router.acceptItem`: строго по одному предмету и только от своей команды. */
    acceptItem(source, item) {
        const total = [...(this.items?.values() ?? [])].reduce((sum, value) => sum + value, 0)
        return source?.team === this.team && this.lastItem === null && total === 0
    }

    handleItem(source, item) {
        this.handleStack(item, 1)

        this.lastItem = item
        this.lastInput = source
        this.time = 0
    }

    /**
     * `Router.getTileTarget`: соседи перебираются по кругу, а указателем служит поворот блока —
     * своего поля для этого у маршрутизатора нет.
     */
    target(item, {advance = false} = {}) {
        const size = this.proximity.length
        const start = this.rotation

        for (let i = 0; i < size; i++) {
            const other = this.proximity[(i + start) % size]
            if (advance) this.rotation = (this.rotation + 1) % size

            if (other.acceptItem(this, item)) return other
        }

        return null
    }

    update(delta = 1) {
        if (this.lastItem === null && (this.items?.size ?? 0) > 0) {
            this.lastItem = [...this.items.entries()].find(([, amount]) => amount > 0)?.[0] ?? null
        }

        if (this.lastItem === null) return

        this.time += delta / this.spec.speed
        const target = this.target(this.lastItem)

        // Соседу, который передаёт мгновенно, отдают сразу; такому же маршрутизатору — по таймеру
        const instant = target !== null
            && !(target instanceof RouterBuilding || target.spec.instantTransfer === true)

        if (target !== null && (this.time >= 1 || instant)) {
            this.target(this.lastItem, {advance: true})
            target.handleItem(this, this.lastItem)

            this.removeStack(this.lastItem, 1)
            this.lastItem = null
        }
    }

    removeStack(item, amount) {
        const removed = super.removeStack(item, amount)
        if (removed !== 0 && item === this.lastItem) this.lastItem = null

        return removed
    }
}

registerBuilders({Conveyor: ConveyorBuilding, Router: RouterBuilding})
