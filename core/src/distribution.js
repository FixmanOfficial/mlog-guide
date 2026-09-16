/**
 * Транспорт: конвейеры, маршрутизаторы, перекрёстки, сортировщики и ворота.
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
import {approach, clamp, mod} from './arc.js'

/** `Conveyor.itemSpace`: ближе этого предметы на ленте не стоят. Conveyor.java:27 */
const ITEM_SPACE = 0.4

/** `Conveyor.capacity`: сколько предметов помещается на одну клетку ленты. Conveyor.java:28 */
const CAPACITY = 3

/**
 * Имя предмета из настройки: строкой приходит от песочницы, объектом контента — от логики.
 * Не предмет — настройка не меняется, как у `config(Item.class, ...)`.
 */
export function itemName(value, current) {
    if (value === null || typeof value === 'string') return value
    return value?.contentType === 'item' ? value.name : current
}

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

        /*
         * Вид соединения и отражение спрайта: их считает `Autotiler` по соседям, а рисунок
         * берётся из таблицы `regions[blendbits][кадр]`. Ноль — прямой участок.
         */
        this.blendbits = 0
        this.blendsclx = 1
        this.blendscly = 1
    }

    reset() {
        super.reset()

        this.line = []
        this.minitem = 1
        this.mid = 0
    }

    /**
     * Сосед в направлении `dir`, где ноль — вправо. `Tile.nearbyBuild`
     *
     * Направление здесь абсолютное, не относительно ленты: `blends` переводит одно в другое.
     */
    nearby(dir) {
        const step = D4[dir]
        return this.world.at(this.x + step.x, this.y + step.y) ?? null
    }

    /**
     * Смотрит ли лента в этот блок. `Autotiler.lookingAt`
     *
     * У блока крупнее клетки берётся не его тайл, а ближний к нам край: иначе лента,
     * упирающаяся в угол склада, считалась бы смотрящей мимо.
     */
    lookingAt(other) {
        const facing = facingEdge(other, this.x, this.y)
        if (facing === null) return false

        const step = D4[this.rotation]
        return this.x + step.x === facing.x && this.y + step.y === facing.y
    }

    /**
     * Смотрит ли кто-то из двоих на другого. `Autotiler.lookingAtEither`
     *
     * Неповорачиваемый блок считается смотрящим на нас всегда: у склада нет направления,
     * и лента стыкуется с ним с любой стороны.
     */
    lookingAtEither(other) {
        const step = D4[this.rotation]
        if (this.x + step.x === other.x && this.y + step.y === other.y) return true

        // `Block.rotatedOutput` по умолчанию это `rotate`
        if (other.spec.rotate !== true) return true

        const back = D4[other.rotation]
        return other.x + back.x === this.x && other.y + back.y === this.y
    }

    /**
     * Стыкуется ли лента с блоком в направлении `direction`, считая от самой ленты:
     * ноль — прямо по ходу, единица — слева, тройка — справа. `Autotiler.blends`
     *
     * Само правило — из `Conveyor.blends`: сосед должен либо отдавать предметы, либо
     * принимать их и стоять прямо по ходу ленты, и при этом кто-то из двоих должен
     * смотреть на другого.
     */
    blends(direction) {
        const other = this.nearby(mod(this.rotation - direction, 4))
        if (other === null || other.team !== this.team) return false

        const gives = other.spec.hasItems === true
        const takes = this.lookingAt(other) && other.spec.hasItems === true

        return (gives || takes) && this.lookingAtEither(other)
    }

    /**
     * Вид соединения по соседям. `Autotiler.buildBlending` вместе с `transformCase`.
     *
     * Пять картинок на все случаи: прямая, угол, тройник и их отражения. Отражение —
     * это не отдельный спрайт, а минус единица по вертикали, поэтому угол налево и угол
     * направо рисуются одной и той же картинкой.
     *
     * Маску [4] игра считает для блоков с неквадратным спрайтом — это протоки, которых
     * у нас нет; их кусок ленты, дорисованный поверх соседа, поэтому и не переносится.
     */
    onProximityUpdate() {
        const left = this.blends(1)
        const right = this.blends(3)
        const behind = this.blends(2)

        const num = behind && left && right ? 0
            : left && right ? 1
            : left && behind ? 2
            : right && behind ? 3
            : left ? 4
            : right ? 5
            : -1

        this.blendbits = 0
        this.blendsclx = 1
        this.blendscly = 1

        switch (num) {
            case 0: this.blendbits = 3; break
            case 1: this.blendbits = 4; break
            case 2: this.blendbits = 2; break
            case 3: this.blendbits = 2; this.blendscly = -1; break
            case 4: this.blendbits = 1; this.blendscly = -1; break
            case 5: this.blendbits = 1; break
        }
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

        /*
         * Указатель обхода — свой у каждого предмета (`cycles[item.id]`): иначе медь и свинец,
         * идущие через один маршрутизатор, сбивали бы друг другу очередь. Mindustry#12471
         */
        this.cycles = new Map()
    }

    reset() {
        super.reset()

        this.lastItem = null
        this.lastInput = null
        this.time = 0
        this.cycles = new Map()
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
     * `Router.getTileTarget`: соседи перебираются по кругу от указателя этого предмета.
     * Указатель сдвигается на каждом просмотренном соседе, а не только на принявшем.
     *
     * Воротам переполнения, от которых предмет пришёл, он назад не отдаётся: иначе ворота
     * и маршрутизатор перекидывали бы его друг другу. Только обычным воротам —
     * `from.block() == Blocks.overflowGate`, недополнения это не касается.
     */
    target(item, {advance = false} = {}) {
        const size = this.proximity.length
        const start = this.cycles.get(item) ?? 0
        const from = this.lastInput

        for (let i = 0; i < size; i++) {
            const other = this.proximity[(i + start) % size]
            if (advance) this.cycles.set(item, ((this.cycles.get(item) ?? 0) + 1) % size)

            if (other === from && other.type === 'overflow-gate') continue
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

/**
 * Перекрёсток: четыре очереди, по одной на сторону.
 *
 * Предмет входит с одной стороны и выходит с противоположной ровно через `speed` тиков —
 * у обычного это 26. Ленты при этом не пересекаются: две линии идут сквозь друг друга,
 * и каждая ждёт своей очереди отдельно.
 *
 * `Junction.JunctionBuild`
 */
export class JunctionBuilding extends Building {
    constructor(world, type, options) {
        super(world, type, options)
        this.buffers = [[], [], [], []]
    }

    reset() {
        super.reset()
        this.buffers = [[], [], [], []]
    }

    /** Вместимость одной очереди. `Junction.capacity` */
    get capacity() {
        return this.spec.capacity ?? 6
    }

    /**
     * `Junction.acceptItem`: сторона считается от отправителя, а не от нас. Если с той
     * стороны выхода нет вовсе, предмет не берут — иначе он застрял бы в очереди навсегда.
     */
    acceptItem(source, item) {
        const relative = source.relativeTo(this.x, this.y)
        if (relative === -1 || this.buffers[relative].length >= this.capacity) return false

        const to = this.nearby(relative)
        return to !== null && to.team === this.team
    }

    handleItem(source, item) {
        const relative = source.relativeTo(this.x, this.y)
        if (relative === -1) return

        this.buffers[relative].push({item, time: this.world.tick})
    }

    /**
     * `Junction.updateTile`: очередь отдаёт голову, когда та отлежала `speed` тиков.
     * Не взявший сосед очередь не сбрасывает — предмет ждёт его дальше.
     */
    update() {
        for (let i = 0; i < 4; i++) {
            const queue = this.buffers[i]
            if (queue.length === 0) continue

            const head = queue[0]
            if (this.world.tick < head.time + this.spec.speed) continue

            const dest = this.nearby(i)
            if (dest === null || dest.team !== this.team || !dest.acceptItem(this, head.item)) continue

            dest.handleItem(this, head.item)
            queue.shift()
        }
    }
}

/**
 * Сортировщик: названный предмет идёт насквозь, остальные — вбок.
 *
 * Обратный сортировщик — тот же класс с `invert`: у него насквозь идёт всё, кроме названного.
 * Своего содержимого у сортировщика нет вовсе: он не хранит предмет, а решает, кому его
 * передать, и потому берёт предмет только если тот, кому передавать, готов его принять.
 *
 * `Sorter.SorterBuild`
 */
export class SorterBuilding extends Building {
    constructor(world, type, options) {
        super(world, type, options)

        // Настройка блока: какой предмет считать своим. `Sorter.sortItem`
        this.sortItem = options.sortItem ?? null
        this.initial.sortItem = this.sortItem
    }

    reset() {
        super.reset()
        this.sortItem = this.initial.sortItem
    }

    /**
     * Настройка предметом. `Sorter`: `config(Item.class, ...)` — годится только предмет,
     * остальной контент игнорируется. Хранится имя: по ленте едут имена, и сравнивать
     * надо с ними; логика же присылает объект контента.
     */
    get configItem() {
        return this.sortItem
    }

    set configItem(item) {
        this.sortItem = itemName(item, this.sortItem)
    }

    /** Мгновенная передача у обоих: два таких блока подряд предмет не гоняют. */
    isSame(other) {
        return other !== null && other.spec.instantTransfer === true
    }

    acceptItem(source, item) {
        const to = this.target(item, source, false)
        return to !== null && to.team === this.team && to.acceptItem(this, item)
    }

    handleItem(source, item) {
        const to = this.target(item, source, true)
        if (to !== null) to.handleItem(this, item)
    }

    /**
     * Кому отдать. `Sorter.getTileTarget`
     *
     * Насквозь — если предмет совпал с названным (у обратного наоборот) и блок включён.
     * Иначе вбок, и при выборе из двух сторон они чередуются: указатель хранится битом
     * в `rotation`, которому у сортировщика другого дела всё равно нет.
     */
    target(item, source, flip) {
        const dir = source.relativeTo(this.x, this.y)
        if (dir === -1) return null

        const matches = (item === this.sortItem) !== (this.spec.invert === true)

        if (matches === (this.enabled !== false)) {
            // Три подряд не выстраиваются: сортировщик не отдаёт такому же, приняв от такого же
            if (this.isSame(source) && this.isSame(this.nearby(dir))) return null
            return this.nearby(dir)
        }

        const a = this.nearby(mod(dir - 1, 4))
        const b = this.nearby(mod(dir + 1, 4))

        const takes = other => other !== null
            && !(other.spec.instantTransfer === true && source.spec.instantTransfer === true)
            && other.acceptItem(this, item)

        const ac = takes(a)
        const bc = takes(b)

        if (ac && !bc) return a
        if (bc && !ac) return b
        if (!bc) return null

        const to = (this.rotation & (1 << dir)) === 0 ? a : b
        if (flip) this.rotation ^= (1 << dir)

        return to
    }
}

/**
 * Ворота переполнения: прямо, а если впереди не берут — вбок.
 *
 * Недополнение (`underflow-gate`) — тот же класс с `invert`: у него всё наоборот, вбок
 * идёт всегда, а прямо только когда по бокам не берут.
 *
 * `OverflowGate.OverflowGateBuild`
 */
export class OverflowGateBuilding extends Building {
    acceptItem(source, item) {
        const to = this.target(item, source, false)
        return to !== null && to.team === this.team && to.acceptItem(this, item)
    }

    handleItem(source, item) {
        const to = this.target(item, source, true)
        if (to !== null) to.handleItem(this, item)
    }

    /** `OverflowGate.getTileTarget` */
    target(item, source, flip) {
        const from = this.relativeToEdge(source)
        if (from === -1) return null

        let to = this.nearby((from + 2) % 4)

        const instant = source.spec.instantTransfer === true
        const forward = to !== null && to.team === this.team
            && !(instant && to.spec.instantTransfer === true) && to.acceptItem(this, item)

        const inverted = (this.spec.invert === true) === (this.enabled !== false)

        if (forward && !inverted) return to

        const a = this.nearby(mod(from - 1, 4))
        const b = this.nearby(mod(from + 1, 4))

        const takes = other => other !== null && other.team === this.team
            && !(instant && other.spec.instantTransfer === true)
            && other.acceptItem(this, item)

        const ac = takes(a)
        const bc = takes(b)

        if (!ac && !bc) return inverted && forward ? to : null

        if (ac && !bc) {
            to = a
        } else if (bc && !ac) {
            to = b
        } else {
            to = (this.rotation & (1 << from)) === 0 ? a : b
            if (flip) this.rotation ^= (1 << from)
        }

        return to
    }
}

registerBuilders({
    Junction: JunctionBuilding,
    Sorter: SorterBuilding,
    OverflowGate: OverflowGateBuilding
})
