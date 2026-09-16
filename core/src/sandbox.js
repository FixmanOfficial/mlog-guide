/**
 * Блоки песочницы: бесконечный источник предметов и бездонная яма.
 *
 * В игре они лежат в `world/blocks/sandbox` и строятся только в песочнице
 * (`BuildVisibility.sandboxOnly`). Для учебника это самые полезные блоки во всей игре:
 * чтобы показать сортировщик, не нужны ни бур, ни руда под ним — хватит источника,
 * который выдаёт медь сто раз в секунду, и ямы, которая принимает что угодно.
 *
 * Жидкостных и энергетических собратьев (`LiquidSource`, `PowerSource`) здесь нет: ни
 * жидкостей, ни энергии в модели пока нет вовсе, см. `docs/parity.md`.
 */

import {Building, registerBuilders} from './world.js'
import {itemName} from './distribution.js'

/**
 * Источник предметов.
 *
 * Своего содержимого у него нет: на каждый выпуск он кладёт себе один предмет, отдаёт его
 * соседу и тут же обнуляет счётчик — `items.set(item, 1); dump(item); items.set(item, 0)`.
 * Поэтому источник не копит, не отдаёт двоим сразу и в `sensor @totalItems` всегда ноль.
 *
 * `ItemSource.ItemSourceBuild`
 */
export class ItemSourceBuilding extends Building {
    constructor(world, type, options) {
        super(world, type, options)

        // Настройка блока: что выдавать. `ItemSource.outputItem`
        this.outputItem = options.outputItem ?? null
        this.initial.outputItem = this.outputItem

        this.counter = 0
    }

    reset() {
        super.reset()

        this.outputItem = this.initial.outputItem
        this.counter = 0
    }

    /** Настройка предметом. `Building.config` */
    get configItem() {
        return this.outputItem
    }

    set configItem(item) {
        this.outputItem = itemName(item, this.outputItem)
    }

    /** Источник ничего не принимает: `ItemSource.acceptItem` возвращает ложь всегда. */
    acceptItem() {
        return false
    }

    /**
     * `ItemSource.updateTile`: копится время, и на каждые `60 / itemsPerSecond` тиков
     * выпускается один предмет. Цикл здесь именно `while`: при ускоренном времени за один
     * такт выпускается несколько.
     */
    update(delta = 1) {
        if (this.outputItem === null) return

        this.counter += delta * this.efficiency
        const limit = 60 / this.spec.itemsPerSecond

        while (this.counter >= limit) {
            this.handleStack(this.outputItem, 1)
            this.dump(this.outputItem)
            this.removeStack(this.outputItem, this.items?.get(this.outputItem) ?? 0)

            this.counter -= limit
        }
    }
}

/**
 * Бездонная яма: принимает что угодно и ничего не хранит.
 *
 * `ItemVoid.ItemVoidBuild`: принятое уходит в `flowItems` — счётчик потока, который в игре
 * рисует полоску в панели блока. Ни в `@totalItems`, ни в содержимом принятое не появляется.
 */
export class ItemVoidBuilding extends Building {
    constructor(world, type, options) {
        super(world, type, options)

        // Сколько всего проглочено: в игре это модуль потока, у нас счётчик для урока
        this.consumed = 0
    }

    reset() {
        super.reset()
        this.consumed = 0
    }

    acceptItem() {
        return this.enabled !== false
    }

    handleItem() {
        this.consumed++
    }
}

registerBuilders({ItemSource: ItemSourceBuilding, ItemVoid: ItemVoidBuilding})
