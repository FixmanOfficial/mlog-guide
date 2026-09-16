/**
 * Метки на карте — то, чем процессор мира рисует поверх происходящего: круги, фигуры,
 * подписи, линии.
 *
 * Классы эти общие с **целями карты** (`MapObjectives`): цель может нести свои метки, и там
 * они те же самые. Поэтому метки живут в мире рядом с флагами, а не внутри процессора.
 *
 * Главная тонкость переноса: у каждого вида свой набор понятных ему свойств, и `setmarker`
 * с чужим свойством не делает **ничего**. Радиус у подписи не меняется, поворот у линии тоже.
 * Каждый вид ниже — это тело его `control`, переписанное подряд, а не таблица «свойство —
 * поле»: параметров три, часть из них складывается в битовую маску, и таблицей это не легло.
 *
 * Вторая тонкость: NaN означает «не трогай». Инструкция передаёт `numOrNan`, и пустая
 * переменная оставляет свойство как было — этим пользуются, чтобы задать только вторую
 * координату.
 */

import {unpackColorBits} from './arc.js'

/** Vars.tilesize: координаты и часть размеров метки приходят в тайлах. */
const TILE = 8

/** MakeMarkerI.maxMarkers */
export const MAX_MARKERS = 20000

/** Layer.overlayUI: слой по умолчанию у всех меток. */
export const OVERLAY_UI = 120

/** WorldLabelComp: подпись рисуется с подложкой и обводкой, и то и другое — биты. */
export const LABEL_BACKGROUND = 1
export const LABEL_OUTLINE = 2

/** arc.util.Align — выравнивание подписи. */
export const ALIGN = {center: 1, top: 2, bottom: 4, left: 8, right: 16}

/** Mathf.FLOAT_ROUNDING_ERROR: игра сравнивает с нулём с допуском, а не точно. */
const EPSILON = 0.000001

/** `!Mathf.equal(p, 0f)` — так игра читает логические параметры меток. */
const flagOf = (value) => Math.abs(value) > EPSILON

/** Pack.bitmask */
const bitmask = (flags, bit, on) => on ? flags | bit : flags & ~bit

const isNaN_ = Number.isNaN
const int = (value) => Math.trunc(value)

/** Цвет из упакованного double в запись `#rrggbb`. */
function colorOf(value) {
    const hex = (channel) => Math.round(channel * 255).toString(16).padStart(2, '0')
    const [r, g, b] = unpackColorBits(value)

    return `#${hex(r)}${hex(g)}${hex(b)}`
}

/**
 * Виды меток: значения по умолчанию и `control`. Порядок разбора внутри каждого — как
 * в `MapObjectives`, включая то, какой параметр за что отвечает.
 *
 * Разбор в игре идёт отдельными блоками: «первый параметр задан», «второй задан»,
 * «первый и третий заданы». Поэтому второй параметр работает и при пустом первом:
 * `setmarker labelFlags id null 1` меняет обводку, не трогая подложку.
 */
const has = (value) => !isNaN_(value)

const TYPES = {
    /** ShapeTextMarker: подпись над фигурой. */
    shapetext: {
        pos: true,
        fields: () => ({
            x: 0, y: 0, text: 'frog', fontSize: 1, textHeight: 7,
            flags: LABEL_BACKGROUND | LABEL_OUTLINE,
            textAlign: ALIGN.center, lineAlign: ALIGN.center,
            radius: 6, rotation: 0, sides: 4, color: '#ffd37f'
        }),
        control(props, control, p1, p2) {
            if (has(p1)) {
                switch (control) {
                    case 'fontSize': props.fontSize = p1; break
                    case 'textHeight': props.textHeight = p1; break
                    case 'textAlign': props.textAlign = int(p1); break
                    case 'lineAlign': props.lineAlign = int(p1); break
                    case 'outline': props.flags = bitmask(props.flags, LABEL_OUTLINE, flagOf(p1)); break
                    case 'labelFlags': props.flags = bitmask(props.flags, LABEL_BACKGROUND, flagOf(p1)); break
                    case 'radius': props.radius = p1; break
                    case 'rotation': props.rotation = p1; break
                    case 'color': props.color = colorOf(p1); break
                    case 'shape': props.sides = int(p1); break
                }
            }

            // Обводка — вторым параметром `labelFlags`
            if (has(p2) && control === 'labelFlags') {
                props.flags = bitmask(props.flags, LABEL_OUTLINE, flagOf(p2))
            }
        }
    },

    /** PointMarker: пульсирующий круг. Радиус здесь единственный, что задаётся в тайлах. */
    point: {
        pos: true,
        fields: () => ({x: 0, y: 0, radius: 5, stroke: 11, color: '#f25555'}),
        control(props, control, p1) {
            if (!has(p1)) return

            switch (control) {
                case 'radius': props.radius = p1; break
                case 'stroke': props.stroke = p1; break
                case 'color': props.color = colorOf(p1); break
            }
        }
    },

    /** ShapeMarker: многоугольник, полый или залитый, целиком или дугой. */
    shape: {
        pos: true,
        fields: () => ({
            x: 0, y: 0, radius: 8, rotation: 0, stroke: 1,
            startAngle: 0, endAngle: 360, fill: false, outline: true,
            sides: 4, color: '#ffd37f'
        }),
        control(props, control, p1, p2, p3) {
            if (has(p1)) {
                switch (control) {
                    case 'radius': props.radius = p1; break
                    case 'stroke': props.stroke = p1; break
                    case 'outline': props.outline = flagOf(p1); break
                    case 'rotation': props.rotation = p1; break
                    case 'color': props.color = colorOf(p1); break
                    case 'shape': props.sides = int(p1); break
                    case 'arc': props.startAngle = p1; break
                }
            }

            // У `shape` заняты все три параметра: стороны, заливка, обводка
            if (has(p2)) {
                if (control === 'shape') props.fill = flagOf(p2)
                if (control === 'arc') props.endAngle = p2
            }

            if (has(p3) && control === 'shape') props.outline = flagOf(p3)
        }
    },

    /** TextMarker: подпись без фигуры. */
    text: {
        pos: true,
        fields: () => ({
            x: 0, y: 0, text: 'uwu', fontSize: 1,
            flags: LABEL_BACKGROUND | LABEL_OUTLINE,
            textAlign: ALIGN.center, lineAlign: ALIGN.center
        }),
        control(props, control, p1, p2) {
            if (has(p1)) {
                switch (control) {
                    case 'fontSize': props.fontSize = p1; break
                    case 'textAlign': props.textAlign = int(p1); break
                    case 'lineAlign': props.lineAlign = int(p1); break
                    case 'outline': props.flags = bitmask(props.flags, LABEL_OUTLINE, flagOf(p1)); break
                    case 'labelFlags': props.flags = bitmask(props.flags, LABEL_BACKGROUND, flagOf(p1)); break
                }
            }

            if (has(p2) && control === 'labelFlags') {
                props.flags = bitmask(props.flags, LABEL_OUTLINE, flagOf(p2))
            }
        }
    },

    /**
     * LineMarker: отрезок. Цвета у концов два, и `color` красит оба сразу, а `colori` —
     * по одному: линия в игре умеет переливаться от одного цвета к другому.
     */
    line: {
        pos: true,
        fields: () => ({
            x: 0, y: 0, endX: 0, endY: 0, stroke: 1, outline: true,
            color1: '#ffd37f', color2: '#ffd37f'
        }),
        control(props, control, p1, p2, p3) {
            if (has(p1)) {
                switch (control) {
                    case 'endPos': props.endX = p1 * TILE; break
                    case 'stroke': props.stroke = p1; break
                    case 'outline': props.outline = flagOf(p1); break

                    case 'color':
                        props.color1 = colorOf(p1)
                        props.color2 = props.color1
                        break
                }
            }

            if (has(p2) && control === 'endPos') props.endY = p2 * TILE

            // Номер конца первым параметром: 0 — начало, 1 — конец, прочее в никуда
            const end = (index, first, second) => int(index) === 0 ? first : int(index) === 1 ? second : null

            if (has(p1) && has(p2)) {
                if (control === 'posi') {
                    const key = end(p1, 'x', 'endX')
                    if (key !== null) props[key] = p2 * TILE
                }

                if (control === 'colori') {
                    const key = end(p1, 'color1', 'color2')
                    if (key !== null) props[key] = colorOf(p2)
                }
            }

            if (has(p1) && has(p3) && control === 'posi') {
                const key = end(p1, 'y', 'endY')
                if (key !== null) props[key] = p3 * TILE
            }
        }
    },

    /** TextureMarker: картинка. Нулевые размеры означают «как есть». */
    texture: {
        pos: true,
        fields: () => ({x: 0, y: 0, width: 0, height: 0, rotation: 0, color: '#ffffff', texture: ''}),
        control(props, control, p1, p2) {
            if (has(p1)) {
                switch (control) {
                    case 'rotation': props.rotation = p1; break
                    case 'textureSize': props.width = p1 * TILE; break
                    case 'color': props.color = colorOf(p1); break
                }
            }

            if (has(p2) && control === 'textureSize') props.height = p2 * TILE
        }
    },

    /**
     * QuadMarker: четырёхугольник по углам. Положения нет — вместо него четыре вершины,
     * у каждой свои координаты, свои координаты текстуры и свой цвет.
     */
    quad: {
        pos: false,
        fields: () => ({
            corners: [0, 1, 2, 3].map(() => ({x: 0, y: 0, u: 0, v: 0, color: '#ffffff'})),
            texture: ''
        }),
        control(props, control, p1, p2, p3) {
            const corner = (index) => index >= 0 && index < 4 ? props.corners[index] : null

            if (has(p1)) {
                switch (control) {
                    // Цветом красятся все четыре вершины сразу
                    case 'color':
                        for (const each of props.corners) each.color = colorOf(p1)
                        break

                    case 'pos': props.corners[0].x = p1 * TILE; break

                    case 'posi': {
                        const at = corner(int(p1))
                        if (at === null) break

                        if (has(p2)) at.x = p2 * TILE
                        if (has(p3)) at.y = p3 * TILE
                        break
                    }

                    case 'uvi': {
                        const at = corner(int(p1))
                        if (at === null) break

                        // Игра зажимает координаты текстуры и переворачивает вторую
                        if (has(p2)) at.u = Math.min(1, Math.max(0, p2))
                        if (has(p3)) at.v = 1 - Math.min(1, Math.max(0, p3))
                        break
                    }
                }
            }

            /*
             * `pos` у четырёхугольника берёт обе координаты нулевой вершины **из первого**
             * параметра. Это ошибка игры (`vertices[1] = p1`), и она воспроизводится как есть:
             * карты уже написаны под неё.
             */
            if (has(p2) && control === 'pos') props.corners[0].y = p1 * TILE

            if (has(p1) && has(p2) && control === 'colori') {
                const at = corner(int(p1))
                if (at !== null) at.color = colorOf(p2)
            }
        }
    }
}

/** Названия видов, как их принимает `makemarker`. MapObjectives.registerMarker */
export const MARKER_TYPES = Object.keys(TYPES)

export class Marker {
    constructor(type) {
        this.type = type
        this.props = TYPES[type].fields()

        // Общее у всех: где показывать и на каком слое. ObjectiveMarker
        this.world = true
        this.minimap = false
        this.light = false
        this.autoscale = false
        this.drawLayer = OVERLAY_UI
    }

    /**
     * ObjectiveMarker.control плюс то, что добавил конкретный вид.
     *
     * Пустой первый параметр отменяет только общую часть: `super.control` возвращается,
     * а вид дальше разбирает свои параметры сам. Поэтому `setmarker pos id null 5`
     * двигает метку по вертикали.
     */
    control(control, p1, p2 = NaN, p3 = NaN) {
        if (!isNaN_(p1)) {
            // Эти пять понимают все виды без исключения
            switch (control) {
                case 'world': this.world = flagOf(p1); break
                case 'minimap': this.minimap = flagOf(p1); break
                case 'light': this.light = flagOf(p1); break
                case 'autoscale': this.autoscale = flagOf(p1); break
                case 'drawLayer': this.drawLayer = p1; break
            }
        }

        // Положение живёт в PosMarker, поэтому его понимают все, кроме четырёхугольника
        if (control === 'pos' && TYPES[this.type].pos) {
            if (!isNaN_(p1)) this.props.x = p1 * TILE
            if (!isNaN_(p2)) this.props.y = p2 * TILE
        }

        TYPES[this.type].control(this.props, control, p1, p2, p3)
        return this
    }

    /** `flushText`: текст приходит из буфера процессора. */
    setText(text) {
        if (this.props.text !== undefined) this.props.text = text
        return this
    }

    setTexture(name) {
        if (this.props.texture !== undefined) this.props.texture = name
        return this
    }
}

/** MapMarkers: метки лежат под своими номерами, и номер выбирает программа. */
export class Markers {
    constructor() {
        this.byId = new Map()
    }

    get size() {
        return this.byId.size
    }

    get(id) {
        return this.byId.get(id) ?? null
    }

    /** `makemarker`: без `replace` метка с занятым номером не перезаписывается. */
    add(id, type, x, y, replace) {
        if (!MARKER_TYPES.includes(type)) return null
        if (this.byId.size >= MAX_MARKERS) return null
        if (!replace && this.byId.has(id)) return null

        const marker = new Marker(type)
        marker.control('pos', x, y)

        this.byId.set(id, marker)
        return marker
    }

    remove(id) {
        this.byId.delete(id)
        return this
    }

    clear() {
        this.byId.clear()
        return this
    }

    /** Все метки в порядке номеров: рендеру нужен устойчивый обход. */
    all() {
        return [...this.byId.entries()].sort(([a], [b]) => a - b).map(([, marker]) => marker)
    }
}
