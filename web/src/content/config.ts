import {defineCollection, z} from 'astro:content'
import {docsSchema, i18nSchema} from '@astrojs/starlight/schema'

/**
 * Схема Starlight плюс два наших поля.
 *
 * `difficulty` — сложность урока, её видно кружком в списке уроков и в шапке урока.
 * Нужна не для украшения: человек, открывший подряд третий красный урок и ничего
 * не понявший, решает, что дело в нём, и уходит.
 *
 * `lead` — одна фраза о том, что урок даёт. Показывается в списке рядом с названием;
 * `description` для этого не годится, он уходит в поисковую выдачу и в соцсети.
 */
export const collections = {
    /*
     * Надписи самого Starlight. Свой файл нужен ровно одной: у кнопки «Копировать»
     * над блоком кода английского перевода в Starlight нет вовсе, а Expressive Code
     * без него берёт надпись языка по умолчанию — и на английской странице кнопка
     * выходила русской.
     */
    i18n: defineCollection({type: 'data', schema: i18nSchema()}),

    docs: defineCollection({
        schema: docsSchema({
            extend: z.object({
                difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
                lead: z.string().optional()
            })
        })
    })
}
