/**
 * Привязка всплывающего окна к кнопке, которая его открыла.
 *
 * Меню выбора в игре стоит рядом с кнопкой и никуда не уезжает: там сцена не прокручивается,
 * и место достаточно посчитать один раз. У нас редактор бывает не окном на весь экран,
 * а куском страницы урока — стоит читателю прокрутить текст, и посчитанное место оказывается
 * не там, где кнопка.
 *
 * Место поэтому пересчитывается, пока меню открыто: на прокрутку и на изменение размера окна.
 * Прокрутка слушается с перехватом — прокручиваться может и страница, и полотно редактора,
 * а событие прокрутки не всплывает, зато проходит фазу перехвата.
 */

import {useLayoutEffect, useRef, useState} from 'preact/hooks'

const same = (a, b) => a !== null && a.left === b.left && a.top === b.top
    && a.width === b.width && a.height === b.height

/**
 * @param anchor ссылка на кнопку, к которой привязано окно
 * @param place  считает `{left, top}` по рамке кнопки и размеру окна
 * @param deps   что ещё меняет размер окна: вкладка, набор значений
 * @returns `{ref, position}` — ссылку вешают на окно, положение в стиль
 */
export function useAnchored(anchor, place, deps = []) {
    const ref = useRef(null)
    const [position, setPosition] = useState(null)

    // Функция размещения приходит новой на каждый кадр, и слежение пересоздавать не должна
    const placement = useRef(place)
    placement.current = place

    useLayoutEffect(() => {
        const button = anchor?.current
        const popup = ref.current
        if (button === null || button === undefined || popup === null) return

        let last = null

        const update = () => {
            const box = button.getBoundingClientRect()
            if (same(last, box)) return

            last = {left: box.left, top: box.top, width: box.width, height: box.height}
            setPosition(placement.current(box, popup.getBoundingClientRect()))
        }

        update()

        window.addEventListener('scroll', update, true)
        window.addEventListener('resize', update)

        return () => {
            window.removeEventListener('scroll', update, true)
            window.removeEventListener('resize', update)
        }
    }, [anchor, ...deps])

    return {ref, position}
}

/**
 * Держит окно на экране. `LStatement.showSelectTable` ставит меню по центру кнопки, а потом
 * зовёт `keepInStage` — тот двигает его внутрь экрана, если оно вылезло.
 *
 * Порядок прижатия важен: сперва к дальнему краю, потом к ближнему. Наоборот — и меню выше
 * экрана уезжает верхом за него, а ближний край нужнее: у списка операций верхние ряды
 * оказывались под шапкой сайта.
 *
 * Экран на телефоне — не всё окно: `visualViewport` не считает то, что закрыто панелью
 * браузера, а `innerHeight` считает.
 */
export function keepOnScreen(box, size, {gap = 4} = {}) {
    const view = globalThis.visualViewport
    const width = view?.width ?? window.innerWidth
    const height = view?.height ?? window.innerHeight

    const left = box.left + box.width / 2 - size.width / 2
    const top = box.top + box.height / 2 - size.height / 2

    return {
        left: Math.max(gap, Math.min(left, width - size.width - gap)),
        top: Math.max(gap, Math.min(top, height - size.height - gap))
    }
}

/** Стиль положения: пока не посчитано — за экраном, чтобы не мигало на старом месте. */
export const anchoredStyle = (position) => position === null
    ? {left: '-9999px', top: '-9999px'}
    : {left: `${position.left}px`, top: `${position.top}px`}
