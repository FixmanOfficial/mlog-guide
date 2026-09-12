/**
 * Версия игры, под которую написаны генераторы, — в одном месте.
 *
 * Раньше строка `'v159.7'` лежала копией в тринадцати генераторах и в дампере на Java.
 * При переезде на v160.1 её не поменяли нигде, и все сгенерированные файлы полгода
 * подписывались чужой версией: данные из новой игры, штамп из старой. Проверка версии jar
 * при этом сравнивала константу с константой и поймать ничего не могла.
 *
 * Отсюда два числа вместо одного:
 *
 *   GAME_VERSION    — тег исходников, по которым сняты раскладки, схемы и палитры;
 *   CONTENT_VERSION — сборка jar, из которой сняты спеки контента, спрайты и шрифт.
 *
 * Обычно они совпадают. Расходятся, когда в новой сборке контент не менялся вовсе:
 * тогда качать 87 МБ незачем, но и подписывать выгрузку версией, которой её не снимали,
 * нельзя. Проверять расхождение руками: `git diff <старый> <новый> -- core/src/mindustry/content
 * core/assets` должен быть пуст.
 */

import {readEntries, readFile} from './zip.mjs'

/** Тег исходников. Пин такой же жёсткий, как у самой игры. */
export const GAME_VERSION = 'v160.2'

/** Сборка jar, из которой снят контент. */
export const CONTENT_VERSION = 'v160.2'

/** `gradle.properties`: игра закрепляет arc хешем коммита. */
export const ARC_HASH = '68a04fab6e'

/**
 * Версия jar — из `version.properties` внутри него, а не из имени файла.
 *
 * Файл с именем `Mindustry.jar` в загрузках легко оказывается бетой другой сборки:
 * у сборки 155 нет блока `large-canvas`, и все идентификаторы после него съезжают
 * на единицу. Молча такой дамп разошёлся бы с исходниками.
 */
export function jarVersion(path) {
    const found = readFile(readEntries(path), 'version.properties')

    if (found === null) throw new Error(`${path}: внутри нет version.properties`)

    const build = /^build\s*=\s*(.+)$/m.exec(found.toString('utf8'))

    if (build === null) throw new Error(`${path}: в version.properties нет build`)

    return `v${build[1].trim()}`
}

/** Падает, если jar не той сборки, из которой снят контент. */
export function checkJar(path) {
    const found = jarVersion(path)

    if (found !== CONTENT_VERSION) {
        throw new Error(`jar не той версии: ${found}, а нужен ${CONTENT_VERSION}`)
    }

    return found
}
