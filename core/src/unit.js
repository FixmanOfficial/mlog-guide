/**
 * Модель юнита: то, что видно логике через `ubind`, `ucontrol` и `sensor`.
 *
 * Главное, что нужно понять про управление юнитами в mlog: `ucontrol` никого никуда
 * не двигает. Он записывает поля в `LogicAI` — контроллер, который игра подставляет юниту
 * вместо обычного ИИ, — а движение считает уже сам юнит, каждый тик, своей физикой.
 * Отсюда все особенности: команда «идти» действует, пока её не отменят; юнит проскакивает
 * цель и возвращается; отпущенный юнит через десять секунд уходит из-под контроля.
 *
 * Цепочка движения перенесена целиком, потому что срезать в ней нечего:
 *
 *   LogicAI.updateMovement -> AIController.moveTo -> UnitComp.movePref
 *     -> UnitComp.moveAt (набор скорости) -> VelComp.update (перенос и трение)
 *
 * Координаты внутри — мировые единицы, как в игре: восемь на тайл. Наружу, в `sensor`,
 * они уходят поделёнными на восемь (`World.conv`), поэтому там дробные значения — норма.
 */

import {Vec2, clamp, moveToward, approach} from './arc.js'
import {NOT_SENSED} from './sense.js'
import specs from '../data/unit-specs.json' with {type: 'json'}
import blockSpecs from '../data/block-specs.json' with {type: 'json'}

/*
 * Округление до float стоит там же, где в Java происходит присваивание во float. В движении
 * это важнее, чем кажется: скорость складывается тысячами шагов, и разница в младшем разряде
 * за минуту разъезжается в заметный сдвиг.
 */
const f = Math.fround

/** Vars.tilesize */
export const TILE_SIZE = 8

/**
 * Спеки юнитов. Сняты дампом из запущенной игры (`tools/gen-dump.mjs`), уже после
 * `UnitType.init()` — то есть с выведенными дальностью и вместимостью, которых в исходнике
 * нет ни одним числом.
 */
export const UNIT_SPECS = specs.units

/** LogicAI.logicControlTimeout: без новых команд юнит возвращается своему ИИ через 10 секунд. */
export const LOGIC_CONTROL_TIMEOUT = 600

/** LogicAI.transferDelay: полторы секунды между передачами предметов. */
export const TRANSFER_DELAY = 90

/** UnitComp.isFlying / isGrounded: между ними есть зазор, и он не случайный. */
export const FLYING_ELEVATION = 0.09
export const GROUNDED_ELEVATION = 0.001

/** GlobalVars: @ctrlProcessor, @ctrlPlayer, @ctrlCommand. */
export const CTRL_PROCESSOR = 1
export const CTRL_PLAYER = 2
export const CTRL_COMMAND = 3

/** World.conv: мировые единицы в тайлы. */
export const conv = (value) => value / TILE_SIZE

/** World.unconv: тайлы в мировые единицы. */
export const unconv = (value) => value * TILE_SIZE

/**
 * Контроллер, который `ucontrol` вешает на юнита. Поля тут — это и есть весь протокол
 * между процессором и юнитом.
 */
export class LogicAI {
    constructor(controller = null) {
        this.control = 'idle'
        this.moveX = 0
        this.moveY = 0
        this.moveRad = 0
        this.controlTimer = LOGIC_CONTROL_TIMEOUT
        this.targetTimer = 0
        this.controller = controller
        this.boost = false
        this.shoot = false
        this.aimControl = 'stop'
        this.mainTarget = null
        this.posTarget = {x: 0, y: 0}
        this.plan = null
    }

    /** AIController.prefSpeed */
    prefSpeed(unit) {
        return unit.speed()
    }

    /**
     * AIController.moveTo. `circleLength` — расстояние, на котором надо остановиться,
     * `smooth` — на скольких единицах перед ним гасить скорость. Отрицательная длина
     * означает «слишком близко»: с keepDistance юнит разворачивается, без него стоит.
     */
    moveTo(unit, targetX, targetY, circleLength, smooth = 100, keepDistance = unit.isFlying(), delta = 1) {
        const speed = this.prefSpeed(unit)
        const vec = new Vec2(targetX, targetY).sub(unit.x, unit.y)

        const distance = unit.dst(targetX, targetY)
        const length = circleLength <= 0.001 ? 1 : clamp(f(f(distance - circleLength) / smooth), -1, 1)

        vec.setLength(f(speed * length))

        if (length < -0.5) {
            if (keepDistance) vec.rotate(180)
            else vec.setZero()
        } else if (length < 0) {
            vec.setZero()
        }

        // Негодные значения игнорируются: иначе NaN разошёлся бы по позиции навсегда
        if (vec.isNaN() || vec.isInfinite() || vec.isZero()) return

        unit.movePref(vec, delta)
    }

    /** LogicAI.updateMovement, вызывается раз в тик после физики. */
    update(unit, delta = 1) {
        if (this.targetTimer > 0) this.targetTimer -= delta
        else this.targetTimer = 40

        // Таймаут: процессор должен подтверждать команду, иначе юнит уходит из-под контроля
        if (this.controlTimer > 0 && this.controller !== null) {
            this.controlTimer -= delta
        } else {
            unit.resetController()
            return
        }

        switch (this.control) {
            case 'move':
                this.moveTo(unit, this.moveX, this.moveY, 1, 30, unit.isFlying(), delta)
                break

            case 'approach':
                this.moveTo(unit, this.moveX, this.moveY, this.moveRad - 7, 7, true, delta)
                break

            case 'pathfind':
                // Летающие идут напрямую; наземным игра ищет путь через ControlPathfinder,
                // которого у нас нет, поэтому они тоже идут напрямую. См. docs/parity.md
                this.moveTo(unit, this.moveX, this.moveY, 1, 30, unit.isFlying(), delta)
                break

            case 'stop':
                unit.clearBuilding()
                break

            // idle и autoPathfind движения не задают: первый ничего не делает,
            // второму нужны ядра и волны, которых в песочнице нет
        }

        if (unit.spec.canBoost && !unit.spec.flying) {
            const target = this.boost ? 1 : 0
            const speed = this.boost ? unit.spec.riseSpeed : unit.spec.descentSpeed
            unit.elevation = approach(unit.elevation, target, f(speed * delta))
        }

        // Некуда целиться — смотрим туда, куда летим
        if (!this.shoot || !unit.spec.omniMovement) unit.lookAt(unit.prefRotation(), delta)
    }
}

export class Unit {
    constructor(world, type, {x = 0, y = 0, team = 1, rotation = 90, elevation = null, id = 0} = {}) {
        const spec = UNIT_SPECS[type]
        if (spec === undefined) throw new Error(`неизвестный тип юнита: ${type}`)

        this.world = world
        this.type = type
        this.spec = spec
        this.id = id

        this.x = x
        this.y = y
        this.vel = new Vec2()
        this.rotation = rotation
        this.elevation = elevation ?? (spec.flying ? 1 : 0)

        this.team = team
        this.maxHealth = spec.health
        this.health = spec.health
        this.flag = 0
        this.dead = false

        this.item = null
        this.itemAmount = 0
        this.mineTile = null
        this.plan = null

        this.drag = spec.drag
        this.controller = null

        this.initial = {x, y, rotation, elevation: this.elevation, health: this.health}
    }

    /** Возвращает юнита в исходное состояние: перемотка прогоняет мир заново. */
    reset() {
        this.x = this.initial.x
        this.y = this.initial.y
        this.rotation = this.initial.rotation
        this.elevation = this.initial.elevation
        this.health = this.initial.health
        this.vel.setZero()
        this.drag = this.spec.drag
        this.flag = 0
        this.dead = false
        this.item = null
        this.itemAmount = 0
        this.mineTile = null
        this.plan = null
        this.controller = null
        return this
    }

    isFlying() {
        return this.elevation >= FLYING_ELEVATION
    }

    isGrounded() {
        return this.elevation < GROUNDED_ELEVATION
    }

    /**
     * Пол под юнитом. Летящий и парящий его не касаются — для них это воздух, у которого
     * множители единичны. UnitComp.floorSpeedMultiplier
     */
    floorOn() {
        if (this.world === null || this.isFlying() || this.spec.hovering) return null

        const name = this.world.floorAt(Math.round(conv(this.x)), Math.round(conv(this.y)))
        return name === null ? null : blockSpecs.blocks[name] ?? null
    }

    /**
     * UnitComp.speed. Штраф за движение боком получает только игрок, поэтому остаются
     * скорость типа, надбавка за подъём и пол: по мелкой воде юнит ползёт вдвое медленнее,
     * а по глубокой впятеро.
     */
    speed() {
        // Mathf.lerp(1, boostMultiplier, elevation)
        const boost = this.spec.canBoost
            ? f(1 + f(f(this.spec.boostMultiplier - 1) * this.elevation))
            : 1

        const floor = this.floorOn()
        const surface = floor === null
            ? 1
            : f(Math.pow(floor.speedMultiplier ?? 1, this.spec.floorMultiplier))

        return f(f(this.spec.speed * boost) * surface)
    }

    /**
     * UnitComp.range — это `maxRange` типа, а не `range`. Они разные: первый складывается как
     * максимум по оружию, второй как минимум. У поли, например, 196 против 130.
     */
    range() {
        return this.spec.maxRange
    }

    dst(x, y) {
        return f(Math.sqrt(this.dst2(x, y)))
    }

    dst2(x, y) {
        const dx = f(this.x - x)
        const dy = f(this.y - y)
        return f(f(dx * dx) + f(dy * dy))
    }

    within(x, y, distance) {
        return this.dst2(x, y) < f(distance * distance)
    }

    moving() {
        return !this.vel.isZero(0.01)
    }

    /** UnitComp.movePref: всенаправленные набирают скорость в любую сторону, прочие поворачивают. */
    movePref(vector, delta = 1) {
        if (this.spec.omniMovement) this.moveAt(vector, this.spec.accel, delta)
        else this.rotateMove(vector, delta)
    }

    /**
     * UnitComp.moveAt: не «поставить скорость», а приблизить её к заданной. Шаг ограничен
     * `accel * длина вектора * delta`, поэтому разгон зависит и от того, как далеко цель.
     */
    moveAt(vector, acceleration = this.spec.accel, delta = 1) {
        const step = new Vec2(vector.x, vector.y).sub(this.vel)
        step.limit(f(f(acceleration * vector.len()) * delta))
        this.vel.add(step)
    }

    /** UnitComp.rotateMove: наземный юнит едет только вперёд и доворачивает на месте. */
    rotateMove(vector, delta = 1) {
        this.moveAt(new Vec2().trns(this.rotation, vector.len()), this.spec.accel, delta)

        if (!vector.isZero()) {
            this.rotation = moveToward(this.rotation, vector.angle(), f(this.spec.rotateSpeed * delta))
        }
    }

    lookAt(angle, delta = 1) {
        this.rotation = moveToward(this.rotation, angle, f(this.spec.rotateSpeed * delta))
    }

    angleTo(x, y) {
        return new Vec2(x, y).sub(this.x, this.y).angle()
    }

    /** UnitComp.prefRotation: копает — смотрит на руду, иначе по движению. */
    prefRotation() {
        if (this.mineTile !== null) return this.angleTo(unconv(this.mineTile.x), unconv(this.mineTile.y))
        if (this.moving() && this.spec.omniMovement) return this.vel.angle()
        return this.rotation
    }

    clearBuilding() {
        this.plan = null
    }

    resetController() {
        this.controller = null
    }

    /**
     * Тик юнита. Порядок взят из игры и он неочевиден: скорость переносит юнита и гасится
     * трением ещё до того, как контроллер что-то решит, — у `VelComp.update` приоритет -1.
     * Поэтому команда, отданная в этом тике, сдвинет юнита только в следующем.
     */
    update(delta = 1) {
        this.x = f(this.x + f(this.vel.x * delta))
        this.y = f(this.y + f(this.vel.y * delta))
        this.vel.scl(Math.max(f(1 - f(this.drag * delta)), 0))

        // Трение тоже зависит от пола, и считается оно уже после переноса: в игре
        // UnitComp.update идёт после VelComp.update
        const floor = this.isGrounded() ? this.floorOn() : null
        this.drag = f(this.spec.drag * (floor?.dragMultiplier ?? 1))

        if (this.controller !== null) this.controller.update(this, delta)
    }

    /** UnitComp.sense. Координаты уходят в тайлах, скорость — в тайлах за секунду. */
    sense(property) {
        switch (property) {
            case 'totalItems': return this.itemAmount
            case 'itemCapacity': return this.spec.itemCapacity
            case 'rotation': return this.rotation
            case 'health': return this.health
            case 'maxHealth': return this.maxHealth
            case 'shield': return 0
            case 'armor': return this.spec.armor
            case 'flying': return this.isFlying() ? 1 : 0
            case 'boosting': return this.spec.canBoost && this.isFlying() ? 1 : 0
            case 'x': return conv(this.x)
            case 'y': return conv(this.y)
            case 'velocityX': return this.vel.x * 60 / TILE_SIZE
            case 'velocityY': return this.vel.y * 60 / TILE_SIZE
            case 'dead': return this.dead ? 1 : 0
            case 'team': return this.team
            case 'shooting': return 0
            case 'range': return this.range() / TILE_SIZE
            case 'mining': return this.mineTile !== null ? 1 : 0
            case 'mineX': return this.mineTile !== null ? this.mineTile.x : -1
            case 'mineY': return this.mineTile !== null ? this.mineTile.y : -1
            case 'buildX': return this.plan !== null ? this.plan.x : -1
            case 'buildY': return this.plan !== null ? this.plan.y : -1
            case 'flag': return this.flag
            case 'speed': return this.spec.speed * 60 / TILE_SIZE
            case 'size': return this.spec.hitSize / TILE_SIZE
            case 'payloadCount': return 0
            case 'controlled': return this.controller instanceof LogicAI ? CTRL_PROCESSOR : 0
            default: return NaN
        }
    }

    /** UnitComp.senseObject */
    senseObject(property) {
        switch (property) {
            case 'type': return this.content ?? null
            case 'firstItem': return this.itemAmount === 0 ? null : this.item
            case 'controller': return this.controller instanceof LogicAI
                ? this.controller.controller
                : this
            default: return NOT_SENSED
        }
    }
}
