/**
 * Публичный вход ядра. Всё, что снаружи модуля считается стабильным, экспортируется отсюда;
 * остальное — внутренности, на которые опираться нельзя.
 *
 * Ядро не знает про DOM, canvas и таймеры браузера. Проверка простая: тесты гоняются в ноде.
 */

export {Processor, IPT, MAX_TEXT_BUFFER, MAX_GRAPHICS_BUFFER, MAX_INSTRUCTION_SCALE} from './vm.js'
export {DrillBuilding, CrafterBuilding} from './production.js'
export {ConveyorBuilding, RouterBuilding} from './distribution.js'
export {World, Building, BLOCK_SPECS} from './world.js'
export {NOT_SENSED} from './sense.js'
export {Rules, DEFAULT_RULES} from './rules.js'
export {TEAMS, teamColor} from './teams.js'
export {Unit, LogicAI, UNIT_SPECS, TILE_SIZE, LOGIC_CONTROL_TIMEOUT, TRANSFER_DELAY, conv, unconv} from './unit.js'
export {createContent, Content, CONTENT_TYPES} from './content.js'
export {Diagnostic} from './errors.js'
export {LVar} from './lvar.js'
export {parse, MAX_INSTRUCTIONS, MAX_TOKENS, MAX_LABELS} from './parser.js'
export {assemble, KNOWN_INSTRUCTIONS, LACCESS} from './assembler.js'
export {operations, conditions, operationAliases} from './ops.js'
export {ADVANCE, LINE_HEIGHT, CHARACTERS, Align, hasGlyph, layoutPrint} from './font.js'
