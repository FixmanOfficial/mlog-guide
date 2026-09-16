/**
 * English descriptions for the variables the game's window does not list.
 *
 * The "Variables" window shows the list from `GlobalVars` — `gen-globals.mjs` takes it from
 * there. But three variables live in the processor itself (`LExecutor.java:133-137`) rather
 * than in that list, and the window does not show them, although they are written about
 * more than anything else.
 */

export const PROCESSOR_EN = {
    '@counter': 'The number of the instruction that will run next. The only built-in variable '
        + 'that can be changed: writing to it is a jump, and `set @counter 0` starts the '
        + 'program over.',
    '@unit': 'The unit taken by the last `ubind`. It is the one `ucontrol` and `uradar` are '
        + 'addressed to.',
    '@queries': 'The list `query` puts what it found into. Only a world processor has it.'
}
