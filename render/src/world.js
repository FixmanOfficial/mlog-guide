/**
 * Вид на мир: сетка, здания, связи процессора.
 *
 * Игра рисует мир в мировых единицах — восемь на тайл (`Vars.tilesize`), — а спрайт блока
 * размером `size` занимает ровно `size * 8`. Здесь то же самое: вид знает, сколько пикселей
 * приходится на тайл, и переводит все размеры сам. Поэтому обводки и рамки из `Drawf`
 * сохраняют пропорции при любом масштабе, как в игре при любом приближении.
 *
 * Своего у нас только фон и сетка: в игре под блоками лежит местность, а у нас пусто.
 * Всё остальное — рамка связи, круг дальности, порядок отрисовки — снято из исходников.
 */

import {polyPoints, polyRing, polyArc, arcSlice, lineQuad, rectBorders} from './geometry.js'
import {randomSeed, packPoint, sin, degRad, PI} from '@mlog/core/src/arc.js'
import {BLOCK_SPECS} from '@mlog/core/src/world.js'
import {LABEL_BACKGROUND, LABEL_OUTLINE, ALIGN} from '@mlog/core/src/markers.js'

/**
 * Geometry.d8 — восемь соседей по кругу, начиная с правого. Порядок важен: игра перебирает
 * их именно так, и от него зависит, чей край ляжет поверх чьего.
 */
const D8 = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]]

/** Mathf.lerp */
const lerp = (from, to, progress) => from + (to - from) * progress

/** Angles.trns: вектор, повёрнутый на угол. Возвращает пару, чтобы не заводить объект. */
function rotate(x, y, degrees) {
    const radians = degrees * degRad
    const cos = Math.cos(radians)
    const sinus = Math.sin(radians)

    return [x * cos - y * sinus, x * sinus + y * cos]
}

/** Vars.tilesize: восемь мировых единиц на тайл. */
export const TILE_UNITS = 8

/** graphics/Pal.java */
export const PAL = {
    gray: '#454545',
    place: '#6335f8',
    accent: '#ffd37f',
    remove: '#e55454'
}

/** Фон и сетка — наши: в игре тут местность, а её мы не моделируем. */
export const VOID = '#141419'
export const GRID = '#1e1e26'

/** Control.java:330 ставит Draw.scl = 1 / 4: спрайты игры вчетверо крупнее мировых единиц. */
export const SPRITE_SCALE = 4

/** Fonts.def: основной шрифт игры собран в восемнадцать пикселей. */
export const FONT_SIZE = 18

/** LogicDisplay.scaleFactor: во сколько раз картинка крупнее своего буфера. */
export const SCALE_FACTOR = 1

/** Дальность связи по умолчанию, если у здания её нет. LogicBlock.range */
export const DEFAULT_RANGE = 8 * 10

export class WorldView {
    /**
     * @param canvas  холст
     * @param options world — модель мира; tile — пикселей на тайл;
     *                blocks и blockSprites — атлас спрайтов блоков и указатель к нему;
     *                atlas и sprites — атлас иконок контента, запасной вариант;
     *                displays — карта «здание дисплея → холст с его картинкой»;
     *                font — семейство шрифта для подписей связей
     */
    constructor(canvas, {
        world, tile = 32,
        blocks = null, blockSprites = null,
        units = null, unitSprites = null, teams = null,
        terrain = null, terrainSprites = null,
        atlas = null, sprites = null,
        displays = new Map(), font = 'MlogUi'
    } = {}) {
        this.canvas = canvas
        this.world = world
        this.tile = tile
        this.blocks = blocks
        this.blockSprites = blockSprites
        this.units = units
        this.unitSprites = unitSprites
        this.teams = teams
        this.terrain = terrain
        this.terrainSprites = terrainSprites

        // Местность неподвижна: рисуется один раз в свой холст и дальше просто копируется
        this.ground = null
        this.groundVersion = -1
        this.atlas = atlas
        this.sprites = sprites
        this.displays = displays
        this.font = font

        this.context = canvas.getContext('2d')
        this.icons = new Map()
        this.resize()
    }

    resize() {
        const ratio = globalThis.devicePixelRatio ?? 1

        /*
         * Шаг тайла округляется до целого, и масштаб подгоняется под него, а не наоборот.
         *
         * При системном увеличении экрана (1.25, 1.3333) шаг выходил дробным, границы тайлов
         * попадали между физическими пикселями, и каждая превращалась в еле заметный шов.
         * Из этих швов и складывалась «сетка» поверх местности — та самая, что осталась
         * в памяти от времён, когда пола не было вовсе.
         */
        const step = Math.max(1, Math.round(this.tile * ratio))

        this.ratio = step / this.tile

        this.canvas.width = this.world.width * step
        this.canvas.height = this.world.height * step
        this.canvas.style.width = `${this.world.width * this.tile}px`
        this.canvas.style.height = `${this.world.height * this.tile}px`

        /*
         * Сглаживание включено намеренно. На десктопе игра держит атлас с линейной
         * фильтрацией — `checkPref("linear", !mobile)` и тут же ставит её всем текстурам.
         * Без неё каждая плитка пола показывает свой тёмный край, и карта расчерчивается
         * еле заметной сеткой, которой в игре нет.
         */
        this.context.imageSmoothingEnabled = true
    }

    /** Пикселей на одну мировую единицу. В игре это масштаб камеры. */
    get unit() {
        return this.tile * this.ratio / TILE_UNITS
    }

    /**
     * Центр здания в пикселях холста. Ось Y холста смотрит вниз, мира — вверх.
     *
     * У блока с чётной стороной центр приходится на угол тайла: `Block.offset` в игре
     * прибавляет половину тайла именно к таким. Без этого процессор 2 на 2 съезжает с сетки.
     */
    place(building) {
        const step = this.tile * this.ratio

        return [
            (building.x + building.offset + 0.5) * step,
            (this.world.height - building.y - building.offset - 0.5) * step
        ]
    }

    /**
     * @param configured здание, у которого открыта настройка. В игре именно для него рисуются
     *                   круг дальности и рамки связей (`Building.drawConfigure`), а сверху —
     *                   уголки выделения (`Drawf.selected`).
     */
    draw({configured = null} = {}) {
        const context = this.context

        context.setTransform(1, 0, 0, 1, 0, 0)
        context.fillStyle = VOID
        context.fillRect(0, 0, this.canvas.width, this.canvas.height)

        if (this.groundReady()) this.drawGround()
        else this.drawGrid()

        for (const building of this.world.buildings) this.drawBuilding(building)

        // Юниты идут поверх зданий: в игре у них слой 60 против 30 у блоков
        for (const unit of this.world.units ?? []) this.drawUnit(unit)

        // Метки идут поверх всего: слой по умолчанию у них Layer.overlayUI
        this.drawMarkers()

        if (configured !== null) {
            this.drawLinks(configured)
            this.drawSelection(configured)
        }
    }

    /**
     * Рамка настраиваемого блока. `Building.drawConfigure` — это ровно три строки: цвет
     * `Pal.accent`, толщина 1 и квадрат со стороной `size * 8 / 2 + 1`. Никакой тёмной подложки
     * под ним нет, а рамка уходит внутрь квадрата, потому что так рисует `Lines.rect`.
     */
    drawSelection(building) {
        const [cx, cy] = this.place(building)
        const half = (building.size * TILE_UNITS / 2 + 1) * this.unit
        const context = this.context

        context.fillStyle = PAL.accent

        for (const [x, y, width, height] of rectBorders(cx - half, cy - half, half * 2, half * 2, this.unit)) {
            context.fillRect(x, y, width, height)
        }
    }

    /**
     * Готова ли местность к отрисовке. Картинка может ещё грузиться: пока её нет, рисуется
     * сетка, а собирать местность нельзя — иначе пустой холст закешируется навсегда.
     */
    groundReady() {
        return this.terrainSprites !== null && this.terrain !== null
            && this.terrain.complete && this.terrain.naturalWidth > 0
    }

    /** Копирует готовую местность, пересобирая её, только если мир изменился. */
    drawGround() {
        if (this.ground === null || this.groundVersion !== this.world.terrainVersion) {
            this.buildGround()
            this.groundVersion = this.world.terrainVersion
        }

        this.context.drawImage(this.ground, 0, 0)
    }

    /**
     * Собирает местность целиком: пол, мягкие края переходов, руда, статичные стены.
     *
     * Порядок из `Floor.drawBase`: сначала своя плитка, потом края соседей, потом наложение.
     * Стены рисуются после — они часть местности, но лежат поверх пола.
     */
    buildGround() {
        const step = this.tile * this.ratio

        if (this.ground === null) {
            this.ground = document.createElement('canvas')
        }

        this.ground.width = this.canvas.width
        this.ground.height = this.canvas.height

        const context = this.ground.getContext('2d')
        context.imageSmoothingEnabled = true
        context.clearRect(0, 0, this.ground.width, this.ground.height)

        for (let y = 0; y < this.world.height; y++) {
            for (let x = 0; x < this.world.width; x++) {
                const left = x * step
                const top = (this.world.height - 1 - y) * step

                const floor = this.world.floorAt(x, y)
                this.tileSprite(context, floor, x, y, left, top, step)
                this.tileEdges(context, x, y, left, top, step)

                const overlay = this.world.overlayAt(x, y)
                if (overlay !== null) this.tileSprite(context, overlay, x, y, left, top, step)

                const wall = this.world.wallAt(x, y)
                if (wall !== null) this.tileSprite(context, wall, x, y, left, top, step)
            }
        }
    }

    /**
     * Плитка нужного варианта. Вариант не случайный: `Mathf.randomSeed` от упакованных
     * координат — поэтому один и тот же тайл всегда выглядит одинаково.
     */
    tileSprite(context, name, x, y, left, top, step) {
        if (name === null) return

        const variants = BLOCK_SPECS[name]?.variants ?? 0
        const index = variants > 0 ? randomSeed(packPoint(x, y), 0, variants - 1) : 0
        const key = variants > 0 ? `${name}${index + 1}` : name

        const entry = this.terrainSprites.sprites[key]
        if (entry === undefined) return

        const image = this.cut(`terrain:${key}`, this.terrain, entry.x, entry.y, entry.width, entry.height)
        if (image === null) return

        // Стена шире тайла (у больших спрайтов), поэтому рисуем по центру, а не от угла
        const width = entry.width / this.terrainSprites.tile * step
        const height = entry.height / this.terrainSprites.tile * step

        context.drawImage(image, left + (step - width) / 2, top + (step - height) / 2, width, height)
    }

    /**
     * Мягкие переходы. `Floor.drawEdges`: сосед рисует свой край на нас, если его
     * идентификатор больше нашего — так у пары полов всегда один и тот же побеждает,
     * и граница не мерцает.
     */
    tileEdges(context, x, y, left, top, step) {
        const own = BLOCK_SPECS[this.world.floorAt(x, y)]
        if (own === undefined) return

        for (const [dx, dy] of D8) {
            const name = this.world.floorAt(x + dx, y + dy)
            if (name === null) continue

            const other = BLOCK_SPECS[name]
            if (other === undefined || other.drawEdgeOut === false) continue
            if (other.id <= own.id) continue

            // Край рисует группа смешивания, а не сам пол
            const sheet = this.terrainSprites.sprites[`${other.blendGroup ?? name}-edge`]
            if (sheet === undefined) continue

            const image = this.cut(`terrain:${name}-edge`, this.terrain,
                sheet.x, sheet.y, sheet.width, sheet.height)
            if (image === null) continue

            /*
             * Ячейка листа: `edges[rx][2 - ry]` при `rx = 1 - dx`, `ry = 1 - dy`. Первый
             * индекс у `TextureRegion.split` — столбец, второй — строка, так что клетка
             * оказывается зеркальной направлению соседа. Клякса стенсиля симметрична,
             * поэтому в игре это незаметно; повторяем как в исходнике.
             */
            const column = 1 - dx
            const row = 1 + dy
            const cell = this.terrainSprites.tile

            context.drawImage(image,
                column * cell, row * cell, cell, cell,
                left, top, step, step)
        }
    }

    drawGrid() {
        const context = this.context
        const step = this.tile * this.ratio

        context.strokeStyle = GRID
        context.lineWidth = 1
        context.beginPath()

        for (let x = 0; x <= this.world.width; x++) {
            context.moveTo(Math.round(x * step) + 0.5, 0)
            context.lineTo(Math.round(x * step) + 0.5, this.canvas.height)
        }

        for (let y = 0; y <= this.world.height; y++) {
            context.moveTo(0, Math.round(y * step) + 0.5)
            context.lineTo(this.canvas.width, Math.round(y * step) + 0.5)
        }

        context.stroke()
    }

    drawBuilding(building) {
        const [cx, cy] = this.place(building)
        const side = building.size * this.tile * this.ratio
        const context = this.context

        // Открытая дверь рисуется своим спрайтом целиком, а не поверх закрытой. Door.draw
        const open = building.type === 'door' && building.open
        const icon = this.sprite(open ? 'door-open' : building.type)

        if (icon === null) {
            // Блока нет в атласе — рисуем заглушкой, чтобы он всё равно был виден
            context.fillStyle = '#2a2a33'
            context.fillRect(cx - side / 2, cy - side / 2, side, side)
        } else {
            context.drawImage(icon, cx - side / 2, cy - side / 2, side, side)
        }

        // Включённый тумблер рисуется поверх своим спрайтом. SwitchBlock.draw
        if (building.type === 'switch' && building.enabled) {
            const on = this.sprite('switch-on')
            if (on !== null) context.drawImage(on, cx - side / 2, cy - side / 2, side, side)
        }

        // Дисплей показывает картинку поверх собственного спрайта. Она меньше блока:
        // буфер рисуется размером displaySize * scaleFactor * Draw.scl, а Draw.scl это 1/4,
        // потому что спрайты игры вчетверо крупнее мировых единиц. У дисплея 3 на 3 это
        // 80 / 4 = 20 единиц против 24 у самого блока — рамка остаётся видна
        const picture = this.displays.get(building)
        if (picture !== undefined) {
            const screen = building.spec.displaySize * SCALE_FACTOR / SPRITE_SCALE * this.unit
            context.drawImage(picture, cx - screen / 2, cy - screen / 2, screen, screen)
        }
    }

    /**
     * Юнит целиком, в порядке `UnitType.draw`: ноги, огонь двигателей, корпус, накладка команды.
     *
     * Спрайт рисуется под углом `rotation - 90`: в игре угол отсчитывается против часовой
     * от оси X, а картинка нарисована смотрящей вверх. Ось Y холста смотрит вниз, поэтому
     * тот же поворот здесь берётся с обратным знаком.
     */
    drawUnit(unit) {
        const sprite = this.unitSprite(unit.type)
        if (sprite === null) return

        const offset = unit.spec.mech ? this.drawMech(unit) : [0, 0]
        this.drawEngines(unit)

        const [cx, cy] = this.unitPlace(unit, offset[0], offset[1])

        this.rotated(cx, cy, unit.rotation - 90, () => {
            this.blit(sprite)

            const cell = this.unitSprite(`${unit.type}-cell`, this.teamColor(unit.team))
            if (cell !== null) this.blit(cell)
        })
    }

    /** Точка юнита на холсте, со сдвигом в мировых единицах. */
    unitPlace(unit, dx = 0, dy = 0) {
        const step = this.tile * this.ratio

        return [
            (unit.x + dx) / TILE_UNITS * step,
            (this.world.height - (unit.y + dy) / TILE_UNITS) * step
        ]
    }

    /** Поворот вокруг точки: угол задаётся как в игре, против часовой. */
    rotated(x, y, degrees, body) {
        const context = this.context

        context.save()
        context.translate(x, y)
        context.rotate(-degrees * Math.PI / 180)
        body()
        context.restore()
    }

    /**
     * Спрайт по центру текущего преобразования. Размер свой у каждого: обводка добавляет
     * корпусу точку-другую, и накладка команды уже с ним не совпадает. Отрицательный
     * множитель зеркалит — так игра рисует вторую ногу меха.
     */
    blit(sprite, scaleX = 1, scaleY = 1) {
        const w = sprite.width / SPRITE_SCALE * this.unit
        const h = sprite.height / SPRITE_SCALE * this.unit
        const context = this.context

        context.save()
        context.scale(Math.sign(scaleX), Math.sign(scaleY))
        context.drawImage(sprite.image,
            -Math.abs(w * scaleX) / 2, -Math.abs(h * scaleY) / 2,
            Math.abs(w * scaleX), Math.abs(h * scaleY))
        context.restore()
    }

    /**
     * Ноги меха и его основание. `UnitType.drawMech`: две ноги зеркально, вынесенные вперёд
     * и назад на фазу шага; та, что идёт назад, ещё и приплюснута — отчего шаг выглядит
     * шагом, а не скольжением.
     *
     * Возвращает качание корпуса при ходьбе, вбок и вперёд. В игре оно делается временным
     * сдвигом самого юнита (`unit.trns`), но трогать модель ради картинки нельзя.
     */
    drawMech(unit) {
        const spec = unit.spec
        const e = unit.elevation

        const base = unit.walkExtend(true)
        const swing = lerp(sin(base * PI / 2), 0, e)
        const extension = lerp(unit.walkExtend(false), 0, e)
        const boost = e * 2

        const leg = this.unitSprite(`${unit.type}-leg`)
        const stand = this.unitSprite(`${unit.type}-base`)

        // Mathf.signs идёт от левой ноги к правой, и от порядка зависит, какая окажется сверху
        if (leg !== null) {
            for (const side of [-1, 1]) {
                const shift = rotate(extension * side - boost, -boost * side, unit.baseRotation)
                const [lx, ly] = this.unitPlace(unit, shift[0], shift[1])

                // Вынесенная вперёд нога подкрашивается: так видно, какая сейчас шагает
                const mix = Math.max(0, side * extension / spec.mechStride)
                const image = mix > 0.01 ? this.tinted(leg, spec.mechLegColor, mix) : leg.image

                this.rotated(lx, ly, unit.baseRotation - 90 + 35 * side * e, () => {
                    this.blit({...leg, image}, side, 1 - Math.max(-swing * side, 0) * 0.5)
                })
            }
        }

        if (stand !== null) {
            const [bx, by] = this.unitPlace(unit)
            this.rotated(bx, by, unit.baseRotation - 90, () => this.blit(stand))
        }

        // Качание корпуса: вбок по полупериоду шага, вперёд по полному
        const side = rotate(0, lerp(sin(base * PI / 2) * spec.mechSideSway, 0, e), unit.baseRotation)
        const front = rotate(0, lerp(sin(base * PI) * spec.mechFrontSway, 0, e), unit.baseRotation + 90)

        return [side[0] + front[0], side[1] + front[1]]
    }

    /**
     * Огонь двигателей. Спрайта у него нет: `UnitEngine.draw` рисует два круга, внешний
     * цветом команды и внутренний белым, а радиус слегка пульсирует от времени. У наземных
     * юнитов множитель высоты нулевой, поэтому огня не видно, пока они не взлетят.
     */
    drawEngines(unit) {
        const spec = unit.spec
        const scale = spec.useEngineElevation ? unit.elevation : 1

        if (scale <= 0.0001 || (spec.engines ?? []).length === 0) return

        const rot = unit.rotation - 90
        const color = spec.engineColor ?? this.teamColor(unit.team)

        for (const engine of spec.engines) {
            // Mathf.absin(Time.time, 2, radius / 4): пульсация в четверть радиуса
            const pulse = engine.radius / 4 * (1 + sin(this.world.tick / 4)) / 2
            const radius = (engine.radius + pulse) * scale

            const place = rotate(engine.x, engine.y, rot)
            const [cx, cy] = this.unitPlace(unit, place[0], place[1])
            this.circle(cx, cy, radius * this.unit, color)

            const inner = rotate(radius / 4, 0, rot + engine.rotation)
            const [px, py] = this.unitPlace(unit, place[0] - inner[0], place[1] - inner[1])
            this.circle(px, py, radius / 2 * this.unit, spec.engineColorInner)
        }
    }

    circle(x, y, radius, color) {
        const context = this.context

        context.fillStyle = color
        context.beginPath()
        context.arc(x, y, radius, 0, Math.PI * 2)
        context.fill()
    }

    /**
     * Копия спрайта, подмешанная к цвету. `Draw.mixcol` смешивает цвет пикселя с заданным
     * в указанной доле, сохраняя прозрачность, — на холсте это `source-atop`. Доля округляется
     * до шестнадцатых, иначе кеш пришлось бы заводить заново каждый кадр.
     */
    tinted(sprite, color, amount) {
        const step = Math.min(1, Math.round(amount * 16) / 16)
        const key = `tint:${sprite.width}:${sprite.height}:${color}:${step}`

        const cached = this.icons.get(key)
        if (cached !== undefined) return cached

        const canvas = document.createElement('canvas')
        canvas.width = sprite.width
        canvas.height = sprite.height

        const context = canvas.getContext('2d')
        context.imageSmoothingEnabled = false
        context.drawImage(sprite.image, 0, 0)

        context.globalCompositeOperation = 'source-atop'
        context.globalAlpha = step
        context.fillStyle = color
        context.fillRect(0, 0, canvas.width, canvas.height)

        this.icons.set(key, canvas)
        return canvas
    }

    /** Цвет команды. Им красится ячейка юнита, и его же отдаёт `sensor @color`. */
    teamColor(id) {
        const found = Object.values(this.teams?.teams ?? {}).find(team => team.id === id)
        return found?.color ?? PAL.accent
    }

    /**
     * Спрайт юнита из атласа. С цветом — вырезанное перекрашивается целиком, как `Draw.color`
     * перед `Draw.rect`: у ячейки собственный рисунок это маска, а не картинка.
     */
    unitSprite(name, color = null) {
        const entry = this.unitSprites?.sprites?.[name]
        if (entry === undefined || this.units === null) return null

        const key = color === null ? `unit:${name}` : `unit:${name}:${color}`
        const image = this.cut(key, this.units, entry.x, entry.y, entry.width, entry.height, color)

        return image === null ? null : {image, width: entry.width, height: entry.height}
    }

    /**
     * Связи выделенного процессора. `LogicBlock.drawConfigure`: круг дальности плюс рамка
     * вокруг каждого подключённого здания, и над ней — имя связи.
     */
    drawLinks(building) {
        /*
         * Круг дальности и рамки связей рисует `LogicBlock.drawConfigure` — то есть только
         * процессор. У сообщения и ячейки памяти своей настройки в игре нет, а базовый
         * `Building.drawConfigure` умеет ровно одно: обвести блок квадратом.
         */
        if (building.processor === undefined) return

        const [px, py] = this.place(building)
        // Дальность приходит из спеки блока: она снята генератором вместе с размером
        const range = (building.spec.range ?? DEFAULT_RANGE) * this.unit

        /*
         * Круг дальности рисуется только у обычного процессора: `drawConfigure` обводит его
         * под `if(!privileged)`. У процессора мира дальность — `Float.MAX_VALUE`, и круг из
         * неё вышел бы в 3.4e38 единиц: число отрезков `Lines.circleVertices` считает от
         * радиуса и ничем не ограничено, так что страница просто вставала.
         */
        if (building.spec.privileged !== true) {
            // Drawf.circles: окружность из отрезков, тёмная подложка толщиной 3 и цвет толщиной 1
            this.circles(px, py, range, PAL.accent)
        }

        for (const link of building.processor.links) {
            const [lx, ly] = this.place(link)
            const radius = (link.size * TILE_UNITS / 2 + 1) * this.unit

            // Drawf.square со стороны вызова без угла — значит поворот 45 градусов
            this.square(lx, ly, radius, 45, PAL.place)
            this.label(link.name, lx, ly - link.size * this.tile * this.ratio / 2 - 6 * this.ratio)
        }
    }

    /** Drawf.circles: Lines.circle поверх такой же, но толще и серой. */
    circles(x, y, radius, color) {
        // Lines.circleVertices: 11 отрезков плюс по одному на 2.5 единицы радиуса
        const sides = 11 + Math.trunc(radius / this.unit * 0.4)

        this.ring(x, y, sides, radius, 0, 3 * this.unit, PAL.gray)
        this.ring(x, y, sides, radius, 0, 1 * this.unit, color)
    }

    /**
     * Drawf.square: та же пара обводок, но четырьмя сторонами. Радиус внутри увеличивается
     * ещё на единицу, а `Lines.square` поворачивает четырёхугольник на 45 градусов меньше
     * запрошенного — поэтому поворот 45 даёт обычный квадрат по осям.
     */
    square(x, y, radius, rotation, color) {
        const outer = radius + 1 * this.unit

        this.ring(x, y, 4, outer, rotation - 45, 3 * this.unit, PAL.gray)
        this.ring(x, y, 4, outer, rotation - 45, 1 * this.unit, color)
    }

    /** Одно кольцо обводки: то же, что `Lines.poly` в arc. */
    ring(x, y, sides, radius, rotation, stroke, color) {
        const {outer, inner} = polyRing(x, y, sides, radius, rotation, stroke)
        const context = this.context

        context.fillStyle = color
        context.beginPath()

        for (const points of [outer, inner]) {
            points.forEach(([vx, vy], index) => {
                if (index === 0) context.moveTo(vx, vy)
                else context.lineTo(vx, vy)
            })
            context.closePath()
        }

        context.fill('evenodd')
    }

    /** Имя связи над зданием. В игре это `Block.drawPlaceText` шрифтом с обводкой. */
    label(text, x, y) {
        const context = this.context
        const size = 10 * this.ratio

        context.font = `${size}px "${this.font}", system-ui, sans-serif`
        context.textAlign = 'center'
        context.textBaseline = 'bottom'
        context.lineWidth = 3 * this.ratio
        context.strokeStyle = '#000000'
        context.strokeText(text, x, y)
        context.fillStyle = PAL.accent
        context.fillText(text, x, y)
    }

    /**
     * Спрайт блока. Сначала атлас блоков: там они лежат в своём разрешении — сторона в тайлах,
     * умноженная на 32, — и потому не расплываются. Если блока там нет, берётся иконка контента,
     * но она уменьшена до 32 пикселей на весь блок и годится только как запасной вариант.
     */
    sprite(type) {
        const native = this.blockSprites?.sprites?.[type]
        if (native !== undefined && this.blocks !== null) {
            return this.cut(`block:${type}`, this.blocks, native.x, native.y, native.width, native.height)
        }

        const entry = this.sprites?.index.block?.[type]
        if (entry === undefined || this.atlas === null) return null

        return this.cut(`icon:${type}`, this.atlas, entry.x, entry.y, entry.width, entry.height)
    }

    /**
     * Кусок атласа отдельной картинкой. Повёрнутый или растянутый `drawImage` с вырезкой из
     * общего атласа прихватывает соседний столбец пикселей по краю; вырезанный один раз кусок
     * захватывать нечего.
     *
     * Пока картинка не догрузилась, вырезать нечего — и запоминать пустой кусок нельзя.
     * Проверять только ширину мало: она появляется, едва разобран заголовок, а рисовать такую
     * картинку браузер молча отказывается. Отсюда пара условий: `complete` про загрузку,
     * ширина про то, что картинка не битая.
     */
    cut(key, image, x, y, width, height = width, color = null) {
        if (!image.complete || !(image.naturalWidth > 0)) return null

        // Пустой размер означает, что указатель разошёлся с рендером: молчать тут нельзя,
        // иначе холст нулевого размера уронит отрисовку на каждом кадре
        if (!(width > 0) || !(height > 0)) throw new Error(`${key}: размер ${width} на ${height}`)

        const cached = this.icons.get(key)
        if (cached !== undefined) return cached

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height

        const context = canvas.getContext('2d')
        context.imageSmoothingEnabled = false
        context.drawImage(image, x, y, width, height, 0, 0, width, height)

        // Перекраска целиком, с сохранением прозрачности: рисунок ячейки — маска
        if (color !== null) {
            context.globalCompositeOperation = 'source-in'
            context.fillStyle = color
            context.fillRect(0, 0, width, height)
        }

        this.icons.set(key, canvas)
        return canvas
    }

    /**
     * Метки процессора мира. У каждого вида в `MapObjectives` свой `draw`, порядок задаёт
     * `drawLayer`, а метка с `world = false` живёт только на миникарте, которой у нас нет.
     *
     * Картинка и четырёхугольник пока не рисуются: им нужен произвольный регион атласа
     * по имени, а у нас в атласе только контент.
     */
    drawMarkers() {
        // Метки целей идут раньше общих — так их кладёт `Renderer.draw`
        const all = [...(this.world.objectives?.markers() ?? []), ...(this.world.markers?.all() ?? [])]
        const markers = all.filter(marker => marker.world)

        for (const marker of markers.sort((a, b) => a.drawLayer - b.drawLayer)) {
            const props = marker.props
            const [x, y] = this.markerPlace(props.x ?? 0, props.y ?? 0)

            if (marker.type === 'point') this.drawPoint(props, x, y)
            if (marker.type === 'shape') this.drawShape(props, x, y)
            if (marker.type === 'shapetext') this.drawShapeText(props, x, y)
            if (marker.type === 'text') this.worldLabel(props.text, x, y, props)
            if (marker.type === 'line') this.drawLineMarker(props)
        }
    }

    /** Мировые единицы метки в пиксели холста. */
    markerPlace(x, y) {
        return [x * this.unit, (this.world.height * TILE_UNITS - y) * this.unit]
    }

    /**
     * PointMarker: круг, который раз в сотню тиков разбегается от центра и утончается.
     * Время берётся из мира, а не из часов браузера, — иначе отрисовка перестанет быть
     * повторяемой. Радиус здесь единственный, что задан в тайлах.
     */
    drawPoint(props, x, y) {
        // Interp.pow2Out от доли, набегающей за сто тиков
        const period = (this.world.tick / 100) % 1
        const fin = 1 - (1 - period) ** 2

        const radius = props.radius * TILE_UNITS * this.unit * fin
        const stroke = ((1 - fin) * props.stroke + 0.1) * this.unit

        this.arcRing(x, y, this.circleSides(radius), radius, 0, 360, stroke, props.color)
    }

    /** ShapeMarker: многоугольник, полый или залитый, целиком или дугой. */
    drawShape(props, x, y) {
        // «На случай, если кто-то решит поставить 9999999 сторон и подвесить игру»
        const sides = Math.min(props.sides, 200)
        const [from, to] = [props.rotation + props.startAngle, props.rotation + props.endAngle]

        if (!props.fill) {
            // Радиус обводки на единицу больше заявленного, а у залитой фигуры — нет
            const radius = (props.radius + 1) * this.unit

            if (props.outline) {
                this.arcRing(x, y, sides, radius, from, to, (props.stroke + 2) * this.unit, PAL.gray)
            }

            this.arcRing(x, y, sides, radius, from, to, props.stroke * this.unit, props.color)
            return
        }

        // Заливка идёт клином от центра, и меньший из двух углов становится началом
        const [start, end] = from < to ? [from, to] : [to, from]
        const slice = arcSlice(x, y, props.radius * this.unit, (end - start) / 360, -end, sides)

        this.fillPath(slice, props.color)
    }

    /** ShapeTextMarker: фигура с подписью над ней. Обводка тут своя, толщиной три и один. */
    drawShapeText(props, x, y) {
        const sides = Math.min(props.sides, 300)
        const radius = (props.radius + 1) * this.unit
        const [from, to] = [props.rotation, props.rotation + 360]

        this.arcRing(x, y, sides, radius, from, to, 3 * this.unit, PAL.gray)
        this.arcRing(x, y, sides, radius, from, to, 1 * this.unit, props.color)

        this.worldLabel(props.text, x, y - (props.radius + props.textHeight) * this.unit, props)
    }

    /** LineMarker: отрезок с тёмной подложкой и переливом от цвета одного конца к другому. */
    drawLineMarker(props) {
        const [x1, y1] = this.markerPlace(props.x, props.y)
        const [x2, y2] = this.markerPlace(props.endX, props.endY)

        if (props.outline) {
            this.fillPath(lineQuad(x1, y1, x2, y2, (props.stroke + 2) * this.unit), PAL.gray)
        }

        const gradient = this.context.createLinearGradient(x1, y1, x2, y2)
        gradient.addColorStop(0, props.color1)
        gradient.addColorStop(1, props.color2)

        this.fillPath(lineQuad(x1, y1, x2, y2, props.stroke * this.unit), gradient)
    }

    /**
     * Подпись метки. `WorldLabel.drawAt`: масштаб шрифта — четверть заявленного размера,
     * обводка рисуется отдельным шрифтом с каймой в две единицы, под текстом лежит чёрная
     * подложка в три десятых прозрачности.
     *
     * Строка одна: раскладку многострочной подписи в игре считает `GlyphLayout`.
     */
    worldLabel(text, x, y, props = {}) {
        const {
            flags = LABEL_BACKGROUND | LABEL_OUTLINE, fontSize = 1,
            textAlign = ALIGN.center, lineAlign = ALIGN.center
        } = props

        // Нулевой размер шрифта подпись не рисует вовсе
        if (!text || Math.abs(fontSize) <= 0.000001) return

        const context = this.context
        const height = FONT_SIZE * 0.25 * fontSize * this.unit

        context.font = `${height}px "${this.font}", system-ui, sans-serif`
        context.textBaseline = 'top'

        const width = context.measureText(text).width
        const background = (flags & LABEL_BACKGROUND) !== 0
        const border = background ? this.unit : 0

        // Выравнивание в игре считается по оси Y вверх, у холста она вниз — знаки зеркальны
        let top = y - height / 2
        if ((textAlign & ALIGN.bottom) !== 0) top = y - height - border * 1.5
        else if ((textAlign & ALIGN.top) !== 0) top = y + border * 1.5

        let cx = x
        if ((textAlign & ALIGN.left) !== 0) cx += width / 2 + border
        else if ((textAlign & ALIGN.right) !== 0) cx -= width / 2 + border

        if (background) {
            context.fillStyle = 'rgba(0, 0, 0, 0.3)'
            context.fillRect(
                cx - (width + 2 * this.unit) / 2, top - 1.5 * this.unit,
                width + 2 * this.unit, height + 3 * this.unit
            )
        }

        const left = (lineAlign & ALIGN.left) !== 0
        const right = (lineAlign & ALIGN.right) !== 0

        context.textAlign = left ? 'left' : right ? 'right' : 'center'
        const shift = left ? -width / 2 : right ? width / 2 : 0

        if ((flags & LABEL_OUTLINE) !== 0) {
            context.lineWidth = 2 * 0.25 * fontSize * this.unit
            context.strokeStyle = '#000000'
            context.strokeText(text, cx + shift, top)
        }

        context.fillStyle = '#ffffff'
        context.fillText(text, cx + shift, top)
        context.textBaseline = 'alphabetic'
    }

    /**
     * Обвод дуги, он же полное кольцо. `Lines.poly` ведёт полосу по обе стороны от радиуса;
     * у холста ось Y смотрит вниз, поэтому углы берутся с обратным знаком.
     */
    arcRing(x, y, sides, radius, from, to, stroke, color) {
        const {outer, inner} = polyArc(x, y, sides, radius, -to, -from, stroke)

        // Обход наружу и обратно внутрь оставляет дырку по правилу ненулевого числа оборотов
        this.fillPath([...outer, ...inner.reverse()], color)
    }

    /** Lines.circleVertices: одиннадцать отрезков плюс по одному на две с половиной единицы. */
    circleSides(radius) {
        return 11 + Math.trunc(radius / this.unit * 0.4)
    }

    /** Заливка по точкам. Пустой путь означает вырожденную фигуру: в игре она не рисуется. */
    fillPath(points, style) {
        if (points === null || points.length === 0) return

        const context = this.context
        context.fillStyle = style
        context.beginPath()

        points.forEach(([px, py], index) => {
            if (index === 0) context.moveTo(px, py)
            else context.lineTo(px, py)
        })

        context.closePath()
        context.fill()
    }

    /** Тайл под точкой холста. Нужен для кликов по миру. */
    at(pixelX, pixelY) {
        return {
            x: Math.floor(pixelX / this.tile),
            y: this.world.height - 1 - Math.floor(pixelY / this.tile)
        }
    }
}

/** Вершины квадрата — на случай, если понадобится заливка, а не обводка. */
export {polyPoints}
