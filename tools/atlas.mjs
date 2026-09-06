/**
 * Чтение упакованного атласа игры — `sprites/sprites.aatls` плюс страницы PNG рядом с ним.
 *
 * Почему источник именно он, а не `assets-raw`: упаковщик игры не только складывает спрайты,
 * он часть их **создаёт**. Мягкие края переходов между полами (`<имя>-edge`) собираются
 * умножением стенсиля на текстуру пола, а юнитам запекается обводка `Pixmaps.outline`
 * радиусом 3 цветом `Pal.darkerMetal`. У кинжала исходник — 40 на 24 точки рисунка,
 * а в атласе 48 на 32: разница и есть обводка. Рисуя исходниками, мы тихо расходились с игрой.
 *
 * Формат `.aatls` — свой, двоичный, big-endian:
 *
 *   "AATLS", байт версии,
 *   далее для каждой страницы: байт 1 (за ним ещё страница; 0 — конец файла),
 *     имя файла (два байта длины плюс UTF-8), ширина и высота (short),
 *     четыре байта фильтров и заворачивания, число регионов (int),
 *     и для каждого региона: имя, left, top, width, height (short),
 *       флаг обрезки — и если он поднят, offsetX, offsetY, originalWidth, originalHeight,
 *       флаг девятипатча — и если поднят, четыре short,
 *       флаг отступов — и если поднят, ещё четыре.
 *
 * Разбор сверен с `TextureAtlas.TextureAtlasData` из arc; байт продолжения страницы там
 * не описан — он появился позже, — но проверка простая: разбор обязан закончиться ровно
 * на конце файла, иначе формат разъехался и мы падаем.
 */

import {existsSync, mkdtempSync, readFileSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'

import {decodePng} from './png.mjs'
import {readEntries, readFile} from './zip.mjs'

const HEADER = 'AATLS'

/** Разбирает указатель атласа. Возвращает страницы и регионы в порядке файла. */
export function readIndex(path) {
    const buffer = readFileSync(path)
    let position = 0

    const byte = () => buffer.readUInt8(position++)
    const short = () => { const value = buffer.readInt16BE(position); position += 2; return value }
    const int = () => { const value = buffer.readInt32BE(position); position += 4; return value }

    const text = () => {
        const length = buffer.readUInt16BE(position)
        position += 2
        const value = buffer.toString('utf8', position, position + length)
        position += length
        return value
    }

    for (const character of HEADER) {
        if (byte() !== character.charCodeAt(0)) throw new Error(`${path}: это не атлас arc`)
    }

    byte()

    const pages = []
    const regions = new Map()

    while (position < buffer.length && byte() !== 0) {
        const image = text()
        const width = short()
        const height = short()

        // Фильтры и заворачивание текстуры: нам они не нужны, но место занимают
        byte(); byte(); byte(); byte()

        const count = int()
        pages.push({image, width, height, count})

        for (let i = 0; i < count; i++) {
            const region = {page: image, name: text(), left: short(), top: short()}
            region.width = short()
            region.height = short()

            // Обрезка: упаковщик срезает прозрачные поля и запоминает, куда вернуть рисунок
            if (byte() !== 0) {
                region.offsetX = short()
                region.offsetY = short()
                region.originalWidth = short()
                region.originalHeight = short()
            }

            if (byte() !== 0) position += 8
            if (byte() !== 0) position += 8

            // Имена в атласе уникальны; повтор означал бы, что разбор разъехался
            if (!regions.has(region.name)) regions.set(region.name, region)
        }
    }

    if (position !== buffer.length) {
        throw new Error(`${path}: разбор кончился на ${position} из ${buffer.length} — формат разъехался`)
    }

    return {pages, regions, directory: dirname(path)}
}

/**
 * Атлас с ленивым чтением страниц: их четыре и вместе они восемь мегабайт,
 * а нужны обычно две.
 */
export class Atlas {
    constructor(path) {
        const {pages, regions, directory} = readIndex(path)

        this.pages = pages
        this.regions = regions
        this.directory = directory
        this.images = new Map()
    }

    has(name) {
        return this.regions.has(name)
    }

    /** Имена регионов, подходящие под условие. */
    names(filter = () => true) {
        return [...this.regions.keys()].filter(filter)
    }

    page(image) {
        const cached = this.images.get(image)
        if (cached !== undefined) return cached

        const path = join(this.directory, image)
        if (!existsSync(path)) throw new Error(`нет страницы атласа ${path}`)

        const decoded = decodePng(readFileSync(path))
        this.images.set(image, decoded)
        return decoded
    }

    /**
     * Вырезает спрайт, возвращая его в исходную рамку: обрезанные поля восстанавливаются
     * прозрачными. Иначе спрайт съедет — половина регионов в атласе обрезана.
     *
     * `offsetY` считается от низа рамки, как принято в атласах, поэтому сверху остаётся
     * `originalHeight - offsetY - height`.
     */
    cut(name) {
        const region = this.regions.get(name)
        if (region === undefined) return null

        const page = this.page(region.page)

        const width = region.originalWidth ?? region.width
        const height = region.originalHeight ?? region.height
        const left = region.offsetX ?? 0
        const top = region.offsetY === undefined ? 0 : height - region.offsetY - region.height

        const pixels = Buffer.alloc(width * height * 4)

        for (let y = 0; y < region.height; y++) {
            const from = ((region.top + y) * page.width + region.left) * 4
            const to = ((top + y) * width + left) * 4
            pixels.set(page.pixels.subarray(from, from + region.width * 4), to)
        }

        return {width, height, pixels}
    }
}

/** Страницы атласа внутри jar. Пятая, `fallback`, для слабых видеокарт — она нам не нужна. */
const PACKED = 'sprites/sprites.aatls'

/**
 * Открывает атлас по пути к `sprites.aatls` или прямо по jar игры: jar это zip, и нужные
 * записи достаются без распаковки всего архива.
 *
 * Так у всех генераторов, снимающих картинки, один вход — тот же jar, что и у дампа спеков.
 */
export function openAtlas(path) {
    if (path === undefined || !existsSync(path)) {
        throw new Error(`не найден ${path ?? 'путь к атласу'}`)
    }

    if (!path.endsWith('.jar')) return new Atlas(path)

    const archive = readEntries(path)
    const index = readFile(archive, PACKED)
    if (index === null) throw new Error(`${path}: внутри нет ${PACKED}`)

    const work = mkdtempSync(join(tmpdir(), 'mlog-atlas-'))
    writeFileSync(join(work, 'sprites.aatls'), index)

    for (const name of archive.entries.keys()) {
        if (!name.startsWith('sprites/sprites') || !name.endsWith('.png')) continue
        writeFileSync(join(work, name.slice('sprites/'.length)), readFile(archive, name))
    }

    return new Atlas(join(work, 'sprites.aatls'))
}
