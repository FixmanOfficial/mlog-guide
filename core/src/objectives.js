/**
 * Цели карты — `MapObjectives`.
 *
 * Это система редактора карт, а не логики, но связана с ней в двух местах: условие
 * `FlagObjective` читает тот же набор флагов, что поднимает `setflag`, а метки у целей —
 * те же классы, что заводит `makemarker`. Поэтому и флаги, и метки живут в мире, а цели
 * лежат рядом с ними.
 *
 * Устройство простое: у цели есть `update`, который каждый тик отвечает «выполнена или нет»,
 * и `done`, который срабатывает **один раз** — снимает и ставит флаги и запускает свой кусок
 * кода. Цепочка задаётся родителями: пока родитель не выполнен, потомок даже не проверяется.
 *
 * Текста для пользователя здесь нет: `describe` отдаёт ключ строки игры и числа к нему,
 * а собирает строку страница. Ключи сняты в `core/data/i18n/<локаль>.json`.
 */

import {runLogicScript} from './script.js'

/** MapObjective: общее у всех тринадцати условий. */
export class MapObjective {
    constructor(options = {}) {
        /** Скрытая цель не показывается в списке, но проверяется */
        this.hidden = options.hidden ?? false

        /** Подробности, которые в игре раскрываются щелчком */
        this.details = options.details ?? null

        /** Программа, которую цель запускает, когда выполнится */
        this.completionLogicCode = options.completionLogicCode ?? null

        this.flagsAdded = options.flagsAdded ?? []
        this.flagsRemoved = options.flagsRemoved ?? []

        /** Метки цели: те же классы, что у `makemarker`, рисуются, пока цель работает */
        this.markers = options.markers ?? []

        this.parents = []

        // Потомки живут здесь только до `add`: исполнитель разворачивает их в общий список
        this.children = []

        this.completed = false
        this.depFinished = false
    }

    /** @return выполнена ли цель. Проверяется каждый тик, пока цель работает */
    update() {
        return false
    }

    /** Сброс внутреннего состояния. В игре это нужно одному таймеру */
    reset() {}

    /**
     * Вызывается один раз, когда `update` ответил «да». Флаги снимаются раньше, чем ставятся:
     * одна цель может убрать флаг и тут же поставить его обратно, и порядок тут не случайный.
     */
    done(world) {
        for (const flag of this.flagsRemoved) world.rules.objectiveFlags.delete(flag)
        for (const flag of this.flagsAdded) world.rules.objectiveFlags.add(flag)

        this.completed = true

        runLogicScript(this.completionLogicCode, {
            world, content: world.content, globals: world.content?.globals
        })

        return this
    }

    /** Все родители выполнены. Ответ запоминается: обратно эта проверка не отыгрывает */
    dependencyFinished() {
        if (this.depFinished) return true
        for (const parent of this.parents) if (!parent.completed) return false

        this.depFinished = true
        return true
    }

    /** Работает ли цель сейчас */
    qualified() {
        return !this.completed && this.dependencyFinished()
    }

    /** Цепочка: `child` начнёт проверяться только после этой цели */
    child(child) {
        child.parents.push(this)
        this.children.push(child)
        return this
    }

    parent(parent) {
        this.parents.push(parent)
        return this
    }

    /**
     * Вид цели. В игре это имя класса без «Objective», строчными: по нему собирается
     * и ключ строки `objective.<вид>.name`, и запись цели в файле карты.
     */
    get kind() {
        return this.constructor.kind
    }

    /** Ключ строки игры и числа к нему. Текст собирает страница */
    describe() {
        return {key: null}
    }
}

/** Исследовать контент. У нас дерева технологий нет: набор открытого лежит в мире */
export class ResearchObjective extends MapObjective {
    static kind = 'research'

    constructor(content = 'copper', options = {}) {
        super(options)
        this.content = content
    }

    update(world) {
        return world.unlocked.has(this.content)
    }

    describe() {
        return {key: 'objective.research', content: this.content}
    }
}

/** Произвести контент. В игре это то же самое условие, что исследование, с другой строкой */
export class ProduceObjective extends ResearchObjective {
    static kind = 'produce'

    describe() {
        return {key: 'objective.produce', content: this.content}
    }
}

/** Иметь столько-то предмета в ядре команды */
export class ItemObjective extends MapObjective {
    static kind = 'item'

    constructor(item = 'copper', amount = 1, options = {}) {
        super(options)
        this.item = item
        this.amount = amount
    }

    have(world) {
        return world.core(world.rules.defaultTeam)?.items?.get(this.item) ?? 0
    }

    update(world) {
        return this.have(world) >= this.amount
    }

    describe(world) {
        return {key: 'objective.item', item: this.item, amount: this.amount, have: this.have(world)}
    }
}

/**
 * Переместить в ядро транспортом. Считает не запас, а сколько предметов **доехало**:
 * положенное в ядро руками не в счёт, зато счётчик легко накрутить разгрузчиком —
 * об этом в игре стоит отдельный комментарий.
 */
export class CoreItemObjective extends MapObjective {
    static kind = 'coreitem'

    constructor(item = 'copper', amount = 2, options = {}) {
        super(options)
        this.item = item
        this.amount = amount
    }

    update(world) {
        return world.stats.coreItemCount.at(this.item) >= this.amount
    }

    describe(world) {
        return {
            key: 'objective.coreitem', item: this.item, amount: this.amount,
            have: world.stats.coreItemCount.at(this.item)
        }
    }
}

/** Построить столько-то блоков этого вида */
export class BuildCountObjective extends MapObjective {
    static kind = 'buildcount'

    constructor(block = 'conveyor', count = 1, options = {}) {
        super(options)
        this.block = block
        this.count = count
    }

    update(world) {
        return world.stats.getPlaced(this.block) >= this.count
    }

    describe(world) {
        return {
            key: 'objective.build', block: this.block, count: this.count,
            left: this.count - world.stats.getPlaced(this.block)
        }
    }
}

/** Иметь столько-то юнитов этого типа */
export class UnitCountObjective extends MapObjective {
    static kind = 'unitcount'

    constructor(unit = 'dagger', count = 1, options = {}) {
        super(options)
        this.unit = unit
        this.count = count
    }

    have(world) {
        return world.unitsOf(world.rules.defaultTeam, this.unit).length
    }

    update(world) {
        return this.have(world) >= this.count
    }

    describe(world) {
        return {
            key: 'objective.buildunit', unit: this.unit, count: this.count,
            left: this.count - this.have(world)
        }
    }
}

/** Уничтожить столько-то чужих юнитов */
export class DestroyUnitsObjective extends MapObjective {
    static kind = 'destroyunits'

    constructor(count = 1, options = {}) {
        super(options)
        this.count = count
    }

    update(world) {
        return world.stats.enemyUnitsDestroyed >= this.count
    }

    describe(world) {
        return {
            key: 'objective.destroyunits', count: this.count,
            left: this.count - world.stats.enemyUnitsDestroyed
        }
    }
}

/**
 * Продержаться столько-то времени. Единственная цель со своим состоянием, и потому
 * единственная, у которой `reset` что-то делает.
 *
 * Срок множится на правило `objectiveTimerMultiplier` — им карта замедляет все свои таймеры
 * разом, не трогая сами цели.
 */
export class TimerObjective extends MapObjective {
    static kind = 'timer'

    constructor(duration = 60 * 30, options = {}) {
        super(options)
        this.duration = duration
        this.countup = 0
    }

    update(world, delta = 1) {
        this.countup += delta
        return this.countup >= this.duration * world.rules.get('objectiveTimerMultiplier')
    }

    reset() {
        this.countup = 0
    }

    describe(world) {
        const total = this.duration * world.rules.get('objectiveTimerMultiplier')

        // В игре здесь считаются секунды и собирается строка «м:сс» — это дело страницы
        return {key: 'objective.timer', left: Math.max(0, total - this.countup), duration: total}
    }
}

/**
 * Уничтожить блок в клетке. Условие проверяет не разрушение, а несовпадение: цель выполнена,
 * если в клетке пусто **или** стоит что-то другое, или блок сменил команду.
 */
export class DestroyBlockObjective extends MapObjective {
    static kind = 'destroyblock'

    constructor(block = 'router', x = 0, y = 0, team = 2, options = {}) {
        super(options)
        this.block = block
        this.x = x
        this.y = y
        this.team = team
    }

    gone(world) {
        const building = world.at(this.x, this.y)
        return building === undefined || building.team !== this.team || building.type !== this.block
    }

    update(world) {
        return this.gone(world)
    }

    describe() {
        return {key: 'objective.destroyblock', block: this.block}
    }
}

/** То же самое списком клеток: цель выполнена, когда убраны все */
export class DestroyBlocksObjective extends MapObjective {
    static kind = 'destroyblocks'

    constructor(block = 'router', team = 2, positions = [], options = {}) {
        super(options)
        this.block = block
        this.team = team
        this.positions = positions
    }

    progress(world) {
        let count = 0

        for (const [x, y] of this.positions) {
            const building = world.at(x, y)
            if (building === undefined || building.team !== this.team || building.type !== this.block) count++
        }

        return count
    }

    update(world) {
        return this.progress(world) >= this.positions.length
    }

    describe(world) {
        return {
            key: 'objective.destroyblocks', block: this.block,
            done: this.progress(world), total: this.positions.length
        }
    }
}

/** Уничтожить все ядра команды волн */
export class DestroyCoreObjective extends MapObjective {
    static kind = 'destroycore'

    update(world) {
        return world.cores(world.rules.waveTeam).length === 0
    }

    describe() {
        return {key: 'objective.destroycore'}
    }
}

/**
 * Отдать команду юниту. Проверяется по выделению игрока, а без интерфейса выполняется сразу:
 * `return headless || ...`. У нас интерфейса игры нет вовсе, значит всегда сразу.
 */
export class CommandModeObjective extends MapObjective {
    static kind = 'commandmode'

    update() {
        return true
    }

    describe() {
        return {key: 'objective.command'}
    }
}

/** Дождаться флага. Тот самый мостик к процессору мира: флаг поднимает `setflag` */
export class FlagObjective extends MapObjective {
    static kind = 'flag'

    constructor(flag = 'flag', options = {}) {
        super(options)
        this.flag = flag
    }

    update(world) {
        return world.rules.objectiveFlags.has(this.flag)
    }

    describe() {
        return {key: 'objective.flag', flag: this.flag}
    }
}

/** Имена видов, в порядке `registerObjective`: он же порядок списка в редакторе карт */
export const OBJECTIVE_TYPES = {
    research: ResearchObjective,
    produce: ProduceObjective,
    item: ItemObjective,
    coreItem: CoreItemObjective,
    buildCount: BuildCountObjective,
    unitCount: UnitCountObjective,
    destroyUnits: DestroyUnitsObjective,
    timer: TimerObjective,
    destroyBlock: DestroyBlockObjective,
    destroyBlocks: DestroyBlocksObjective,
    destroyCore: DestroyCoreObjective,
    commandMode: CommandModeObjective,
    flag: FlagObjective
}

/**
 * Исполнитель целей. Держит их плоским списком: дерево задаётся ссылками на родителей,
 * а `add` разворачивает потомков в тот же список — в игре это `flatten`.
 */
export class Objectives {
    constructor() {
        this.all = []
    }

    /** Потомки добавляются раньше родителя, как в `MapObjectives.flatten` */
    add(...objectives) {
        for (const objective of objectives) this.flatten(objective)
        return this
    }

    flatten(objective) {
        for (const child of objective.children) this.flatten(child)

        objective.children.length = 0
        this.all.push(objective)
        return this
    }

    get(index) {
        return index < 0 || index >= this.all.length ? null : this.all[index]
    }

    /** Есть ли хоть одна работающая цель: по этому игра решает, показывать ли список */
    any() {
        return this.all.some(objective => objective.qualified())
    }

    clear() {
        this.all = []
        return this
    }

    running() {
        return this.all.filter(objective => objective.qualified())
    }

    /**
     * Один тик. В `Logic.update` цели проверяются **до** юнитов и зданий, то есть до
     * процессоров: флаг, поднятый программой в этом тике, цель увидит только в следующем.
     */
    update(world, delta = 1) {
        for (const objective of this.running()) {
            if (objective.update(world, delta)) objective.done(world)
        }

        return this
    }

    /** Метки работающих целей. Рисуются раньше общих: `Renderer.draw` идёт в этом порядке */
    markers() {
        return this.running().flatMap(objective => objective.markers)
    }

    /**
     * Перемотка мира. Игровой `reset` у цели чистит только своё состояние, а выполненность
     * снимается вместе с загрузкой партии — у нас это одно и то же действие.
     */
    reset() {
        for (const objective of this.all) {
            objective.completed = false
            objective.depFinished = false
            objective.reset()
        }

        return this
    }
}
