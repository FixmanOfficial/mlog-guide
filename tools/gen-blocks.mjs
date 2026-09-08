/**
 * Собирает спрайты блоков мира в атлас `render/assets/blocks.png` и указатель
 * `core/data/block-sprites.json`.
 *
 * Источник — упакованный атлас игры: у части блоков спрайт там не тот, что в исходниках,
 * потому что упаковщик собирает его из слоёв. Брать надо то, что игра рисует, а не то,
 * из чего она это собирает.
 *
 * Берутся блоки логики и то, что сцена умеет ставить рядом с ними. Когда появится
 * строительный интерфейс, ограничение снимется: каталог из 258 строимых блоков уже
 * лежит в `block-specs.json`.
 *
 *   node tools/gen-blocks.mjs <путь-к-Mindustry.jar>
 */

import {writeFileSync} from 'node:fs'

import {openAtlas} from './atlas.mjs'
import {pack} from './pack.mjs'
import {BLOCK_SPECS} from '../core/src/world.js'
import teams from '../core/data/teams.json' with {type: 'json'}

/**
 * Ширина атласа. Спрайты идут в родном разрешении, и самый крупный — ядро-цитадель,
 * девять тайлов, то есть 288 пикселей. Всё вместе укладывается примерно в квадрат
 * со стороной 1500, поэтому берём 2048: степень двойки, и запас на новые блоки.
 */
const WIDTH = 2048

/** Пиксель на тайл: спрайты игры вчетверо крупнее мировых единиц, а тайл это 8 единиц. */
const PER_TILE = 32

/**
 * Блоки для карты: всё, что игра разрешает строить, плюс привилегированные — их в игре
 * не поставить, они есть только в редакторе карт, но процессор мира на карте нужен.
 *
 * Раньше здесь стоял список под одну сцену. Он и держался ровно до строительного
 * интерфейса: поставить теперь можно любой из 258 блоков, и рисовать их иконкой
 * из атласа контента нельзя — она приведена к 48 точкам и на карте расплывается.
 */
const BLOCKS = Object.entries(BLOCK_SPECS)
    .filter(([, spec]) => (spec.canBeBuilt === true && spec.buildVisibility !== 'hidden'
        && spec.buildVisibility !== 'debugOnly') || spec.privileged === true)
    .map(([name]) => name)

/**
 * Состояния, которые рисуются поверх или вместо основного спрайта: включённый тумблер
 * (`SwitchBlock.draw`) и открытая дверь (`Door.draw`).
 */
const STATES = ['switch-on', 'door-open']

/**
 * Пометки поверх мира, а не блоки: уголки выделения `Drawf.selected` рисует спрайтом
 * `block-select` — по одному на угол, с поворотом на девяносто градусов каждый.
 */
const MARKS = ['block-select']

/**
 * Команды со своей палитрой: у них накладка нарисована отдельным спрайтом и в цвет
 * не красится. У остальных берётся общая накладка и перекрашивается цветом команды.
 * `Block.init`: `teamRegions[team.id] = ... team.hasPalette ? find(name + "-team-" + team.name, teamRegion) : teamRegion`
 */
const PALETTE_TEAMS = Object.entries(teams.teams)
    .filter(([, team]) => Array.isArray(team.palette) && team.palette.length > 0)
    .map(([name]) => name)

function main() {
    const atlas = openAtlas(process.argv[2])

    const found = []

    for (const name of [...BLOCKS, ...STATES, ...MARKS]) {
        /*
         * Цельного спрайта есть не у всех, и игра для каждого случая держит своё имя:
         *
         *  - у сборных турелей это `<имя>-preview`, им же рисуется иконка;
         *  - у конвейера и протока спрайт разбит на соединения и кадры, а иконкой
         *    служит `<имя>-0-0` — прямой участок в первом кадре (`Conveyor.icons`);
         *  - у трубы то же самое с `<имя>-top-0`, а у стен с вариантами — `<имя>1`.
         *
         * Соединения мы не выбираем: конвейер на карте всегда прямой.
         */
        const image = [name, `${name}-preview`, `${name}-0-0`, `${name}-top-0`, `${name}1`]
            .reduce((found, candidate) => found ?? atlas.cut(candidate), null)

        if (image === null) {
            console.error(`Пропущен ${name}: в атласе нет ни спрайта, ни предпросмотра`)
            continue
        }

        /*
         * Размер спрайта не обязан совпадать со стороной блока: у ремонтной точки он
         * 34 при блоке в 32, у массдрайвера с грузом — 98 при 96. Игра рисует регион
         * как есть, деля на `Draw.scl`, поэтому размеры пишутся в указатель, а рендер
         * считает по ним, а не по стороне блока.
         */
        found.push({name, image})

        /*
         * Накладка команды: `<имя>-team`, а у команд с палитрой ещё и своя,
         * `<имя>-team-<команда>`. Без неё хранилище и ядро выходят белыми, и игрок
         * не узнаёт собственный блок: жёлтые уголки — это как раз она.
         * BuildingComp.drawTeamTop
         */
        for (const suffix of ['team', ...PALETTE_TEAMS.map(team => `team-${team}`)]) {
            const overlay = atlas.cut(`${name}-${suffix}`)
            if (overlay !== null) found.push({name: `${name}-${suffix}`, image: overlay})
        }
    }

    if (found.length === 0) throw new Error('не нашлось ни одного спрайта блока')

    const {png, width, height, sprites} = pack(found, WIDTH)
    writeFileSync('render/assets/blocks.png', png)

    writeFileSync('core/data/block-sprites.json', JSON.stringify({
        gameVersion: 'v159.7',
        source: 'sprites/sprites.aatls из Mindustry.jar',
        note: 'Файл сгенерирован, править вручную нельзя. Спрайты лежат в своём разрешении: '
            + 'сторона блока в тайлах, умноженная на 32.',
        atlas: 'render/assets/blocks.png',
        width,
        height,
        sprites
    }, null, 2) + '\n')

    console.log(`render/assets/blocks.png: ${width} на ${height}, ${found.length} спрайтов`)
}

main()
