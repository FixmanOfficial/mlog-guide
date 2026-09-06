/**
 * Отрисовка логического дисплея.
 *
 * Повторяет `LogicDisplay.processCommands`: команды вычерпываются из очереди здания и рисуются
 * в холст, как игра рисует их в `FrameBuffer`. Отсюда три следствия, из-за которых нельзя просто
 * «нарисовать список фигур»:
 *
 *  - **картинка накапливается.** Холст не чистится между сбросами: `drawflush` дорисовывает
 *    поверх, а стереть можно только командой `clear`;
 *  - **цвет, толщина и преобразование живут дольше команды.** Они переживают и `drawflush`,
 *    и следующий кадр, пока их не сменят;
 *  - **начало координат в левом нижнем углу.** Игра рисует буфер проекцией `(0, 0, w, h)`,
 *    поэтому ось Y смотрит вверх, а не вниз, как в холсте.
 *
 * Здесь нет ни одного собственного решения о внешнем виде: цвет фона, предел числа сторон,
 * шаг масштаба и вид каждой фигуры сняты из игры и arc.
 */

import {
    identity, multiply, translate, scale, rotate,
    packedColor, lineQuad, rectBorders, polyPoints, polyRing
} from './geometry.js'

/** LogicDisplay.backgroundColor = Pal.darkerMetal. graphics/Pal.java:35 */
export const BACKGROUND = '#565666'

/** LogicDisplay.maxSides */
export const MAX_SIDES = 25

/** LogicDisplay.scaleStep */
export const SCALE_STEP = 0.05

/** Fonts.logic растеризуется размером 16. ui/Fonts.java:92-98 */
export const FONT_SIZE = 16

export class DisplayView {
    /**
     * @param canvas   холст, размер которого выставляет сам вид
     * @param options  size — сторона дисплея в точках; pixelRatio — сколько пикселей на точку;
     *                 atlas и sprites — атлас иконок контента и указатель к нему;
     *                 font — семейство шрифта дисплея, уже загруженное страницей
     */
    constructor(canvas, {size = 80, pixelRatio = 1, atlas = null, sprites = null, font = 'MlogLogic'} = {}) {
        this.canvas = canvas
        this.size = size
        this.pixelRatio = pixelRatio
        this.atlas = atlas
        this.sprites = sprites
        this.font = font

        canvas.width = size * pixelRatio
        canvas.height = size * pixelRatio

        this.context = canvas.getContext('2d')
        this.icons = new Map()
        this.reset()
    }

    /** Приводит дисплей к состоянию свежепоставленного: фон, белый цвет, толщина 1. */
    reset() {
        this.color = {r: 255, g: 255, b: 255, a: 255}
        this.stroke = 1
        this.transform = identity()

        const context = this.context
        context.setTransform(1, 0, 0, 1, 0, 0)
        context.fillStyle = BACKGROUND
        context.fillRect(0, 0, this.canvas.width, this.canvas.height)
        context.imageSmoothingEnabled = false
    }

    /** Забирает у здания накопленные команды и рисует их. */
    draw(display) {
        this.replay(display.take())
    }

    replay(commands) {
        for (const command of commands) this.run(command)
    }

    run(command) {
        const {type, x, y, p1, p2, p3, p4} = command

        switch (type) {
            // Core.graphics.clear заливает весь буфер, преобразование ему не указ
            case 'clear': return this.fillBackground(`rgb(${x & 0xff} ${y & 0xff} ${p1 & 0xff})`)

            case 'color': {
                this.color = packedColor(x, y, p1, p2)
                return
            }

            // Толщина всегда целая: параметр успел пройти через приведение к int
            case 'stroke': return void (this.stroke = x)

            case 'line': {
                const quad = lineQuad(x, y, p1, p2, this.stroke)
                if (quad !== null) this.fillPath(quad)
                return
            }

            case 'rect': return this.fillRect(x, y, p1, p2)

            case 'lineRect': {
                // Четыре отдельные заливки: на углах они и в игре ложатся друг на друга
                for (const [rx, ry, rw, rh] of rectBorders(x, y, p1, p2, this.stroke)) {
                    this.fillRect(rx, ry, rw, rh)
                }
                return
            }

            case 'poly': return this.fillPath(polyPoints(x, y, sides(p1), p2, p3))

            case 'linePoly': {
                const ring = polyRing(x, y, sides(p1), p2, p3, this.stroke)
                this.fillPath(ring.outer, ring.inner)
                return
            }

            case 'triangle': return this.fillPath([[x, y], [p1, p2], [p3, p4]])

            case 'image': return this.drawImage(command)

            case 'print': return this.drawGlyph(command)

            case 'translate': return void (this.transform = translate(this.transform, x, y))

            // Масштаб приходит числом шагов по 0.05
            case 'scale': return void (this.transform = scale(this.transform, x * SCALE_STEP, y * SCALE_STEP))

            // Угол лежит в p1, а не в x: LogicDisplay.processCommands
            case 'rotate': return void (this.transform = rotate(this.transform, p1))

            case 'reset': return void (this.transform = identity())
        }
    }

    /** Матрица холста: перевод координат дисплея в пиксели плюс собственное преобразование. */
    applyTransform() {
        const ratio = this.pixelRatio
        const flip = [ratio, 0, 0, -ratio, 0, this.size * ratio]
        const [a, b, c, d, e, f] = multiply(flip, this.transform)

        this.context.setTransform(a, b, c, d, e, f)
        this.context.fillStyle = this.style()
    }

    style() {
        const {r, g, b, a} = this.color
        return `rgb(${r} ${g} ${b} / ${a / 255})`
    }

    fillBackground(style) {
        const context = this.context
        context.setTransform(1, 0, 0, 1, 0, 0)
        context.fillStyle = style
        context.fillRect(0, 0, this.canvas.width, this.canvas.height)
    }

    fillRect(x, y, width, height) {
        this.applyTransform()
        this.context.fillRect(x, y, width, height)
    }

    /** Заливка по вершинам. Второе кольцо, если оно есть, вырезает дырку правилом чётности. */
    fillPath(...rings) {
        this.applyTransform()

        const context = this.context
        context.beginPath()

        for (const points of rings) {
            points.forEach(([px, py], index) => {
                if (index === 0) context.moveTo(px, py)
                else context.lineTo(px, py)
            })
            context.closePath()
        }

        context.fill('evenodd')
    }

    /**
     * Иконка контента. В игре это `Draw.rect(icon, x, y, p2, p2 / соотношение, p3)`:
     * центр в точке, ширина `size`, поворот против часовой стрелки.
     */
    drawImage({x, y, p2, p3, content}) {
        if (this.atlas === null || this.sprites === null || content == null) return

        const entry = this.sprites.index[content.contentType]?.[content.name]
        if (entry === undefined) return

        const icon = this.icon(entry)
        if (icon === null) return

        // Draw.rect(icon, x, y, p2, p2 / icon.ratio()): ширина задана, высота идёт
        // из пропорций картинки. Неквадратных иконок в игре три десятка
        const height = p2 * entry.height / entry.width

        this.applyTransform()
        const context = this.context
        context.save()
        context.translate(x, y)
        context.rotate(p3 * Math.PI / 180)
        // Ось Y дисплея смотрит вверх, а картинка нарисована сверху вниз
        context.scale(1, -1)
        context.drawImage(icon, -p2 / 2, -height / 2, p2, height)
        context.restore()
    }

    /**
     * Клетка атласа отдельной картинкой. Повёрнутый `drawImage` с вырезкой из общего атласа
     * прихватывает соседний столбец пикселей по краю — на иконке под углом это видно полосой.
     * Клетка вырезается один раз и дальше рисуется целиком, так что захватывать нечего.
     */
    icon(entry) {
        // Пока картинка не догрузилась, вырезать нечего — и запоминать пустую клетку нельзя.
        // Проверять только ширину мало: она появляется, едва разобран заголовок, а рисовать
        // такую картинку браузер молча отказывается — в кеш попадала бы пустая клетка.
        // Отсюда пара условий: `complete` про загрузку, ширина про то, что картинка не битая.
        if (!this.atlas.complete || !(this.atlas.naturalWidth > 0)) return null

        const key = `${entry.x}:${entry.y}`
        const cached = this.icons.get(key)
        if (cached !== undefined) return cached

        const canvas = document.createElement('canvas')
        canvas.width = entry.width
        canvas.height = entry.height

        const context = canvas.getContext('2d')
        context.imageSmoothingEnabled = false
        context.drawImage(
            this.atlas,
            entry.x, entry.y, entry.width, entry.height,
            0, 0, entry.width, entry.height
        )

        this.icons.set(key, canvas)
        return canvas
    }

    /**
     * Один символ. В игре глиф кладётся так, что **базовая линия попадает ровно в y**:
     * `Draw.rect` центрирует четырёхугольник в `y + h/2 + yoffset + capHeight + ascent`,
     * а `capHeight + ascent` в arc это и есть расстояние от верха строки до базовой линии.
     */
    drawGlyph({x, y, char}) {
        this.applyTransform()

        const context = this.context
        context.save()
        context.translate(x, y)
        context.scale(1, -1)
        context.font = `${FONT_SIZE}px "${this.font}"`
        context.textBaseline = 'alphabetic'
        context.textAlign = 'left'
        context.fillText(char, 0, 0)
        context.restore()
    }
}

/** Число сторон многоугольника ограничено сверху. LogicDisplay.maxSides */
const sides = (value) => Math.min(value, MAX_SIDES)
