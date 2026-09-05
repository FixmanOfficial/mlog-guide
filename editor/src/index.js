/** Публичный вход редактора. Страница подключает Editor и получает текст mlog через onChange. */

export {Editor} from './Editor.jsx'
export {GlobalsDialog} from './GlobalsDialog.jsx'
export {LogicDialog} from './LogicDialog.jsx'
export {createStatement, operations, toText, fromText, INSTRUCTIONS, AVAILABLE, ENUMS} from './program.js'
export {CATEGORY_COLORS, METRICS, categoryColor, displayName} from './theme.js'
export {EASINGS, applyEasings} from './easing.js'
export {PATCHES, applyNinePatches} from './nine.js'
