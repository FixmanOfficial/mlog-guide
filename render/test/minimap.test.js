/**
 * Цвет тайла на миникарте. Порядок веток в `MapIO.colorFor` не косметический: постройка
 * перекрывает всё, стена перекрывает руду, а руда — пол, но только если у неё есть свой цвет.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import {World} from '@mlog/core/src/world.js'
import {tileColor} from '../src/minimap.js'

const teams = {1: '#ffd37f', 2: '#f25555'}

test('пол отдаёт свой цвет, а руда перекрывает его своим', () => {
    const world = new World({width: 5, height: 5, floor: 'darksand'})

    assert.equal(tileColor(world, 1, 1), '#302e2e')

    world.setOverlay(1, 1, 'ore-copper')
    assert.equal(tileColor(world, 1, 1), '#d99d73', 'цвет руды — это цвет её предмета')
})

test('статичная стена перекрывает и пол, и руду', () => {
    const world = new World({width: 5, height: 5, floor: 'darksand'})

    world.setOverlay(2, 2, 'ore-copper')
    world.setWall(2, 2, 'stone-wall')

    assert.equal(tileColor(world, 2, 2), '#7a7a7f')
})

test('постройка красится цветом своей команды, а не блока', () => {
    const world = new World({width: 5, height: 5, floor: 'darksand'})
    world.add('router', {x: 3, y: 3, team: 2})

    assert.equal(tileColor(world, 3, 3, teams), '#f25555')
})
