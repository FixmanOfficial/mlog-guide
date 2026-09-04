/**
 * Публичный вход ядра. Всё, что снаружи модуля считается стабильным, экспортируется отсюда;
 * остальное — внутренности, на которые опираться нельзя.
 *
 * Ядро не знает про DOM, canvas и таймеры браузера. Проверка простая: тесты гоняются в ноде.
 */

export {Processor, IPT, MAX_TEXT_BUFFER, MAX_GRAPHICS_BUFFER, MAX_INSTRUCTION_SCALE} from './vm.js'
export {World, Building, BLOCK_SPECS, NOT_SENSED} from './world.js'
export {createContent, Content, CONTENT_TYPES} from './content.js'
export {Diagnostic} from './errors.js'
export {LVar} from './lvar.js'
export {parse, MAX_INSTRUCTIONS, MAX_TOKENS, MAX_LABELS} from './parser.js'
export {assemble, KNOWN_INSTRUCTIONS, LACCESS} from './assembler.js'
export {operations, conditions, operationAliases} from './ops.js'
export {ADVANCE, LINE_HEIGHT, CHARACTERS, Align, hasGlyph, layoutPrint} from './font.js'
