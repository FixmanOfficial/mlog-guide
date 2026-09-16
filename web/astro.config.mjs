import {defineConfig} from 'astro/config'
import starlight from '@astrojs/starlight'
import preact from '@astrojs/preact'

import {existsSync} from 'node:fs'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'

import schema from '@mlog/core/data/instructions.json' with {type: 'json'}
import ru from '@mlog/core/data/i18n/ru.json' with {type: 'json'}
import en from '@mlog/core/data/i18n/en.json' with {type: 'json'}

import {PARTS} from './src/course/parts.js'

/**
 * Инструкции в боковом меню — категориями и в свёрнутом виде.
 *
 * Пятьдесят три ссылки списком меню бы утопили, а без них страница инструкции открывалась
 * в пустоте: слева не подсвечивалось ничего, и было непонятно, где ты находишься. Категории
 * решают и то, и другое: свёрнуто их шесть, а нужная разворачивается сама — Starlight
 * раскрывает группу, в которой лежит открытая страница.
 *
 * Список строится из описи, а не пишется руками: инструкции добавляет игра, а не мы.
 */
function instructionGroups() {
    const names = Object.keys(schema.categories)

    // «Неизвестно» уходит вниз: в меню игры этой категории нет, в ней одна `noop`
    const order = [...names.filter(name => name !== 'unknown'), 'unknown']

    return order
        .map(category => ({
            category,
            opcodes: schema.instructions.filter(entry => entry.category === category)
        }))
        .filter(group => group.opcodes.length > 0)
        .map(({category, opcodes}) => ({
            label: en.logic.categories[category] ?? category,
            translations: {ru: ru.logic.categories[category] ?? category},
            collapsed: true,
            items: opcodes.map(entry => ({
                label: entry.opcode,
                link: `reference/instructions/${entry.opcode}`
            }))
        }))
}

/**
 * Курс в меню: части — категории игры, внутри группы, внутри уроки.
 *
 * Строится из `src/course/parts.js` — того же описания, по которому собрана страница
 * «Все уроки»: структура курса записана один раз. Группы, в которых ещё нет папки с уроками,
 * пропускаются: `autogenerate` падает на несуществующем каталоге, да и показывать читателю
 * пустую категорию незачем.
 */
function courseParts() {
    const lessons = fileURLToPath(new URL('src/content/docs/en/course/', import.meta.url))

    /*
     * Группа раскрывается всегда, даже если урок в ней один. Список, где половина пунктов
     * раскрывается, а половина ведёт прямо на страницу, читается как сломанный — а «Stop»
     * и «End» такие же инструкции, как остальные, и в меню игры стоят с ними в ряд.
     */
    const groupItem = (group) => ({
        label: group.opcode === undefined ? group.en ?? group.title : instructionName(group.opcode),
        translations: group.opcode === undefined ? {ru: group.title} : undefined,
        autogenerate: {directory: `course/${group.id}`}
    })

    /** Категория с написанными группами внутри, или null, если писать ещё нечего. */
    const categoryItem = (entry) => {
        const groups = entry.groups
            .filter(group => existsSync(join(lessons, group.id)))
            .map(groupItem)

        if (groups.length === 0) return null

        return {
            label: en.logic.categories[entry.category] ?? entry.category,
            translations: {ru: ru.logic.categories[entry.category] ?? entry.category},
            items: groups
        }
    }

    return PARTS
        .map(part => {
            // Часть-тема — это одна группа, и уровней внутри ей не нужно
            if (part.categories === undefined) {
                return existsSync(join(lessons, part.group.id)) ? groupItem(part.group) : null
            }

            const categories = part.categories.map(categoryItem).filter(entry => entry !== null)
            if (categories.length === 0) return null

            /*
             * Одна категория — её имя не повторяет имени части: «Мировой процессор» и «Мир»
             * это одно и то же, и вкладывать одно в другое незачем.
             */
            const items = categories.length === 1 ? categories[0].items : categories

            return {label: part.en ?? part.title, translations: {ru: part.title}, items}
        })
        .filter(part => part !== null)
}

/** Как инструкция подписана в игре: `Operation`, а не `op`. Опкод — это запись, а не имя. */
const instructionName = (opcode) =>
    schema.instructions.find(entry => entry.opcode === opcode)?.name ?? opcode

/**
 * Сайт mlog.guide.
 *
 * Языки симметричны: /ru/ и /en/, в корне только развилка. Так решено с первого дня
 * (docs/decisions.md): иначе английская версия навсегда осталась бы приставкой к русской.
 *
 * Развилка — страница `src/pages/index.astro`, а не `redirects`: та отвечает 200 и выбирает
 * язык по браузеру, а перенаправление конфигом отдавало 308 всем подряд.
 */
export default defineConfig({
    /*
     * Адрес сайта: из него собираются канонические ссылки и `hreflang`. Пока бета живёт
     * на адресе Cloudflare Pages; свой домен — переменной `SITE`, без правки конфига.
     */
    site: process.env.SITE ?? 'https://mlog-guide.pages.dev',

    /*
     * Свои пакеты не отдаём предварительной сборке зависимостей.
     *
     * Vite складывает зависимости в общий бандл и раздаёт их по адресам с отпечатком. Наши
     * `core`, `render` и `editor` — рабочие каталоги, а не зависимости: стоит их тронуть,
     * Vite пересобирает бандл, отпечаток меняется, и открытая страница получает 504 на старый
     * адрес. Остров при этом молча не оживает — на странице остаётся пустое место вместо
     * примера. Исходниками они грузятся и так: это обычный ESM.
     */
    vite: {
        optimizeDeps: {
            exclude: ['@mlog/core', '@mlog/render', '@mlog/editor']
        }
    },

    integrations: [
        starlight({
            title: 'mlog.guide',

            // Иконка логического процессора из атласа игры: `tools/gen-favicon.mjs`
            favicon: '/favicon.png',
            defaultLocale: 'en',
            locales: {
                en: {label: 'English', lang: 'en'},
                ru: {label: 'Русский', lang: 'ru'}
            },
            customCss: ['./src/sandbox/sandbox.css'],

            /*
             * Меню отдано своему компоненту: он дописывает ссылкам уроков сложность,
             * а всё остальное рисует Starlight как обычно. Подвал — тоже: под ним
             * подпись о том, что проект неофициальный.
             */
            components: {
                Sidebar: './src/overrides/Sidebar.astro',
                Footer: './src/overrides/Footer.astro'
            },
            sidebar: [
                {label: 'Sandbox', translations: {ru: 'Песочница'}, link: 'sandbox'},
                /*
                 * Курс: группа — папка, урок — страница в ней. Имена инструкций
                 * не переводятся, поэтому у большинства групп подпись одна на всех языках.
                 * Переводятся только те группы, что не про инструкцию, — «Основы».
                 *
                 * Список групп здесь руками, а не `autogenerate` по всей папке: иначе
                 * подписью группы становится имя папки, и `basics` так и остаётся `basics`.
                 * Новая группа — новая строка, и это правильно: группа появляется в меню
                 * тогда же, когда в ней появляется первый урок.
                 */
                {
                    label: 'Course',
                    translations: {ru: 'Курс'},
                    items: [
                        {
                            label: 'All lessons',
                            translations: {ru: 'Все уроки'},
                            link: 'course'
                        },
                        ...courseParts()
                    ]
                },
                {
                    label: 'Reference',
                    translations: {ru: 'Справочник'},
                    items: [
                        {
                            label: 'Instructions',
                            translations: {ru: 'Инструкции'},
                            items: [
                                {
                                    label: 'All instructions',
                                    translations: {ru: 'Все инструкции'},
                                    link: 'reference/instructions'
                                },
                                ...instructionGroups()
                            ]
                        },
                        {
                            label: 'Variables',
                            translations: {ru: 'Переменные'},
                            link: 'reference/variables'
                        },
                        {
                            label: 'Sensor properties',
                            translations: {ru: 'Свойства sensor'},
                            link: 'reference/properties'
                        },
                        {
                            label: 'Status effects',
                            translations: {ru: 'Эффекты состояния'},
                            link: 'reference/statuses'
                        },
                        {
                            label: 'Game rules',
                            translations: {ru: 'Правила игры'},
                            link: 'reference/rules'
                        }
                    ]
                }
            ]
        }),
        preact()
    ]
})
