import table from '@mlog/core/data/icons.json'

/**
 * Иконка интерфейса игры.
 *
 * В Mindustry иконки — не картинки, а глифы шрифта `fonts/icon.ttf`: класс `Icon` генерируется
 * по нему при сборке. Мы делаем то же самое — подключаем тот же шрифт и выводим символ по коду.
 * Таблицу имён и кодов снимает `tools/gen-icons.mjs`.
 *
 * Поэтому иконки масштабируются, красятся цветом текста и не требуют ни одной картинки.
 */
export const ICONS = table.icons

export function Icon({name, size = 24, ...rest}) {
    const code = ICONS[name]
    if (code === undefined) return null

    return (
        <span
            class="icon"
            style={{fontSize: `${size}px`}}
            aria-hidden="true"
            {...rest}
        >
            {String.fromCharCode(code)}
        </span>
    )
}
