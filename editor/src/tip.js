/**
 * Подсказка как в игре: чёрная плашка у курсора, а на телефоне — по долгому нажатию.
 *
 * До этого подсказки были обычным `title`: браузер показывает его через секунду, своим
 * шрифтом и не показывает вовсе на телефоне. В игре не так — `LCanvas.tooltip` вешает
 * `Tooltip` с `instant = true`, то есть плашка появляется сразу, а на мобильном её вызывает
 * долгое нажатие (`ElementGestureListener`, порог 0.43 секунды) и убирает отпускание.
 *
 * Числа отсюда: `Tooltip.Tooltips` — смещение от курсора 15 и 19, отступ от края экрана 7;
 * `Styles.black8` — чёрный с прозрачностью 0.8; текст `[lightgray]` это `#bfbfbf`,
 * а `Styles.outlineLabel` даёт ему обводку.
 *
 * Плашка одна на всю страницу и живёт в `body`: у подсказки внутри прокручиваемого редактора
 * иначе обрезались бы края.
 */

/** `Tooltips.offsetX` и `offsetY`: подсказка встаёт правее и выше курсора. */
const OFFSET_X = 15
const OFFSET_Y = 19

/** `Tooltips.edgeDistance`: ближе этого к краю окна плашка не подходит. */
const EDGE = 7

/** `ElementGestureListener(20, 0.4f, 0.43f, 0.15f)`: столько держать палец. */
const LONG_PRESS_MS = 430

let node = null
let timer = null

/**
 * За чем следит открытая подсказка: сам элемент и точка внутри него, у которой стояла плашка.
 *
 * В игре подсказка живёт в той же сцене, что и строка, и уезжает вместе с ней. У нас страница
 * прокручивается сама по себе, и плашка с `position: fixed` оставалась висеть посреди экрана.
 */
let anchored = null

/** Плашка. Заводится при первой подсказке, дальше переиспользуется. */
function element() {
    if (node !== null) return node

    node = document.createElement('div')
    node.className = 'tip'
    node.hidden = true
    document.body.appendChild(node)

    // Подписка ставится здесь, а не при загрузке модуля: на сервере окна нет вовсе
    window.addEventListener('scroll', follow, true)
    window.addEventListener('resize', follow)

    return node
}

/** Двигает открытую подсказку за её строкой; ушла строка с экрана — убирает вовсе. */
function follow() {
    if (anchored === null || node === null || node.hidden) return

    const box = anchored.element.getBoundingClientRect()

    if (box.bottom < 0 || box.top > window.innerHeight) {
        hideTip()
        return
    }

    place(box.left + anchored.dx, box.top + anchored.dy)
}

/** Ставит плашку у точки. `Tooltip.setContainerPosition`: выше точки, а если не влезает — ниже. */
function place(x, y) {
    const tip = element()
    const box = tip.getBoundingClientRect()

    let left = x + OFFSET_X
    let top = y - OFFSET_Y - box.height

    if (top < EDGE) top = y + OFFSET_Y

    left = Math.max(EDGE, Math.min(left, window.innerWidth - EDGE - box.width))
    top = Math.max(EDGE, Math.min(top, window.innerHeight - EDGE - box.height))

    tip.style.left = `${left}px`
    tip.style.top = `${top}px`
}

/**
 * Показать подсказку у точки. `Tooltip.setContainerPosition`: плашка ставится выше точки,
 * а если не влезает — ниже, и в обоих случаях прижимается к экрану отступом `edgeDistance`.
 */
export function showTip(text, x, y, element_ = null) {
    if (!text) return

    const tip = element()

    tip.textContent = text
    tip.hidden = false

    // Запоминаем, за чем следить: плашка должна уехать вместе со строкой
    anchored = element_ === null ? null : (() => {
        const box = element_.getBoundingClientRect()
        return {element: element_, dx: x - box.left, dy: y - box.top}
    })()

    place(x, y)
}

export function hideTip() {
    if (timer !== null) {
        clearTimeout(timer)
        timer = null
    }

    anchored = null
    if (node !== null) node.hidden = true
}

/**
 * Свойства для элемента, у которого есть подсказка. Раскладываются в JSX через `{...}`:
 * мышь показывает плашку сразу, палец — после долгого нажатия.
 *
 * Пустой текст даёт пустой набор свойств: элемент без подсказки не должен обзаводиться
 * ни обработчиками, ни лишними атрибутами.
 */
export function tipProps(text) {
    if (!text) return {}

    return {
        onMouseEnter: (event) => showTip(text, event.clientX, event.clientY, event.currentTarget),
        onMouseMove: (event) => showTip(text, event.clientX, event.clientY, event.currentTarget),
        onMouseLeave: hideTip,

        onPointerDown: (event) => {
            if (event.pointerType === 'mouse') return

            hideTip()

            // currentTarget к моменту таймера уже пуст: событие к тому времени отработало
            const {currentTarget: target, clientX: x, clientY: y} = event
            timer = setTimeout(() => showTip(text, x, y, target), LONG_PRESS_MS)
        },

        // На телефоне подсказка держится, пока держат палец. Tooltip.touchUp
        onPointerUp: hideTip,
        onPointerCancel: hideTip
    }
}
