import {defineConfig} from 'astro/config'
import starlight from '@astrojs/starlight'
import preact from '@astrojs/preact'

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
    integrations: [
        starlight({
            title: 'mlog.guide',
            defaultLocale: 'ru',
            locales: {
                ru: {label: 'Русский', lang: 'ru'},
                en: {label: 'English', lang: 'en'}
            },
            customCss: ['./src/sandbox/sandbox.css'],
            sidebar: [
                {label: 'Песочница', translations: {en: 'Sandbox'}, link: 'sandbox'},
                /*
                 * Курс собирается сам из папок: группа — папка с именем инструкции, урок —
                 * страница в ней. Имена инструкций не переводятся, поэтому подписи групп
                 * в меню одинаковы на всех языках, и это правильно.
                 */
                {label: 'Курс', translations: {en: 'Course'}, autogenerate: {directory: 'course'}},
                {
                    label: 'Справочник',
                    translations: {en: 'Reference'},
                    items: [
                        {
                            label: 'Инструкции',
                            translations: {en: 'Instructions'},
                            link: 'reference/instructions'
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
