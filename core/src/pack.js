/**
 * Сжатие таблиц спеков: значения по умолчанию отдельно, у записи — только отличия.
 *
 * Отдельно от `specs.js` потому, что генератор, который эти таблицы пишет, не должен
 * при загрузке читать их же: на первом запуске их ещё нет, после смены формата они старые.
 * Подробности формата — в `specs.js`.
 */

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

/** Таблица `{имя: запись}` в сжатом виде: `{defaults, packed}`. Вызывает генератор. */
export function packSpecs(table) {
    const entries = Object.values(table)
    const tally = new Map()

    for (const entry of entries) {
        for (const [field, value] of Object.entries(entry)) {
            if (!tally.has(field)) tally.set(field, new Map())

            const values = tally.get(field)
            const key = JSON.stringify(value)
            values.set(key, (values.get(key) ?? 0) + 1)
        }
    }

    const defaults = {}

    for (const [field, values] of tally) {
        let total = 0
        let best = null

        for (const [key, count] of values) {
            total += count
            if (best === null || count > best[1]) best = [key, count]
        }

        if (total === entries.length) defaults[field] = JSON.parse(best[0])
    }

    const packed = {}

    for (const [name, entry] of Object.entries(table)) {
        packed[name] = Object.fromEntries(Object.entries(entry)
            .filter(([field, value]) => !(field in defaults) || !same(value, defaults[field])))
    }

    return {defaults, packed}
}

/**
 * Обратно к `{имя: запись}`. Списки и объекты по умолчанию копируются на каждую запись:
 * общий на всех экземпляр поменялся бы у всех разом, стоит кому-то его тронуть.
 */
export function expandSpecs({defaults, packed}) {
    const table = {}

    for (const [name, entry] of Object.entries(packed)) {
        const full = {}

        for (const [field, value] of Object.entries(defaults)) {
            full[field] = value !== null && typeof value === 'object' ? structuredClone(value) : value
        }

        table[name] = Object.assign(full, entry)
    }

    return table
}
