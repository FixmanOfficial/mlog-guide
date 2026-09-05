/**
 * Стенд дисплея: программа слева, дисплей справа.
 *
 * Здесь нет ничего от песочницы — только проверка, что команды `draw` доезжают до холста
 * такими же, какими их видит игра.
 */

import {World} from '@mlog/core/src/world.js'
import {Processor} from '@mlog/core/src/vm.js'
import {createContent} from '@mlog/core/src/content.js'
import logicIds from '@mlog/core/data/logic-ids.json'
import sprites from '@mlog/core/data/sprites.json'

import atlasUrl from '../../editor/assets/content.png'
import fontUrl from '../assets/logic.ttf'

import {DisplayView} from '../src/display.js'

const content = createContent(logicIds)

const SAMPLES = {
    'Фигуры': `draw clear 20 20 30
draw color 255 180 0 255
draw stroke 3
draw line 10 10 70 40
draw color 0 200 255 255
draw rect 10 50 30 20
draw color 255 255 255 255
draw lineRect 50 50 25 25
draw color 200 60 255 255
draw poly 30 110 6 20 0
draw linePoly 90 110 5 20 15
draw color 60 255 120 255
draw triangle 120 20 170 20 145 60
drawflush display1`,

    'Текст': `draw clear 0 0 0
draw color 255 255 255 255
print "mlog.guide"
draw print 88 120 @center
print "left"
draw print 4 90 @bottomLeft
print "\\n2 lines"
draw print 88 40 @center
drawflush display1`,

    'Границы координат': `draw clear 10 10 10
draw color 255 80 80 255
draw rect 600 20 20 20
draw color 80 255 80 255
draw rect 88 60 20 20
draw color 255 255 255 255
print "600 = 88"
draw print 88 130 @center
drawflush display1`,

    'Иконки': `draw clear 25 25 30
draw image 40 130 @copper 32 0
draw image 90 130 @router 32 0
draw image 140 130 @dagger 32 45
draw image 40 80 @water 32 0
draw image 90 80 @titanium 32 0
draw image 140 80 @silicon 32 0
drawflush display1`,

    'Преобразования': `draw clear 0 0 0
draw color 255 200 0 255
draw translate 88 88
draw rotate 0 0 20
draw scale 1.5 1.5
draw lineRect -20 -20 40 40
draw reset
draw color 120 200 255 255
draw lineRect 4 4 40 40
drawflush display1`,

    'Часы': `set t @time
op idiv s t 1000
op mod s s 60
draw clear 0 0 0
draw color 255 255 255 255
draw linePoly 88 88 40 60 0
op mul a s 6
op sub a 90 a
op cos dx a
op sin dy a
op mul dx dx 50
op mul dy dy 50
op add dx dx 88
op add dy dy 88
draw stroke 2
draw line 88 88 dx dy
drawflush display1`
}

// Шрифт дисплея грузится страницей: рендер только называет семейство
const logicFont = new FontFace('MlogLogic', `url(${fontUrl})`)
document.fonts.add(logicFont)

const canvas = document.querySelector('#display')
const codeArea = document.querySelector('#code')
const sampleBox = document.querySelector('#sample')
const note = document.querySelector('#note')

for (const name of Object.keys(SAMPLES)) {
    const option = document.createElement('option')
    option.value = name
    option.textContent = name
    sampleBox.append(option)
}

const atlas = new Image()
atlas.src = atlasUrl

const view = new DisplayView(canvas, {
    size: 176,
    pixelRatio: 3,
    atlas,
    sprites
})

canvas.style.width = '352px'
canvas.style.height = '352px'

let world
let display
let processor

function build(code) {
    world = new World()
    display = world.add('large-logic-display')
    processor = new Processor(code, {links: [display], world, content, globals: content.globals})
    world.addProcessor(processor)
}

function run() {
    build(codeArea.value)

    // Рисуем после каждого тика, как игра: иначе очередь дисплея переполнится и
    // картинка оборвётся на середине — предел в 1024 команды никуда не делся
    for (let i = 0; i < 60; i++) {
        world.step()
        view.draw(display)
    }

    const errors = processor.diagnostics ?? []
    note.textContent = errors.length === 0
        ? 'Дисплей 176 на 176, начало координат в левом нижнем углу. Картинка накапливается: стирает её только draw clear.'
        : errors.map(error => `${error.line}: ${error.code}`).join('\n')
}

document.querySelector('#run').addEventListener('click', run)
document.querySelector('#clear').addEventListener('click', () => view.reset())

sampleBox.addEventListener('change', () => {
    codeArea.value = SAMPLES[sampleBox.value]
    run()
})

codeArea.value = SAMPLES['Фигуры']
atlas.addEventListener('load', run)
logicFont.load().then(run)
run()
