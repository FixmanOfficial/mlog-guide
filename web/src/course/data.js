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

import {GROUPS, PARTS, partGroups} from './parts.js'

export {GROUPS, PARTS} from './parts.js'

/** Уроки одной группы, в порядке `sidebar.order`. */
export async function groupLessons(locale, group) {
    const prefix = `${locale}/course/${group}/`

    const entries = (await getCollection('docs'))
        .filter(entry => entry.slug.startsWith(prefix))
        // Страница самой группы — не урок: она про группу целиком
        .filter(entry => !entry.slug.endsWith('/index') && entry.slug !== prefix.slice(0, -1))

    return entries
        .sort((a, b) => (a.data.sidebar?.order ?? 0) - (b.data.sidebar?.order ?? 0))
        .map(entry => ({
            slug: entry.slug,
            href: `/${entry.slug}/`,
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
        slug: page.slug,
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
            .find(entry => entry.slug === `${locale}/course/${group}`
                || entry.slug === `${locale}/course/${group}/index`)

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
            href: page === undefined ? lessons[0].href : `/${page.slug.replace(/\/index$/, '')}/`,
            lead: page?.data.lead ?? null,
            lessons
        })
    }

    return groups
}

/**
 * Курс частями: у части либо своя группа («Основы»), либо категория игры с группами внутри.
 *
 * Пустые части выпадают: пока в категории не написано ни одного урока, показывать её
 * незачем.
 */
export async function courseParts(locale, categoryName = (key) => key) {
    const groups = await courseGroups(locale)
    const found = new Map(groups.map(group => [group.name, group]))
    const parts = []

    for (const part of PARTS) {
        const inside = partGroups(part)
            .map(group => found.get(group.id))
            .filter(group => group !== undefined)

        if (inside.length === 0) continue

        parts.push({
            name: part.category ?? part.group.id,
            title: part.category === undefined ? inside[0].title : categoryName(part.category),
            category: part.category ?? null,
            // У части из одной своей группы заголовок и есть эта группа: второй раз не повторяем
            groups: part.category === undefined ? [{...inside[0], title: null}] : inside
        })
    }

    return parts
}
