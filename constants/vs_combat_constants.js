// constants/vs_combat_constants.js - Sword blows and how they are told apart

/**
 * The three sword animations, in the order X walks through them.
 *
 * One key now produces every blow, which is what makes a fight read as a
 * sequence instead of the same chop repeated. The chain opens on the first
 * entry every time, so a fighter's opening blow is always the same and the
 * variety comes from staying on the attack.
 */
export const SWING_CYCLE = ['attack3', 'attack1', 'attack2'];

/** Break off for longer than this and the next swing restarts the chain. */
export const COMBO_RESET_MS = 1200;

/**
 * Two blades meeting must not be the same blade twice.
 *
 * A parry is the moment the fight is most worth looking at, and two fighters
 * playing the identical animation frame-for-frame reads as a rendering fault
 * rather than a clash. Whoever's blow was answered switches to a different one
 * so the two poses always differ.
 *
 * Deterministic on purpose: every client runs this on the same pair of
 * variants and arrives at the same answer, so nobody has to be told about it
 * over the network.
 */
export function differentSwing(swing, otherSwing) {
    if (swing !== otherSwing) return swing;

    const index = SWING_CYCLE.indexOf(swing);
    if (index < 0) return SWING_CYCLE[0];

    return SWING_CYCLE[(index + 1) % SWING_CYCLE.length];
}

/**
 * Health, counted in hearts.
 *
 * Four of them, each worth two halves, so a fighter has eight units of life
 * and every blow lands on a boundary you can see. The arena used to run on a
 * hundred hit points knocked down 15 or 20 at a time - a number nobody reads
 * mid-fight, and one that cannot be drawn as anything but a bar.
 *
 * The damage figures are chosen to keep the old pacing: a sword still needs
 * about eight connections to finish someone, an arrow four, a spirit four.
 */
export const HEARTS = 4;
export const HALVES_PER_HEART = 2;
export const MAX_HEALTH = HEARTS * HALVES_PER_HEART;

export const MELEE_DAMAGE = 1;   // half a heart
export const ARROW_DAMAGE = 2;   // a whole one
export const MAGIC_DAMAGE = 2;
