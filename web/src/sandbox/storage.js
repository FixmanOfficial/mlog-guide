/**
 * Программы, сохранённые в браузере.
 *
 * Уроку это нужно: ученик закрыл вкладку — программа должна остаться. Странице песочницы
 * не нужно, поэтому без ключа хранилища ничего не сохраняется вовсе.
 *
 * Хранилища может не быть — приватное окно, запрет на данные сайта, — и любое обращение
 * к нему тогда бросает. Поэтому всё завёрнуто в try, а отказ означает «не сохранили»,
 * а не поломку страницы.
 */

const key = (storage, name) => `mlog.program.${storage}.${name}`

/** Программа процессора или `null`, если её не сохраняли. */
export function loadProgram(storage, name) {
    if (storage === null) return null

    try {
        return globalThis.localStorage?.getItem(key(storage, name)) ?? null
    } catch {
        return null
    }
}

export function saveProgram(storage, name, text) {
    if (storage === null) return

    try {
        globalThis.localStorage?.setItem(key(storage, name), text)
    } catch {
        // Не сохранили — программа всё равно работает, просто не переживёт вкладку
    }
}

/** Забывает сохранённое: этим урок возвращает исходные программы. */
export function forgetPrograms(storage) {
    if (storage === null) return

    try {
        const prefix = `mlog.program.${storage}.`
        const store = globalThis.localStorage
        if (store === undefined) return

        for (const name of Object.keys(store)) {
            if (name.startsWith(prefix)) store.removeItem(name)
        }
    } catch {
        // Хранилища нет — забывать нечего
    }
}
