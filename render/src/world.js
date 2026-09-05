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

import {polyPoints, polyRing} from './geometry.js'

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

/** LogicDisplay.scaleFactor: во сколько раз картинка крупнее своего буфера. */
export const SCALE_FACTOR = 1

/** LogicBlock.range: дальность связи в мировых единицах. content/Blocks.java */
export const LINK_RANGE = {
    'micro-processor': 8 * 10,
    'logic-processor': 8 * 22,
    'hyper-processor': 8 * 42
}

export class WorldView {
    /**
     * @param canvas  холст
     * @param options world — модель мира; tile — пикселей на тайл; atlas и sprites — иконки;
     *                displays — карта «здание дисплея → холст с его картинкой»;
     *                font — семейство шрифта для подписей связей
     */
    constructor(canvas, {world, tile = 32, atlas = null, sprites = null, displays = new Map(), font = 'MlogUi'} = {}) {
        this.canvas = canvas
        this.world = world
        this.tile = tile
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

        this.canvas.width = this.world.width * this.tile * ratio
        this.canvas.height = this.world.height * this.tile * ratio
        this.canvas.style.width = `${this.world.width * this.tile}px`
        this.canvas.style.height = `${this.world.height * this.tile}px`

        this.ratio = ratio
        this.context.imageSmoothingEnabled = false
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

        this.drawGrid()
        for (const building of this.world.buildings) this.drawBuilding(building)

        if (configured !== null) {
            this.drawLinks(configured)
            this.drawSelection(configured)
        }
    }

    /**
     * Уголки выделения. `Drawf.selected` рисует один и тот же спрайт `block-select` четыре раза
     * с поворотами 0, 90, 180 и 270: в спрайте лежит прямоугольный треугольник в углу, поэтому
     * получаются четыре уголка по краям блока. Катет — 12 пикселей спрайта, то есть 3 мировые
     * единицы, цвет `Pal.accent`.
     */
    drawSelection(building) {
        const [cx, cy] = this.place(building)
        const half = building.size * TILE_UNITS / 2 * this.unit
        const leg = 3 * this.unit
        const context = this.context

        context.fillStyle = PAL.accent

        for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
            const x = cx + sx * half
            const y = cy + sy * half

            context.beginPath()
            context.moveTo(x, y)
            context.lineTo(x - sx * leg, y)
            context.lineTo(x, y - sy * leg)
            context.closePath()
            context.fill()
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

        const cell = this.sprites?.index.block?.[building.type]
        const icon = cell === undefined || this.atlas === null ? null : this.icon(cell)

        if (icon === null) {
            // Блока нет в атласе — рисуем заглушкой, чтобы он всё равно был виден
            context.fillStyle = '#2a2a33'
            context.fillRect(cx - side / 2, cy - side / 2, side, side)
        } else {
            context.drawImage(icon, cx - side / 2, cy - side / 2, side, side)
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
     * Связи выделенного процессора. `LogicBlock.drawConfigure`: круг дальности плюс рамка
     * вокруг каждого подключённого здания, и над ней — имя связи.
     */
    drawLinks(building) {
        const [px, py] = this.place(building)
        const range = (LINK_RANGE[building.type] ?? LINK_RANGE['micro-processor']) * this.unit

        // Drawf.circles: окружность из отрезков, тёмная подложка толщиной 3 и цвет толщиной 1
        this.circles(px, py, range, PAL.accent)

        // Связи держит не здание, а сам процессор: страница вешает его на здание сама
        for (const link of building.processor?.links ?? []) {
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

    /** Клетка атласа отдельной картинкой — как в дисплее, ради чистых краёв. */
    icon(cell) {
        // Пока картинка не догрузилась, вырезать нечего — и запоминать пустую клетку нельзя.
        // Проверять только ширину мало: она появляется, едва разобран заголовок, а рисовать
        // такую картинку браузер молча отказывается — в кеш попадала бы пустая клетка.
        // Отсюда пара условий: `complete` про загрузку, ширина про то, что картинка не битая.
        if (!this.atlas.complete || !(this.atlas.naturalWidth > 0)) return null

        const cached = this.icons.get(cell)
        if (cached !== undefined) return cached

        const source = this.sprites.cell
        const canvas = document.createElement('canvas')
        canvas.width = source
        canvas.height = source

        const context = canvas.getContext('2d')
        context.imageSmoothingEnabled = false
        context.drawImage(
            this.atlas,
            (cell % this.sprites.columns) * source, Math.floor(cell / this.sprites.columns) * source,
            source, source,
            0, 0, source, source
        )

        this.icons.set(cell, canvas)
        return canvas
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
