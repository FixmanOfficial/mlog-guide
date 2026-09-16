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
    logicUnitControl: true,

    /*
     * Режим песочницы. `Gamemode.sandbox` — это ровно `infiniteResources = true`:
     * постройка не списывает ресурсы и ставится с любого расстояния. Вместе с
     * `instantBuild` она ещё и мгновенна — `BuilderComp` проверяет оба правила сразу.
     */
    infiniteResources: false,
    instantBuild: false,

    /*
     * Множитель стоимости постройки. Логикой он не меняется — в `LogicRule` его нет, —
     * но читается: `Block.sense(Content)` считает им цену блока, которую спрашивают
     * у типа (`sensor цена @duo @copper`). Rules.java
     */
    buildCostMultiplier: 1
}

/**
 * Множители, которые в игре принадлежат не миру, а **команде**: `Rules.teams` — это
 * `TeamRule` на каждую сторону, и `setrule` для них берёт команду из третьего поля.
 * В редакторе игры оно так и подписано — «of», и по умолчанию там стоит `@sharded`.
 *
 * Здесь же лежат зажимы из `SetRuleI`: живучесть не опускается ниже тысячной, чтобы
 * деление на неё не давало бесконечность, а скорость стройки сверху ограничена полусотней.
 * LExecutor.SetRuleI:1837-1854
 */
export const TEAM_RULES = {
    buildSpeed: {value: 1, min: 0.001, max: 50},
    unitHealth: {value: 1, min: 0.001},
    unitBuildSpeed: {value: 1, min: 0, max: 50},
    unitMineSpeed: {value: 1, min: 0},
    unitCost: {value: 1, min: 0},
    unitDamage: {value: 1, min: 0},
    blockHealth: {value: 1, min: 0.001},
    blockDamage: {value: 1, min: 0},
    rtsMinWeight: {value: 1},
    rtsMinSquad: {value: 1, integer: true}
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
         * Чья это игра и кто идёт волнами. В игре это `Team.sharded` и `Team.crux`,
         * и цели карты считают «своим» именно `defaultTeam`: его предметы, его юниты,
         * его постройки. Уничтожить нужно ядра `waveTeam`.
         */
        this.defaultTeam = overrides.defaultTeam ?? 1
        this.waveTeam = overrides.waveTeam ?? 2

        /** Правила, ограничивающие область карты. `setrule mapArea` пишет сюда. */
        this.mapArea = null

        /** Запрещённые к постройке блоки и юниты: `setrule ban` и `unban`. */
        this.banned = new Set()

        /** `Rules.teams`: множители каждой команды. Номер команды — ключ. */
        this.teams = new Map()

        this.initial = {values: {...this.values}}
    }

    get(name) {
        return this.values[name]
    }

    set(name, value) {
        this.values[name] = value
        return this
    }

    /** Множитель команды: своё значение, если его ставили, иначе общее по умолчанию. */
    teamRule(team, name) {
        return this.teams.get(team)?.[name] ?? TEAM_RULES[name].value
    }

    /** `SetRuleI`: значение зажимается по правилам самой игры, каждое по-своему. */
    setTeamRule(team, name, value) {
        const limits = TEAM_RULES[name]
        if (limits === undefined) return this

        let result = value
        if (limits.min !== undefined) result = Math.max(result, limits.min)
        if (limits.max !== undefined) result = Math.min(result, limits.max)
        if (limits.integer === true) result = Math.trunc(result)

        const own = this.teams.get(team) ?? {}
        own[name] = result
        this.teams.set(team, own)

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
        this.teams.clear()
        this.mapArea = null
        return this
    }
}
