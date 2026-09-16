/**
 * Уроки курса из коллекции страниц.
 *
 * Курс разложен по папкам: `<локаль>/course/<группа>/<урок>`. Группа — это инструкция,
 * и папка называется её именем: имена инструкций не переводятся, поэтому и адрес у группы
 * одинаковый на всех языках. Там, где под одним именем разбирают семейство инструкций,
 * группа называется темой — `flow`, «Ход программы».
 *
 * Сами группы разложены по **категориям игры**: тем же, что читатель видит в меню
 * «Добавить» и в справочнике. Плоским списком групп к концу курса вышло бы восемнадцать
 * пунктов подряд, а категорий всегда шесть, и они читателю уже знакомы.
 *
 * Порядок уроков внутри группы — `sidebar.order` в шапке страницы; порядок частей и групп
 * задан здесь: он смысловой, а не алфавитный.
 */

import {getCollection} from 'astro:content'

import {GROUPS, PARTS} from './parts.js'

export {GROUPS, PARTS} from './parts.js'

/** Уроки одной группы, в порядке `sidebar.order`. */
export async function groupLessons(locale, group) {
    const prefix = `${locale}/course/${group}/`

    const entries = (await getCollection('docs'))
        .filter(entry => entry.id.startsWith(prefix))
        // Страница самой группы — не урок: она про группу целиком
        .filter(entry => !entry.id.endsWith('/index') && entry.id !== prefix.slice(0, -1))

    return entries
        .sort((a, b) => (a.data.sidebar?.order ?? 0) - (b.data.sidebar?.order ?? 0))
        .map(entry => ({
            slug: entry.id,
            href: `/${entry.id}/`,
            title: entry.data.title,
            lead: entry.data.lead ?? null,
            difficulty: entry.data.difficulty ?? 'easy'
        }))
}

/**
 * Урок группы, у которой урок один: им служит сама страница группы.
 *
 * У `end` и `stop` разговора на два урока нет, и заводить ради этого «Обзор» плюс
 * единственный урок — издевательство над читателем. Признак такой страницы — сложность
 * в шапке: обзоры её не ставят.
 */
function singleLesson(page, locale, group) {
    if (page === undefined || page.data.difficulty === undefined) return []

    return [{
        slug: page.id,
        href: `/${locale}/course/${group}/`,
        title: page.data.title,
        lead: page.data.lead ?? null,
        difficulty: page.data.difficulty
    }]
}

/** Все группы, у которых есть хоть один урок, в порядке `GROUPS`. */
export async function courseGroups(locale) {
    const groups = []

    for (const group of GROUPS) {
        const page = (await getCollection('docs'))
            .find(entry => entry.id === `${locale}/course/${group}`
                || entry.id === `${locale}/course/${group}/index`)

        const lessons = (await groupLessons(locale, group))
            .concat(singleLesson(page, locale, group))

        if (lessons.length === 0) continue

        groups.push({
            name: group,

            /*
             * Как группа называется, решает её собственная страница. У групп-инструкций
             * это имя инструкции — оно не переводится, — а у тех, что не про инструкцию,
             * человеческое название: «Основы», а не `basics`.
             */
            title: page?.data.title ?? group,
            href: page === undefined ? lessons[0].href : `/${page.id.replace(/\/index$/, '')}/`,
            lead: page?.data.lead ?? null,
            lessons
        })
    }

    return groups
}

/**
 * Курс частями: у части либо своя группа («Основы»), либо категории игры, а в них группы.
 *
 * Пустое выпадает на каждом уровне: пока в категории не написано ни одного урока, показывать
 * её незачем, а часть без единой написанной категории не показывается вовсе.
 */
export async function courseParts(locale, categoryName = (key) => key) {
    const groups = await courseGroups(locale)
    const found = new Map(groups.map(group => [group.name, group]))
    const parts = []

    for (const part of PARTS) {
        /*
         * Часть-тема: заголовком служит сама группа, и внутри у неё ничего не повторяется.
         * Так устроены «Основы» и «Продвинутое».
         */
        if (part.categories === undefined) {
            const group = found.get(part.group.id)
            if (group === undefined) continue

            parts.push({
                name: part.group.id,
                title: group.title,
                href: group.href,
                sections: [{
                    name: part.group.id,
                    title: null,
                    category: null,
                    groups: [{...group, title: null}]
                }]
            })
            continue
        }

        const sections = part.categories
            .map(entry => ({
                name: entry.category,
                title: categoryName(entry.category),
                category: entry.category,
                groups: entry.groups
                    .map(group => found.get(group.id))
                    .filter(group => group !== undefined)
            }))
            .filter(section => section.groups.length > 0)

        if (sections.length === 0) continue

        // Единственная категория не подписывается: её имя повторило бы имя части
        if (sections.length === 1) sections[0].title = null

        parts.push({
            name: part.id,
            title: locale === 'ru' ? part.title : part.en ?? part.title,
            href: null,
            sections
        })
    }

    return parts
}
