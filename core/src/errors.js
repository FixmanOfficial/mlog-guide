/**
 * Коды диагностик. Ядро никогда не отдаёт готовый текст для пользователя — только код и данные,
 * строка собирается на стороне сайта на нужном языке. См. CLAUDE.md, раздел «Мультиязычность».
 */

export const Diagnostic = {
    // Разбор
    MISSING_CLOSING_QUOTE: 'parse.missing-closing-quote',
    STRING_TOO_LONG: 'parse.string-too-long',
    TOO_MANY_TOKENS: 'parse.too-many-tokens',
    TOO_MANY_LABELS: 'parse.too-many-labels',
    DUPLICATE_LABEL: 'parse.duplicate-label',
    UNDEFINED_LABEL: 'parse.undefined-label',
    EXPECTED_SPACE: 'parse.expected-space',

    // Сборка
    UNKNOWN_INSTRUCTION: 'assemble.unknown-instruction',
    UNKNOWN_OPERATION: 'assemble.unknown-operation',
    UNKNOWN_CONDITION: 'assemble.unknown-condition',

    // Исполнение
    NOT_IMPLEMENTED: 'run.not-implemented'
}

/**
 * Диагностика — это данные, а не исключение: разбор не должен падать на первой же ошибке,
 * иначе редактор не сможет показать всё сразу.
 */
export function diagnostic(code, line, data = {}) {
    return {code, line, ...data}
}
