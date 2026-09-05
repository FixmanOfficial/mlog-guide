import {defineConfig} from 'astro/config'
import starlight from '@astrojs/starlight'
import preact from '@astrojs/preact'

/**
 * Сайт mlog.guide.
 *
 * Языки симметричны: /ru/ и /en/, в корне только перенаправление. Так решено с первого дня
 * (docs/decisions.md): иначе английская версия навсегда осталась бы приставкой к русской.
 */
export default defineConfig({
    redirects: {'/': '/ru/'},
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
                {label: 'Песочница', translations: {en: 'Sandbox'}, link: 'sandbox'}
            ]
        }),
        preact()
    ]
})
