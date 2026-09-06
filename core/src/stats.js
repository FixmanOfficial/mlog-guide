/**
 * Счётчики партии. `GameStats` в игре — десяток чисел, которые ведёт `Logic` по событиям:
 * сколько построено, сколько разрушено, сколько предметов доехало до ядра.
 *
 * Заведены они не ради статистики в конце игры, а ради **целей карты**: половина условий
 * `MapObjectives` читает именно отсюда. Комментарий в исходнике про `coreItemCount` стоит
 * прочесть целиком: счётчик легко обмануть разгрузчиком, и в игре им пользуются только
 * обучающие цели.
 */

/** Счётчик по ключу: в игре это `ObjectIntMap`, у нас обычный Map с нулём по умолчанию. */
class Counter extends Map {
    /** ObjectIntMap.increment */
    increment(key, amount = 1) {
        this.set(key, (this.get(key) ?? 0) + amount)
        return this
    }

    /** ObjectIntMap.get(key, 0) */
    at(key) {
        return this.get(key) ?? 0
    }
}

export class Stats {
    constructor() {
        this.reset()
    }

    reset() {
        /** Уничтожено юнитов не своей команды */
        this.enemyUnitsDestroyed = 0

        /** Пройдено волн */
        this.wavesLasted = 0

        /** Достроено и разобрано своих зданий */
        this.buildingsBuilt = 0
        this.buildingsDeconstructed = 0

        /** Разрушено своих зданий */
        this.buildingsDestroyed = 0

        /** Создано юнитов любым способом */
        this.unitsCreated = 0

        /** Поставлено блоков по видам. Ведётся только для целей карты */
        this.placedBlockCount = new Counter()

        /** Разрушено чужих блоков по видам */
        this.destroyedBlockCount = new Counter()

        /** Предметов, доехавших до ядра **транспортом**, по видам */
        this.coreItemCount = new Counter()

        return this
    }

    /** GameStats.getPlaced */
    getPlaced(block) {
        return this.placedBlockCount.at(block)
    }

    /** GameStats.getDestroyed */
    getDestroyed(block) {
        return this.destroyedBlockCount.at(block)
    }
}
