/**
 * Стенд рендера: мир слева, дисплей справа, программа снизу.
 *
 * Это ещё не песочница — здесь нет ни редактора мира, ни таблицы переменных. Задача одна:
 * убедиться, что мир и дисплей рисуются так же, как в игре.
 */

import {World} from '@mlog/core/src/world.js'
import {Processor, IPT} from '@mlog/core/src/vm.js'
import {createContent} from '@mlog/core/src/content.js'
import logicIds from '@mlog/core/data/logic-ids.json'
import sprites from '@mlog/core/data/sprites.json'

import atlasUrl from '../../editor/assets/content.webp'
import fontUrl from '../assets/logic.woff2'
import uiFontUrl from '../../editor/assets/ui.woff2'

import {DisplayView} from '../src/display.js'
import {WorldView} from '../src/world.js'

const content = createContent(logicIds)

const SAMPLES = {
    'Фигуры': `draw clear 20 20 30
draw color 255 180 0 255
draw stroke 3
draw line 5 5 70 35
draw color 0 200 255 255
draw rect 5 45 25 20
draw color 255 255 255 255
draw lineRect 40 45 25 25
draw color 200 60 255 255
draw poly 20 20 6 12 0
draw color 60 255 120 255
draw triangle 45 5 70 5 58 25
drawflush display1`,

    'Текст': `draw clear 0 0 0
draw color 255 255 255 255
print "mlog"
draw print 40 55 @center
print "guide"
draw print 40 40 @center
op idiv s @time 1000
op mod s s 60
print s
draw print 40 20 @center
drawflush display1`,

    'Иконки': `draw clear 25 25 30
draw image 20 60 @copper 24 0
draw image 60 60 @router 24 0
draw image 20 20 @titanium 24 0
draw image 60 20 @dagger 24 45
drawflush display1`,

    'Границы координат': `draw clear 10 10 10
draw color 255 80 80 255
draw rect 600 50 20 20
draw color 80 255 80 255
draw rect 88 20 20 20
drawflush display1`,

    'Часы': `op idiv s @time 1000
op mod s s 60
draw clear 0 0 0
draw color 255 255 255 255
draw linePoly 40 40 40 30 0
op mul a s 6
op sub a 90 a
op cos dx a
op sin dy a
op mul dx dx 26
op mul dy dy 26
op add dx dx 40
op add dy dy 40
draw stroke 2
draw line 40 40 dx dy
drawflush display1`,

    'Мир': `sensor open switch1 @enabled
control enabled door1 open
write @tick cell1 0
print "тумблер: "
print open
printflush message1
draw clear 0 0 0
draw color 255 210 120 255
draw rect 10 10 open 60
drawflush display1`
}

// Шрифты грузит страница: рендер только называет семейство
const logicFont = new FontFace('MlogLogic', `url(${fontUrl})`)
const uiFont = new FontFace('MlogUi', `url(${uiFontUrl})`)
document.fonts.add(logicFont)
document.fonts.add(uiFont)

const atlas = new Image()
atlas.src = atlasUrl

const codeArea = document.querySelector('#code')
const sampleBox = document.querySelector('#sample')
const note = document.querySelector('#note')

for (const name of Object.keys(SAMPLES)) {
    const option = document.createElement('option')
    option.value = name
    option.textContent = name
    sampleBox.append(option)
}

/** Сцена: процессор, дисплей и всё, на чём проверяются sensor и control. */
const world = new World({width: 18, height: 10})
const display = world.add('logic-display', {x: 12, y: 6})
const cell = world.add('memory-cell', {x: 4, y: 2})
const message = world.add('message', {x: 6, y: 2})
const toggle = world.add('switch', {x: 4, y: 7})
const door = world.add('door', {x: 6, y: 7})
const cpu = world.add('micro-processor', {x: 8, y: 4})

const displayView = new DisplayView(document.querySelector('#display'), {
    size: display.spec.displaySize,
    pixelRatio: 4,
    atlas,
    sprites
})

const worldView = new WorldView(document.querySelector('#world'), {
    world,
    tile: 40,
    atlas,
    sprites,
    displays: new Map([[display, displayView.canvas]])
})

const displayCanvas = displayView.canvas
displayCanvas.style.width = `${display.spec.displaySize * 2}px`
displayCanvas.style.height = `${display.spec.displaySize * 2}px`

let processor = null
let running = false

function build(code) {
    processor = new Processor(code, {
        links: [display, cell, message, toggle, door],
        world,
        content,
        globals: content.globals,
        ipt: IPT.micro
    })

    // Связи в игре держит процессор; здание о них знает, потому что это одно и то же
    cpu.processor = processor
    world.processors = [processor]
    world.tick = 0
    displayView.reset()

    const errors = processor.diagnostics ?? []
    note.textContent = errors.length === 0
        ? 'Мир 18 на 10, тайл 40 пикселей. Круг — дальность связи процессора, рамки — подключённые блоки.'
        : errors.map(error => `строка ${error.line}: ${error.code}`).join('\n')
}

/** Один кадр игры: тик мира, потом отрисовка — дисплей вычерпывает очередь именно здесь. */
function frame() {
    world.step()
    displayView.draw(display)
    worldView.draw({selected: cpu})

    document.querySelector('#state').textContent =
        `тик ${world.tick} · ${message.message || 'сообщение пусто'} · cell1[0] = ${cell.read(0)}`

    if (running) requestAnimationFrame(frame)
}

function restart() {
    build(codeArea.value)
    if (!running) {
        running = true
        requestAnimationFrame(frame)
    }
}

document.querySelector('#run').addEventListener('click', restart)
document.querySelector('#pause').addEventListener('click', () => {
    running = !running
    if (running) requestAnimationFrame(frame)
})
document.querySelector('#step').addEventListener('click', () => {
    running = false
    world.step()
    displayView.draw(display)
    worldView.draw({selected: cpu})
})

// Тумблером щёлкают мышью: sensor должен это увидеть
worldView.canvas.addEventListener('click', (event) => {
    const box = worldView.canvas.getBoundingClientRect()
    const spot = worldView.at(event.clientX - box.left, event.clientY - box.top)
    const building = world.at(spot.x, spot.y)

    if (building === toggle) toggle.enabled = !toggle.enabled
})

sampleBox.addEventListener('change', () => {
    codeArea.value = SAMPLES[sampleBox.value]
    restart()
})

codeArea.value = SAMPLES['Фигуры']

// decode, а не событие load: картинка из кеша успевает загрузиться раньше подписки
Promise.all([logicFont.load(), uiFont.load(), atlas.decode()]).then(restart, () => {})
restart()
