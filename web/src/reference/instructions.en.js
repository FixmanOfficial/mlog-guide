/**
 * English descriptions for the instructions the game's bundles do not cover.
 *
 * Forty-odd instructions are described by the game itself, and that description is what we
 * show. The remaining eleven it does not describe at all: `op` and `ubind` have no caption
 * in the logic window, and `clientdata` is hidden outright.
 *
 * Checked against `LExecutor.java` and `LStatements.java`, Mindustry v159.7.
 */

export const INSTRUCTIONS_EN = {
    noop: 'Does nothing. This is how the game records an instruction it could not parse — '
        + 'one from a newer version, for instance.',
    op: 'Arithmetic and logic: computes two values with the chosen operation and puts the '
        + 'result into a variable.',
    ubind: 'Takes control of a unit of the given type. Units of your own team are cycled '
        + 'through: every call gives the next one, and each processor has a counter of its '
        + 'own. A unit object may be passed instead — then that exact unit is taken.',
    ucontrol: 'A command to the bound unit: move, shoot, mine, build, take and drop items.',
    uradar: 'Looks for a target around the bound unit — the same as `radar`, only the unit '
        + 'is doing the looking, not a block.',
    ulocate: 'Finds the nearest thing on the map: an ore deposit, a building of the right '
        + 'kind, a core or a drop point.',
    spawn: 'Creates a unit at the given point.',
    bullet: 'Fires a bullet from a point in the given direction.',
    status: 'Applies a status effect to a unit or clears it.',
    message: 'Shows the player the accumulated text buffer: as a hint, an announcement or '
        + 'a window.',
    clientdata: 'Sends an arbitrary value on a channel to the game clients. It is not in the '
        + 'instruction menu: it is made for mods.'
}
