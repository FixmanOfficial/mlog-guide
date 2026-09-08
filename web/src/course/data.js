/**
 * Уроки курса из коллекции страниц.
 *
 * Курс разложен по папкам: `<локаль>/course/<инструкция>/<урок>`. Группа — это инструкция,
 * и папка называется её именем: имена инструкций не переводятся, поэтому и адрес у группы
 * одинаковый на всех языках.
 *
 * Порядок уроков внутри группы — `sidebar.order` в шапке страницы; порядок самих групп
 * задан здесь: он смысловой, а не алфавитный.
 */

import {getCollection} from 'astro:content'

/**
 * Порядок групп. Это же и план курса: чего ещё нет, видно по тому, что группа пуста.
 * Порядок — от того, без чего не собрать ни одной программы, к тому, что нужно не всем.
 */
export const GROUPS = [
    'basics',
    'set', 'op', 'jump', 'select', 'wait',
    'print', 'read', 'sensor', 'control', 'radar', 'draw', 'lookup',
    'ubind', 'ucontrol', 'uradar', 'ulocate',
    'world'
]

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

/** Все группы, у которых есть хоть один урок, в порядке `GROUPS`. */
export async function courseGroups(locale) {
    const groups = []

    for (const group of GROUPS) {
        const lessons = await groupLessons(locale, group)
        if (lessons.length === 0) continue

        const page = (await getCollection('docs'))
            .find(entry => entry.slug === `${locale}/course/${group}`
                || entry.slug === `${locale}/course/${group}/index`)

        groups.push({
            name: group,
            href: page === undefined ? lessons[0].href : `/${page.slug.replace(/\/index$/, '')}/`,
            lead: page?.data.lead ?? null,
            lessons
        })
    }

    return groups
}

/** Группы, которых ещё нет: список, чтобы был виден размер курса, а не только сделанное. */
export async function plannedGroups(locale) {
    const ready = new Set((await courseGroups(locale)).map(group => group.name))
    return GROUPS.filter(group => !ready.has(group))
}
