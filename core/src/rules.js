/**
 * Правила мира и флаги целей.
 *
 * `setrule` пишет сюда, `getflag`/`setflag` — в набор флагов. Флаги важны не только логике:
 * в игре это мостик к **целям** (`MapObjectives`) — системе редактора карт, где условие
 * `FlagObjective` просто проверяет, есть ли флаг в `state.rules.objectiveFlags`. То есть
 * процессор мира поднимает флаг, а цель его видит.
 *
 * Поэтому флаги живут здесь, а не внутри процессора: когда дойдут руки до целей, им понадобится
 * ровно этот набор. См. `docs/todo.md`, раздел про цели.
 */

/** Rules: значения по умолчанию для тех правил, которые пишет `setrule`. Rules.java */
export const DEFAULT_RULES = {
    waveTimer: true,
    waves: false,
    wave: 1,
    currentWaveTime: 0,
    waveSpacing: 60 * 60 * 2,
    waveSending: false,
    attackMode: false,
    enemyCoreBuildRadius: 400,
    dropZoneRadius: 300,
    unitCap: 0,
    lighting: false,
    canGameOver: true,
    ambientLight: 0,
    solarMultiplier: 1,
    dragMultiplier: 1,
    pauseDisabled: false,
    musicVolume: 1,
    buildSpeed: 1,
    unitHealth: 1,
    unitBuildSpeed: 1,
    unitMineSpeed: 1,
    unitCost: 1,
    unitDamage: 1,
    blockHealth: 1,
    blockDamage: 1,
    rtsMinWeight: 1,
    rtsMinSquad: 1,

    // Множитель, которым карта замедляет все свои таймеры целей разом
    objectiveTimerMultiplier: 1,

    // Разрешено ли обычному процессору управлять юнитами. Выключенное правило убирает
    // всю категорию `unit` из меню добавления — но только у обычного процессора
    logicUnitControl: true
}

/**
 * Правила мира. Значения хранятся как есть — процессор мира их и читает, и пишет,
 * а моделируем мы пока не все: `waveSpacing` без волн ни на что не влияет, но соврать
 * в ответе на `fetch` или на чтение хуже, чем сохранить число.
 */
export class Rules {
    constructor(overrides = {}) {
        this.values = {...DEFAULT_RULES, ...overrides}

        /** Rules.objectiveFlags: набор строк, общий с целями карты. */
        this.objectiveFlags = new Set()

        /*
         * Чья это партия и кто идёт волнами. В игре это `Team.sharded` и `Team.crux`,
         * и цели карты считают «своим» именно `defaultTeam`: его предметы, его юниты,
         * его постройки. Уничтожить нужно ядра `waveTeam`.
         */
        this.defaultTeam = overrides.defaultTeam ?? 1
        this.waveTeam = overrides.waveTeam ?? 2

        /** Правила, ограничивающие область карты. `setrule mapArea` пишет сюда. */
        this.mapArea = null

        /** Запрещённые к постройке блоки и юниты: `setrule ban` и `unban`. */
        this.banned = new Set()

        this.initial = {values: {...this.values}}
    }

    get(name) {
        return this.values[name]
    }

    set(name, value) {
        this.values[name] = value
        return this
    }

    flag(name) {
        return this.objectiveFlags.has(name)
    }

    /** `setflag`: игра трогает набор, только если состояние правда меняется. */
    setFlag(name, present) {
        if (present) this.objectiveFlags.add(name)
        else this.objectiveFlags.delete(name)
        return this
    }

    reset() {
        this.values = {...this.initial.values}
        this.objectiveFlags.clear()
        this.banned.clear()
        this.mapArea = null
        return this
    }
}
