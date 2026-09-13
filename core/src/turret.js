/**
 * Турели и пули.
 *
 * Перенос `world/blocks/defense/turrets/Turret.java` и `ItemTurret.java`: наведение,
 * перезарядка, патроны и выстрел. Числа целиком из выгрузки — дальность, время перезарядки,
 * скорость поворота, конус стрельбы, таблица «предмет → пуля». Своих коэффициентов здесь нет.
 *
 * Зачем это движку: `control shoot` и `control shootp` — две из пяти команд, которыми логика
 * вообще умеет управлять блоками, и без турели урок про них был бы рассказом на словах.
 *
 * Чего сознательно нет: эффектов, звука, отдачи, разброса по стволам, зарядки перед
 * выстрелом, наведения ракет. Пуля летит прямо и попадает в первого, кого встретила.
 */

import {Building, registerBuilders} from './world.js'
import {conv, unconv} from './unit.js'
import {angleDist, mod} from './arc.js'

/** Turret.logicControlCooldown: столько тиков турель слушается логики, а не своего прицела. */
export const LOGIC_CONTROL_COOLDOWN = 120

/**
 * Пуля. `entities/bullet/BulletType` в той части, которая видна со стороны логики.
 *
 * Летит по прямой с постоянной скоростью, живёт `lifetime` тиков и исчезает при первом
 * попадании. Урон по площади есть, самонаведения нет.
 */
export class Bullet {
    constructor(world, {x, y, angle, type, team, owner = null}) {
        this.world = world
        this.x = x
        this.y = y
        this.angle = angle
        this.type = type
        this.team = team
        this.owner = owner
        this.time = 0
        this.dead = false
    }

    /** Скорость пули — в мировых единицах за тик, как у игры. */
    update(delta) {
        if (this.dead) return

        const speed = this.type.speed * delta
        const radians = this.angle * Math.PI / 180

        this.x += Math.cos(radians) * speed
        this.y += Math.sin(radians) * speed
        this.time += delta

        if (this.time >= this.type.lifetime) {
            this.dead = true
            return
        }

        if (!this.world.inside(conv(this.x), conv(this.y))) {
            this.dead = true
            return
        }

        this.collide()
    }

    /** Первый, кого задело. Юниты проверяются раньше зданий, как в `Bullet.update`. */
    collide() {
        const radius = this.type.hitSize / 2

        if (this.type.collidesGround || this.type.collidesAir) {
            for (const unit of this.world.units) {
                if (unit.dead || unit.team === this.team) continue
                if (!this.type.collidesAir && unit.spec.flying) continue
                if (!this.type.collidesGround && !unit.spec.flying) continue

                const reach = radius + unit.spec.hitSize / 2
                if (Math.hypot(unit.x - this.x, unit.y - this.y) > reach) continue

                unit.damage(this.type.damage)
                this.hit()
                return
            }
        }

        const building = this.world.at(Math.round(conv(this.x)), Math.round(conv(this.y)))
        if (building !== undefined && building.team !== this.team) {
            building.damage(this.type.damage)
            this.hit()
        }
    }

    /** Попадание: урон по площади, если он есть, и конец полёта. */
    hit() {
        this.dead = true

        const {splashDamage, splashDamageRadius} = this.type
        if (splashDamage <= 0 || splashDamageRadius <= 0) return

        for (const unit of this.world.units) {
            if (unit.dead || unit.team === this.team) continue
            if (Math.hypot(unit.x - this.x, unit.y - this.y) > splashDamageRadius) continue

            unit.damage(splashDamage)
        }
    }
}

/**
 * Турель, стреляющая предметами. `ItemTurret`
 *
 * Патроны лежат стопкой: каждый принятый предмет добавляет `ammoMultiplier` единиц к своей
 * записи и передвигает её наверх, а стреляет турель всегда верхней. Поэтому подвезённый
 * графит начинает тратиться раньше лежавшей меди.
 */
export class TurretBuilding extends Building {
    constructor(world, type, options = {}) {
        super(world, type, options)

        const turret = this.spec.turret ?? {}

        this.turret = turret
        this.ammoTypes = turret.ammo ?? {}

        /** Стопка патронов: `[{item, amount}]`, верхняя запись — последняя. `ItemTurret.ammo` */
        this.ammo = []
        this.totalAmmo = 0

        this.reloadCounter = 0
        this.rotation = options.rotation ?? 90
        this.target = null
        this.targetPos = {x: this.x * 8, y: this.y * 8}
        this.isShooting = false

        this.logicControlTime = -1
        this.logicShooting = false

        // Патроны, положенные картой: удобно ставить турель сразу заряженной
        for (const [item, amount] of Object.entries(options.ammo ?? {})) {
            for (let i = 0; i < amount; i++) this.handleItem(this, item)
        }

        this.initial.ammo = this.ammo.map(entry => ({...entry}))
        this.initial.totalAmmo = this.totalAmmo
        this.initial.turretRotation = this.rotation
    }

    reset() {
        super.reset()

        this.ammo = this.initial.ammo.map(entry => ({...entry}))
        this.totalAmmo = this.initial.totalAmmo
        this.rotation = this.initial.turretRotation
        this.reloadCounter = 0
        this.target = null
        this.isShooting = false
        this.logicControlTime = -1
        this.logicShooting = false
    }

    /** Середина турели в мировых единицах: у блока 2×2 она смещена на полклетки. */
    get worldX() {
        return unconv(this.x) + (this.size % 2 === 0 ? 4 : 0)
    }

    get worldY() {
        return unconv(this.y) + (this.size % 2 === 0 ? 4 : 0)
    }

    /** `ItemTurret.acceptItem`: патрон подходящий и стопка не переполнена. */
    acceptItem(source, item) {
        const type = this.ammoTypes[item]
        return type !== undefined && this.totalAmmo + type.ammoMultiplier <= this.turret.maxAmmo
    }

    /** `ItemTurret.handleItem`: запись своего предмета всплывает наверх стопки. */
    handleItem(source, item) {
        const type = this.ammoTypes[item]
        if (type === undefined) return

        this.totalAmmo += type.ammoMultiplier

        const index = this.ammo.findIndex(entry => entry.item === item)
        if (index !== -1) {
            this.ammo[index].amount += type.ammoMultiplier
            const [entry] = this.ammo.splice(index, 1)
            this.ammo.push(entry)
            return
        }

        this.ammo.push({item, amount: type.ammoMultiplier})
    }

    /** Турель ничего не отдаёт: `removeStack` у неё возвращает ноль. */
    removeStack() {
        return 0
    }

    get hasAmmo() {
        return this.ammo.length > 0
    }

    /**
     * Полезность турели — это «есть чем стрелять».
     *
     * `ItemTurret.init` подменяет проверку своего потребления: патроны лежат не в складе
     * блока, а в собственной стопке, и обычная проверка «есть ли предмет внутри» ответила бы
     * нулём всегда. ItemTurret.java:83-87
     */
    consumeTriggerValid() {
        if (!this.hasAmmo) return false
        return this.ammo[this.ammo.length - 1].amount >= this.turret.ammoPerShot
    }

    /** Пуля, которой выстрелит следующий выстрел. `peekAmmo` */
    peekAmmo() {
        if (!this.hasAmmo) return null
        return this.ammoTypes[this.ammo[this.ammo.length - 1].item] ?? null
    }

    /** `useAmmo`: тратится верхняя запись, пустая уходит из стопки. */
    useAmmo() {
        const entry = this.ammo[this.ammo.length - 1]
        const type = this.ammoTypes[entry.item]

        entry.amount -= this.turret.ammoPerShot
        if (entry.amount <= 0) this.ammo.pop()

        this.totalAmmo = Math.max(this.totalAmmo - this.turret.ammoPerShot, 0)
        return type
    }

    /** Дальность с поправкой патрона: `rangeChange` у пули. `BaseTurret.range` */
    get range() {
        return (this.spec.range ?? 0) + (this.peekAmmo()?.rangeChange ?? 0)
    }

    get logicControlled() {
        return this.logicControlTime > 0
    }

    /**
     * `Turret.control`: команда логики уводит турель из-под собственного прицела на две
     * секунды. Стрелять или только целиться, решает последнее поле.
     */
    control(property, p1, p2, p3) {
        if (property === 'shoot') {
            this.targetPos = {x: unconv(p1), y: unconv(p2)}
            this.logicControlTime = LOGIC_CONTROL_COOLDOWN
            this.logicShooting = Math.abs(p3) >= 0.00001
            return true
        }

        if (property === 'shootp') {
            this.logicControlTime = LOGIC_CONTROL_COOLDOWN
            this.logicShooting = Math.abs(p2) >= 0.00001

            if (p1 !== null && typeof p1 === 'object') this.aimAt(p1)
            return true
        }

        return super.control(property, p1, p2, p3)
    }

    /**
     * Наведение с упреждением. `Turret.targetPosition` плюс `Predict.intercept`: точка встречи
     * считается по скорости цели и скорости пули, а без `predictTarget` берётся как есть.
     */
    aimAt(target) {
        const bullet = this.peekAmmo()
        if (bullet === null) return

        const x = target.x ?? 0
        const y = target.y ?? 0

        if (!this.turret.predictTarget || bullet.speed < 0.01) {
            this.targetPos = {x, y}
            return
        }

        this.targetPos = intercept(this.worldX, this.worldY, target, bullet.speed)
    }

    sense(property) {
        switch (property) {
            case 'ammo': return this.totalAmmo
            case 'ammoCapacity': return this.turret.maxAmmo ?? 0
            case 'rotation': return this.rotation
            case 'shootX': return conv(this.targetPos.x)
            case 'shootY': return conv(this.targetPos.y)
            case 'shooting': return this.isShooting ? 1 : 0
            case 'progress': return Math.min(this.reloadCounter / this.turret.reload, 1)
            case 'range': return this.range
            default: return super.sense(property)
        }
    }

    senseObject(property) {
        // `currentAmmoType` — предмет верхней записи, а не пуля. ItemTurret.senseObject
        if (property === 'currentAmmoType') {
            if (!this.hasAmmo) return null
            return this.world?.content?.find?.(this.ammo[this.ammo.length - 1].item) ?? null
        }

        return super.senseObject(property)
    }

    /** `Turret.updateTile` в том порядке, в каком он там написан. */
    update(delta = 1) {
        if (!this.validTarget()) this.target = null

        this.isShooting = this.logicControlled ? this.logicShooting : this.target !== null

        if (this.logicControlTime > 0) this.logicControlTime -= delta
        if (!this.enabled) return

        // Перезарядка идёт от времени, а не от полезности: `delta()`, а не `edelta()`
        this.reloadCounter += delta * (this.peekAmmo()?.reloadMultiplier ?? 1)

        if (!this.hasAmmo) return

        if (this.timer(TIMER_TARGET, this.turret.targetInterval)) this.findTarget()

        if (!this.validTarget()) {
            this.target = null
            return
        }

        let canShoot

        if (this.logicControlled) {
            canShoot = this.logicShooting
        } else {
            this.aimAt(this.target)
            canShoot = this.within(this.target, this.range + this.target.spec.hitSize / 1.9)
        }

        const wanted = Math.atan2(this.targetPos.y - this.worldY, this.targetPos.x - this.worldX)
            * 180 / Math.PI

        this.turnTo(mod(wanted, 360), delta)

        if (angleDist(this.rotation, mod(wanted, 360)) < this.turret.shootCone && canShoot) {
            this.updateShooting()
        }
    }

    /** `Turret.turnToTarget`: поворот идёт со своей скоростью и не мгновенен. */
    turnTo(wanted, delta) {
        const difference = angleDist(this.rotation, wanted)
        if (difference < 0.0001) return

        const step = Math.min(this.turret.rotateSpeed * delta * this.efficiency, difference)
        const clockwise = mod(wanted - this.rotation, 360) > 180

        this.rotation = mod(this.rotation + (clockwise ? -step : step), 360)
    }

    /** Цель жива, на карте и чужая. `Units.invalidateTarget` в нужной нам части. */
    validTarget() {
        if (this.logicControlled) return true
        if (this.target === null) return false
        if (this.target.dead) return false

        return this.within(this.target, this.range + this.target.spec.hitSize / 1.9)
    }

    within(target, distance) {
        return Math.hypot(target.x - this.worldX, target.y - this.worldY) <= distance
    }

    /** Ближайший чужой юнит в дальности. `Units.bestTarget` без сортировки по типам. */
    findTarget() {
        let best = null
        let bestDistance = Infinity

        for (const unit of this.world.units) {
            if (unit.dead || unit.team === this.team) continue
            if (!this.turret.targetAir && unit.spec.flying) continue
            if (!this.turret.targetGround && !unit.spec.flying) continue

            const distance = Math.hypot(unit.x - this.worldX, unit.y - this.worldY)
            if (distance > this.range || distance < this.turret.minRange) continue

            if (distance < bestDistance) {
                best = unit
                bestDistance = distance
            }
        }

        this.target = best
    }

    /** `Turret.updateShooting`: выстрел, когда перезарядка полна. */
    updateShooting() {
        if (this.reloadCounter < this.turret.reload) return

        const type = this.peekAmmo()
        if (type === null) return

        this.shoot(type)
        this.reloadCounter %= this.turret.reload
    }

    /**
     * Выстрел. Пуля вылетает из дула — `shootX`, `shootY` отмеряются от середины турели
     * вдоль её поворота, — и патрон тратится один на очередь (`consumeAmmoOnce`).
     */
    shoot(type) {
        const radians = (this.rotation - 90) * Math.PI / 180
        const {shootX, shootY} = this.turret

        const x = this.worldX + shootX * Math.cos(radians) - shootY * Math.sin(radians)
        const y = this.worldY + shootX * Math.sin(radians) + shootY * Math.cos(radians)

        const shots = Math.max(this.turret.shots ?? 1, 1)
        for (let i = 0; i < shots; i++) {
            this.world.addBullet(new Bullet(this.world, {
                x, y, angle: this.rotation, type, team: this.team, owner: this
            }))
        }

        this.useAmmo()
    }
}

/** Номер таймера наведения. `Turret.timerTarget` */
const TIMER_TARGET = 1

/**
 * Точка встречи пули и цели. `Predict.intercept`: решается квадратное уравнение на время
 * полёта, и если решения нет — стреляем в то место, где цель сейчас.
 */
function intercept(fromX, fromY, target, speed) {
    const x = (target.x ?? 0) - fromX
    const y = (target.y ?? 0) - fromY

    const vx = (target.velocityX ?? target.vx ?? 0)
    const vy = (target.velocityY ?? target.vy ?? 0)

    const a = vx * vx + vy * vy - speed * speed
    const b = 2 * (vx * x + vy * y)
    const c = x * x + y * y

    let time = 0

    if (Math.abs(a) < 0.00001) {
        if (Math.abs(b) > 0.00001) time = -c / b
    } else {
        const discriminant = b * b - 4 * a * c
        if (discriminant >= 0) {
            const root = Math.sqrt(discriminant)
            const first = (-b + root) / (2 * a)
            const second = (-b - root) / (2 * a)

            const positive = [first, second].filter(value => value > 0)
            time = positive.length === 0 ? 0 : Math.min(...positive)
        }
    }

    return {x: (target.x ?? 0) + vx * time, y: (target.y ?? 0) + vy * time}
}

registerBuilders({ItemTurret: TurretBuilding})
