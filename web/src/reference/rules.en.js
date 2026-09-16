/**
 * English captions for the game rules.
 *
 * The game neither translates them nor describes them anywhere: in `Rules.java` they are
 * fields without a single comment, and in the map editor half of them have captions of
 * their own that do not match the `LogicRule` names. So the text here is ours — as it is
 * for the `sensor` properties.
 */

export const RULES_EN = {
    currentWaveTime: 'How many seconds are left until the next wave',
    waveTimer: 'Whether the countdown to a wave is running',
    waves: 'Whether this map has waves at all',
    wave: 'The number of the current wave, no less than one',
    waveSpacing: 'How many seconds between waves',
    waveSending: 'Whether to send a wave right now',
    attackMode: 'Attack mode: the goal is the enemy cores',
    enemyCoreBuildRadius: 'How far from an enemy core building is forbidden',
    dropZoneRadius: 'The radius of the forbidden zone around a drop point',
    unitCap: 'The limit on the number of units',
    mapArea: 'The playable part of the map. The only rule that needs all four fields',
    lighting: 'Darkness on the map',
    canGameOver: 'Whether the game can be lost',
    ambientLight: 'The colour of the darkness — as a packed colour',
    unitLight: 'Whether units give light in the dark',
    solarMultiplier: 'A multiplier for solar panel output',
    dragMultiplier: 'A friction multiplier: how much faster speed dies away',
    ban: 'Forbid a block or a unit type',
    unban: 'Lift a ban',
    pauseDisabled: 'Forbid pausing',
    musicVolume: 'Music volume, from zero to one',
    buildSpeed: 'The speed of building by a player',
    unitHealth: 'Divides damage to units rather than raising their health',
    unitBuildSpeed: 'The speed at which units build',
    unitMineSpeed: 'The speed at which units mine',
    unitCost: 'A multiplier for the cost of units',
    unitDamage: 'A multiplier for damage dealt by units',
    blockHealth: 'Divides damage to buildings',
    blockDamage: 'A multiplier for damage dealt by buildings',
    rtsMinWeight: 'The strength threshold at which a squad decides to attack',
    rtsMinSquad: 'How many units have to gather into a squad'
}
