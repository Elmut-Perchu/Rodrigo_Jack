// core/mobile.js - One answer to "are we on a phone", shared by both modes

/**
 * Whether this is a touch device, decided once and read everywhere.
 *
 * Both modes needed the same answer for different reasons - Adventure pulls
 * the camera back and shrinks its counters, the arena hands over the screen to
 * a joystick and four buttons - and a question asked twice is a question that
 * eventually gets two different answers. So it is asked here, once, at load.
 *
 * Three signals, because none of them is trustworthy alone:
 *
 *   pointer: coarse   the honest one - a finger rather than a mouse - but a
 *                     touchscreen laptop reports it too
 *   touch points      catches older browsers that never learned the media query
 *   screen size       what separates a phone from that touchscreen laptop,
 *                     measured on the shorter edge so rotating does not change
 *                     the answer mid-match
 *
 * `?touch=1` forces the mobile treatment on and `?touch=0` forces it off, which
 * is the only way to see either layout on the machine it is being written on.
 */

const params = new URLSearchParams(window.location.search);
const forced = params.get('touch');

const coarsePointer = typeof window.matchMedia === 'function'
    && window.matchMedia('(pointer: coarse)').matches;

const hasTouchPoints = 'ontouchstart' in window
    || (navigator.maxTouchPoints || 0) > 0;

// The shorter edge of the physical screen, not the window: a browser window
// dragged narrow on a desktop is not a phone.
const screenEdge = Math.min(
    window.screen?.width || window.innerWidth,
    window.screen?.height || window.innerHeight
);

// The shorter edge of the play area itself, always in CSS pixels.
const viewportEdge = Math.min(window.innerWidth, window.innerHeight);

export const IS_TOUCH = forced !== null ? forced === '1' : (coarsePointer || hasTouchPoints);

/**
 * A phone or a small tablet: touch *and* not much room.
 *
 * Two ways of being small, because `screen` cannot quite be trusted. Most
 * browsers report it in CSS pixels - 390 for a phone - but some Android builds
 * report the physical panel instead, which on a 3x display is 1170 and sails
 * straight past any sane threshold. The viewport is always in CSS pixels, so a
 * play area under 500 of them is a phone whatever `screen` claims.
 *
 * The viewport test is deliberately the tighter of the two: a browser window
 * dragged narrow on a touchscreen laptop is a window, not a phone, and 500 is
 * well below anything a laptop is likely to be left at.
 */
export const IS_MOBILE = forced !== null
    ? forced === '1'
    : (IS_TOUCH && (screenEdge <= 900 || viewportEdge <= 500));

/**
 * How far back the Adventure camera stands on a phone.
 *
 * The follow camera shows world pixels one for one on a desktop, which on a
 * 360px-tall screen means the player alone fills a third of the height and the
 * platform they are about to land on is off-screen. Pulling back to 0.6 puts
 * roughly two and a half times the area in view - enough to read a jump before
 * committing to it - without shrinking the sprite past the point where its
 * animation is legible.
 */
export const CAMERA_ZOOM = IS_MOBILE ? 0.6 : 1;

/**
 * How much smaller the solo game's counters are drawn.
 *
 * Hearts, coins and the kill tally are reference information: they are read
 * between fights, not during one. At desktop size they cover the corners of a
 * phone screen, which is exactly where the thing chasing you tends to be.
 */
export const HUD_SCALE = IS_MOBILE ? 0.6 : 1;

/** Rounds a desktop pixel measurement down to its phone size. */
export function ui(px) {
    return Math.round(px * HUD_SCALE);
}
