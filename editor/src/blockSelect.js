/**
 * Выбор блока с клавиатуры — `PlacementFragment.gridUpdate`.
 *
 * На компьютере панель строительства почти не нужна: игрок набирает номер категории, потом
 * номер блока, и всё. Механика набора неочевидна, поэтому перенесена дословно:
 *
 *  - первая цифра выбирает **категорию**, следующая — блок в ней;
 *  - если между нажатиями прошло больше 400 мс, набор начинается заново, и цифра снова
 *    считается номером категории;
 *  - третья цифра делает из набранного десятки: «3,1,0» — это десятый блок, тот же, что «3,0»,
 *    отсюда странное `i += (seq - (i != 9 ? 0 : 1)) * 10`;
 *  - стрелки двигают выбор по сетке: влево-вправо на один, вверх-вниз на ширину ряда,
 *    с заворотом через край.
 *
 * Здесь только состояние набора: какие блоки в категории и что с ними делать, решает панель.
 */

/** `Time.timeSinceMillis(blockSelectSeqMillis) > 400`: после этого набор начинается заново. */
export const COMBO_MS = 400

/**
 * Шаг набора цифрой.
 *
 * @param state  {category, index, seq, ended, at} — набранное до сих пор
 * @param number цифра 0..9, как её нумерует игра: клавиша «1» это 0
 * @param now    время в миллисекундах
 * @param categories имена категорий по порядку; пустые в игре пропускаются
 * @param count  сколько блоков в текущей категории
 */
export function selectByNumber(state, number, {now, categories, count}) {
    // Первая цифра набора — категория. Ею же становится любая цифра после паузы
    if (state.ended || now - state.at > COMBO_MS) {
        const category = categories[number]
        if (category === undefined) return state

        return {...state, category, seq: 0, ended: false, at: now}
    }

    // Вторая цифра выбирает блок и запоминается как разряд десятков
    if (state.seq === 0) {
        const index = number
        return {
            ...state,
            seq: number + 1,
            at: now,
            index: index < count ? index : state.index
        }
    }

    // Третья цифра: набранное становится десятками, и на этом набор кончается
    const index = number + (state.seq - (number !== 9 ? 0 : 1)) * 10

    return {
        ...state,
        seq: state.seq,
        ended: true,
        at: now,
        index: index < count ? index : state.index
    }
}

/**
 * Шаг стрелкой. Формулы из игры: вверх прыгает на ряд назад, а с первого ряда — в последний,
 * причём если там пусто, отступает ещё на ряд.
 */
export function selectByArrow(index, direction, {count, columns}) {
    if (count === 0) return index
    if (index === null) return 0

    switch (direction) {
        case 'left': return (index - 1 + count) % count
        case 'right': return (index + 1) % count

        case 'up': {
            const moved = index > columns - 1 ? index - columns : count - count % columns + index
            return moved - (moved < count ? 0 : columns)
        }

        case 'down': return index < count - columns ? index + columns : index % columns
        default: return index
    }
}
