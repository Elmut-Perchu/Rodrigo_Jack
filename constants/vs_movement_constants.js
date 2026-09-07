// constants/vs_movement_constants.js - The shape of a jump
//
// Every number that decides how the arena *feels* lives here rather than being
// spread across the four systems that read them, because they only make sense
// against one another: change the gravity and the jump height moves with it,
// change the jump height and the arena stops being climbable.
//
// Adventure mode reads none of this. Its own feel is in create/player_create.js
// and core/systems/gravity_system.js, and is deliberately left alone.

/**
 * Upward speed at the moment of a jump, in px/s.
 *
 * Against GRAVITY, and with the apex easing below, this lifts a fighter
 * ~148px - a little over two 64px tiles - and ~297px using the second jump.
 *
 * Those two figures are the whole reason for the number. The arena climbs in
 * alternating steps of 128px and 192px (assets/maps/pvp_arena_compact.json),
 * and the old 540 gave 91px and 185px: a single jump could not clear the small
 * step, and the double fell 7px short of the big one. The tall climbs were
 * effectively closed, which left the two fighters who spawn on the floor unable
 * to leave it. Now the short steps cost one jump and the tall ones cost both,
 * so height is something you spend rather than something you cannot have.
 */
export const JUMP_STRENGTH = 660;

/** Downward pull while rising, in px/s². Unchanged from Adventure's feel. */
export const GRAVITY = 1500;

/**
 * How much heavier the fall is than the rise.
 *
 * A perfectly symmetric arc is the single most common reason a platformer
 * reads as floaty: the fighter spends as long coming down, helpless, as they
 * did going up. Weighting the descent keeps the same peak height while
 * returning control sooner.
 */
export const FALL_MULTIPLIER = 1.6;

/**
 * Near the top of the arc, gravity eases off.
 *
 * Applies while |vy| is under APEX_SPEED, in either direction, so the fighter
 * lingers a moment at the peak. That pause is what the player reads as
 * control - it is the window in which a jump can be turned into an attack, a
 * course correction or a landing choice, rather than a fixed parabola they are
 * a passenger on.
 */
export const APEX_SPEED = 120;
export const APEX_MULTIPLIER = 0.6;

/**
 * Falling speed ceiling, in px/s.
 *
 * Kept well under the server's MAX_VELOCITY check (server/constants.go): a
 * long drop that overshot it had every state update rejected, snapping the
 * fighter back up the screen.
 */
export const TERMINAL_VELOCITY = 900;

/**
 * What is left of the climb when the jump key is released, as a fraction.
 *
 * This is what gives the jump a range instead of a single fixed arc. A tap
 * clears about 47px - under a tile, a step rather than a climb - and holding
 * gives the full 148px, with everything in between available by how long the
 * key is held. Nothing else here changes what a player can express as much.
 */
export const JUMP_CUT = 0.55;

/**
 * How long after walking off a ledge a ground jump is still allowed, in ms.
 *
 * Without it, stepping off an edge and pressing jump a frame later silently
 * spent the double jump - the fighter got a jump, just not the one they asked
 * for, and arrived at the next ledge with nothing in reserve for reasons they
 * could not see. 100ms is under the threshold at which anyone notices the
 * lie, and well over a frame at any refresh rate.
 */
export const COYOTE_MS = 100;

/**
 * How long an early jump press is remembered, in ms.
 *
 * Pressing jump just before touching down used to be discarded outright, so
 * the fastest a fighter could leave the ground was however long it took them
 * to notice they had landed. Holding the press for a moment lets it fire on
 * contact, which is what makes a run of jumps keep a rhythm instead of
 * stuttering at every landing.
 */
export const JUMP_BUFFER_MS = 120;

/**
 * How long the fighter takes to reach full speed, and to stop, in ms.
 *
 * Movement used to snap between 0 and 450px/s in a single frame. A short ramp
 * gives weight without costing responsiveness at this scale - 70ms is about
 * four frames.
 *
 * Air control is deliberately slower than ground control: it is what makes a
 * jump a commitment. Set either to 0 to go back to instant response.
 */
export const GROUND_ACCEL_MS = 70;
export const AIR_ACCEL_MS = 120;

/**
 * The physics timestep, in seconds.
 *
 * Movement used to be integrated against whatever the frame took, and
 * semi-implicit Euler is not frame-rate independent: the same jump measured
 * 95px at 120fps and 84px at 20fps. An 11px spread is not a rounding error
 * when the arena asks for 128px steps - it means a player on a fast screen can
 * make a jump their opponent cannot. Stepping physics at a fixed rate and
 * carrying the remainder makes the arc identical on every machine.
 */
export const FIXED_STEP = 1 / 120;

/**
 * Most physics steps run for one frame.
 *
 * The frame delta is already capped at 50ms upstream, which is six steps, so
 * this only bites when the machine is losing badly. Dropping the surplus
 * instead of working through it is what stops a slow frame from causing the
 * next one to be slower still.
 */
export const MAX_SUBSTEPS = 8;
