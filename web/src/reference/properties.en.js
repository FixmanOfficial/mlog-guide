/**
 * English descriptions of the `sensor` properties.
 *
 * The game has none of its own for them: the bundles hold a dozen lines about `control`, and
 * about the other sixty nothing is written anywhere — they have to be worked out from the
 * code. Hence this file: it is not generated, because there is nothing to generate from.
 *
 * Units are given in the ones the property reports its value in: the game divides coordinates
 * and distances by 8 (`World.conv`), so in mlog they are tiles, not pixels.
 *
 * Checked against `BuildingComp.sense`, `UnitComp.sense`, `Block.sense`, `UnitType.sense`
 * and the overrides in the block classes, Mindustry v159.7.
 */

export const PROPERTIES_EN = {
    totalItems: 'How many items there are inside in all. For a unit this is its one and only stack.',
    firstItem: 'The first item of the contents — the type, not the amount. For a drill it is what it mines.',
    totalLiquids: 'How much liquid there is inside in all. For a factory only the one it produces, '
        + 'for a pump only the one it pumps.',
    totalPower: 'The charge of the buffer, and for an ordinary consumer the share of its request that is met.',
    itemCapacity: 'Capacity in items.',
    liquidCapacity: 'Capacity in liquid.',
    powerCapacity: 'How much power the block requests or holds.',
    powerNetStored: 'Stored in the whole power network.',
    powerNetCapacity: 'The capacity of all the network’s batteries.',
    powerNetIn: 'The network’s production per second.',
    powerNetOut: 'The network’s consumption per second.',
    ammo: 'The ammo in a turret.',
    ammoCapacity: 'How much ammo a turret holds.',
    currentAmmoType: 'Which item the turret is loaded with right now.',
    memoryCapacity: 'The size of a memory cell.',
    health: 'Current health.',
    maxHealth: 'Full health.',
    heat: 'Heat: for a reactor and a heater the heat itself, for a shield projector the damage taken.',
    shield: 'Shield: for a unit its own, for a force projector how much of the dome is left.',
    armor: 'Armor: subtracted from every hit.',
    efficiency: 'How well the block is supplied with resources and power: 1 is fully.',
    progress: 'The progress of the current job, from 0 to 1.',
    timescale: 'The block’s speed-up from an overdrive, normally 1.',
    rotation: 'Rotation in degrees. For a turret, where the barrel is pointing.',
    x: 'The horizontal coordinate, in tiles.',
    y: 'The vertical coordinate, in tiles.',
    velocityX: 'Horizontal speed, tiles per second.',
    velocityY: 'Vertical speed, tiles per second.',
    shootX: 'Where it is aiming: the horizontal coordinate.',
    shootY: 'Where it is aiming: the vertical coordinate.',
    cameraX: 'Where the player’s camera is, horizontally. Only for a player, otherwise 0.',
    cameraY: 'Where the player’s camera is, vertically. Only for a player, otherwise 0.',
    cameraWidth: 'The width of the area the player sees, in tiles.',
    cameraHeight: 'The height of the area the player sees, in tiles.',
    displayWidth: 'The width of a display in points.',
    displayHeight: 'The height of a display in points.',
    bufferSize: 'How many draw commands the display buffer has accumulated already.',
    operations: 'How many instructions the processor runs per tick.',
    size: 'Size: for a block the side in tiles, for a unit the size of its hitbox.',
    solid: 'Whether the block can be walked through: 1 means no.',
    dead: '1 if the object is gone.',
    range: 'Range in tiles: for a turret its fire, for a unit its weapon.',
    shooting: '1 while it is firing.',
    boosting: '1 if the mech is flying right now.',
    mineX: 'The tile the unit is mining, horizontally. Not mining — −1.',
    mineY: 'The tile the unit is mining, vertically. Not mining — −1.',
    mining: '1 while the unit is mining.',
    buildX: 'The tile the unit is building, horizontally. Not building — −1.',
    buildY: 'The tile the unit is building, vertically. Not building — −1.',
    pingX: 'Where the player put a ping, horizontally. No ping — null.',
    pingY: 'Where the player put a ping, vertically. No ping — null.',
    pingText: 'The label of the player’s ping.',
    building: 'The building the unit is putting up right now.',
    breaking: '1 if the unit is not building but tearing down.',
    speed: 'Speed, tiles per second, including boosts.',
    team: 'The team number.',
    type: 'What it is: a block type or a unit type. Not a string but an object — compare it with `@router`.',
    flag: 'The unit’s flag: any number written to it through `ucontrol flag`.',
    flying: '1 if the unit is in the air right now.',
    controlled: 'By what kind of thing it is controlled: 0 is nobody, the other codes are below. '
        + 'Which processor it does not say: your own and somebody else’s share one code.',
    controller: 'The processor driving the unit. If it is not a processor driving it, it gives back '
        + 'the unit itself, so a player at the wheel cannot be told from the unit’s own AI.',
    name: 'The name: for content its logic identifier, for a unit the name of the player controlling it.',
    payloadCount: 'How much payload it is carrying.',
    payloadType: 'What exactly it is carrying: a unit type or a block.',
    totalPayload: 'The payload volume taken up, in tiles.',
    payloadCapacity: 'How much payload it holds, in tiles.',
    maxUnits: 'The team’s unit limit.',
    id: 'The content’s number in the game’s list.',
    selectedBlock: 'Which block the player has selected in the build panel.',
    selectedRotation: 'Which rotation the player has selected in the build panel.',
    bulletLifetime: 'How much flying the bullet has left, in ticks.',
    bulletTime: 'How long the bullet has been flying, in ticks.',
    enabled: 'Whether the block is switched on.',
    shoot: 'Firing at a point.',
    shootp: 'Firing at a target with lead.',
    config: 'The block’s setting: a sorter’s item, a liquid, a node’s link point.',
    color: 'Colour: for content its own, for a building and a unit the team colour. Packed into '
        + 'a number, taken apart with `unpackcolor`.'
}
