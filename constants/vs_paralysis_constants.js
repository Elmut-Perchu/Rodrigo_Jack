// constants/vs_paralysis_constants.js - What a spirit does when it reaches you

/**
 * The spectre holds its quarry still. It no longer takes a heart.
 *
 * Two seconds of paralysis and no damage is a bigger threat than the two
 * half-hearts it used to cost, not a smaller one - and a far more interesting
 * one. Damage was a number that ticked down somewhere in the corner of the
 * screen; being unable to move is felt immediately, and it hands the whole
 * opening to whoever is standing nearby rather than settling the exchange by
 * itself. It also finally makes the weapon's price make sense: the caster
 * spends two seconds standing still and visible to channel it, and now buys
 * two seconds of the same from someone else.
 *
 * It cannot kill on its own, which is the point. A spirit that both stunned
 * *and* damaged would simply be the best weapon in the arena.
 */

/** How long a fighter is held. */
export const PARALYSIS_MS = 2000;

// The fighter spritesheet is a 13-wide grid (see PlayerAnimation).
const SHEET_COLUMNS = 13;

// The seventh row, counting from one: the reeling animation. Its first three
// frames are the ones that read as a body that has lost control of itself -
// what follows on that row is the recovery, which is not what is wanted while
// the fighter is still held.
const STUN_ROW = 6;

export const PARALYSIS_FRAMES = [0, 1, 2].map(column => STUN_ROW * SHEET_COLUMNS + column);

/**
 * Frames per second for that loop.
 *
 * Slower than the 15 the rest of the sheet runs at. Three frames at 15 cycle
 * five times a second, which over two full seconds strobes rather than reads;
 * at 10 the loop is a third of a second long - a tremble you can see the shape
 * of, repeated often enough to say plainly that the fighter is not simply
 * standing there.
 */
export const PARALYSIS_FPS = 10;

/** True while this fighter is still held. */
export function isParalysed(property) {
    return !!property && performance.now() < (property.paralysedUntil || 0);
}
