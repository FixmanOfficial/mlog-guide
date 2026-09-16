import globals from '@mlog/core/data/globals.json'

import {globalTip} from './tooltips.js'
import {Overlay} from './Overlay.jsx'
import {uiText} from './names.js'

/**
 * Окно «Встроенные переменные» — перенос `GlobalVarsDialog`.
 *
 * Список и его порядок приходят из описи, снятой генератором с `GlobalVars.init()`: строки
 * вида `sectionX` работают заголовками разделов, под каждым — свои переменные. Описания лежат
 * в бандлах игры под ключами `lglobal.<имя>`, поэтому часть из них не переведена, и это видно.
 *
 * Строка устроена как в таблице переменных: полоска в 8 пикселей, имя на `Pal.gray`, ещё полоска
 * и описание в рамке `Tex.pane`. Заголовок раздела — надпись цветом `Pal.accent` и линия
 * толщиной 4 под ней.
 */
export function GlobalsDialog({onClose}) {
    return (
        <Overlay onClose={onClose}>
            <div class="dialog" onClick={(event) => event.stopPropagation()}>
                <div class="dialog__title">{uiText('globals')}</div>

                <div class="dialog__body">
                    <div class="globals">
                        {globals.entries.map(entry => entry.name.startsWith('section')
                            ? (
                                <div class="globals__section" key={entry.name}>
                                    <div class="globals__section-name">{globalTip(entry.name) ?? entry.name}</div>
                                    <div class="globals__rule" />
                                </div>
                            )
                            : (
                                <div class="globals__row" key={entry.name}>
                                    <span class="globals__stub" />
                                    <span class="globals__name">{entry.name}</span>
                                    <span class="globals__stub" />
                                    <span class="globals__description">{globalTip(entry.name) ?? ''}</span>
                                </div>
                            ))}
                    </div>
                </div>

                <div class="dialog__buttons">
                    <button class="game-button dialog__back" onClick={onClose}>{uiText('back')}</button>
                </div>
            </div>
        </Overlay>
    )
}
