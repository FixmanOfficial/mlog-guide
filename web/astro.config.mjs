import {defineConfig} from 'astro/config'
import starlight from '@astrojs/starlight'
import preact from '@astrojs/preact'

import schema from '@mlog/core/data/instructions.json' with {type: 'json'}
import ru from '@mlog/core/data/i18n/ru.json' with {type: 'json'}
import en from '@mlog/core/data/i18n/en.json' with {type: 'json'}

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
            label: ru.logic.categories[category] ?? category,
            translations: {en: en.logic.categories[category] ?? category},
            collapsed: true,
            items: opcodes.map(entry => ({
                label: entry.opcode,
                link: `reference/instructions/${entry.opcode}`
            }))
        }))
}

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
            defaultLocale: 'ru',
            locales: {
                ru: {label: 'Русский', lang: 'ru'},
                en: {label: 'English', lang: 'en'}
            },
            customCss: ['./src/sandbox/sandbox.css'],

            /*
             * Меню отдано своему компоненту: он дописывает ссылкам уроков сложность,
             * а всё остальное рисует Starlight как обычно.
             */
            components: {Sidebar: './src/overrides/Sidebar.astro'},
            sidebar: [
                {label: 'Песочница', translations: {en: 'Sandbox'}, link: 'sandbox'},
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
                    label: 'Курс',
                    translations: {en: 'Course'},
                    items: [
                        {
                            label: 'Все уроки',
                            translations: {en: 'All lessons'},
                            link: 'course'
                        },
                        {
                            label: 'Основы',
                            translations: {en: 'Basics'},
                            autogenerate: {directory: 'course/basics'}
                        },
                        {label: 'set', autogenerate: {directory: 'course/set'}},
                        {label: 'op', autogenerate: {directory: 'course/op'}},
                        {label: 'jump', autogenerate: {directory: 'course/jump'}},
                        {label: 'sensor', autogenerate: {directory: 'course/sensor'}}
                    ]
                },
                {
                    label: 'Справочник',
                    translations: {en: 'Reference'},
                    items: [
                        {
                            label: 'Инструкции',
                            translations: {en: 'Instructions'},
                            items: [
                                {
                                    label: 'Все инструкции',
                                    translations: {en: 'All instructions'},
                                    link: 'reference/instructions'
                                },
                                ...instructionGroups()
                            ]
                        },
                        {
                            label: 'Переменные',
                            translations: {en: 'Variables'},
                            link: 'reference/variables'
                        },
                        {
                            label: 'Свойства sensor',
                            translations: {en: 'Sensor properties'},
                            link: 'reference/properties'
                        }
                    ]
                }
            ]
        }),
        preact()
    ]
})
