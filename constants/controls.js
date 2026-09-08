// constants/controls.js - One keyboard layout, both modes

/**
 * The bindings, in one place, because a player only has one pair of hands.
 *
 * Adventure and the arena grew their own control schemes: the solo game
 * jumped on Up and drew the bow on Space, the arena jumps on Space and needs
 * the direction keys free to aim. Two layouts for one character meant every
 * switch between modes cost a few deaths' worth of relearning, and the two
 * drifted further apart every time either was touched.
 *
 *   arrows / ZQSD   move (and, in the arena, aim)
 *   space           jump, and the second one
 *   X               sword
 *   W               bow - hold to draw
 *   C               magic; a summoned spirit in the arena
 *   N               roll (Adventure only, for now)
 *
 * Up and Down do nothing in Adventure - there is nothing there to aim at -
 * but they are deliberately left unbound rather than kept as a second jump
 * key: a habit that works in one mode and not the other is worse than no
 * habit at all.
 */

// Held keys are normalised to lowercase, so a player with caps lock on, or
// holding shift, still moves.
export const LEFT = new Set(['arrowleft', 'q']);
export const RIGHT = new Set(['arrowright', 'd']);
export const UP = new Set(['arrowup', 'z']);
export const DOWN = new Set(['arrowdown', 's']);

export const JUMP = ' ';
export const SWORD = 'x';
export const BOW = 'w';
export const MAGIC = 'c';
export const ROLL = 'n';

// Keys the browser would otherwise act on itself: space and the arrows
// scroll the page, which is very noticeable now that both modes jump on
// space and the menus scroll.
export const SWALLOWED = new Set([
    ' ', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown'
]);

export function normalise(key) {
    return typeof key === 'string' ? key.toLowerCase() : key;
}

/** Never steal keys from a chat box, a nickname field or a search box. */
export function isTyping(target) {
    if (!target || !target.tagName) return false;
    const tag = target.tagName.toLowerCase();
    return tag === 'input' || tag === 'textarea' || target.isContentEditable === true;
}

/** True if any key of the group is down. */
export function held(keys, group) {
    for (const key of group) {
        if (keys.has(key)) return true;
    }
    return false;
}
