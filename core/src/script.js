/**
 * Разовый запуск программы — то, чем цель карты выполняет свой `completionLogicCode`.
 *
 * `LExecutor.runLogicScript` заводит отдельный привилегированный исполнитель, собирает
 * код и крутит его до конца программы, но не больше ста тысяч инструкций. Переменных
 * у него своих нет, ошибка сборки молча проглатывается: цель не должна ронять игру.
 *
 * Модуль нужен, чтобы цели не зависели от виртуальной машины напрямую: `objectives.js`
 * зовёт отсюда, а `vm.js` при загрузке сообщает, чем именно запускать. Иначе получалось бы
 * кольцо `objectives → vm → assembler → world → objectives`.
 */

/** LExecutor.runLogicScript: потолок в сто тысяч инструкций на один запуск. */
export const MAX_SCRIPT_INSTRUCTIONS = 100000

let runner = null

/** Вызывается из `vm.js` при загрузке. */
export function setScriptRunner(fn) {
    runner = fn
}

/**
 * Запускает код один раз. Без зарегистрированного запускателя не делает ничего — так же,
 * как игра ничего не делает с пустым кодом.
 */
export function runLogicScript(code, options = {}) {
    if (runner === null || code === null || code === undefined || code === '') return null
    return runner(code, options)
}
