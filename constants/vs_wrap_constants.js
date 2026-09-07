// constants/vs_wrap_constants.js - An arena with no outside
//
// The arena's edges are passages rather than walls: leave through the right
// one and you come back in on the left, drop through the floor and you fall in
// from the ceiling. Geometrically the map is a torus.
//
// Only a few tiles are actually open (see assets/maps/pvp_arena_compact.json):
// two side tunnels and two vertical shafts. Everywhere else the boundary is
// still solid, so wrapping is something you route through on purpose, not
// something that happens whenever you drift off the screen.

/**
 * Brings a coordinate back inside [0, span).
 *
 * Written as a loop-free remainder so it is correct however far outside the
 * value has gone - a spectre that overshoots by two arena widths comes back to
 * the same place a fighter one pixel out does.
 */
export function wrapValue(value, span) {
    if (!(span > 0)) return value;
    const wrapped = value % span;
    return wrapped < 0 ? wrapped + span : wrapped;
}

/**
 * The shorter of the two ways round.
 *
 * On a torus every pair of points has two separations - the direct one and the
 * one through the passage - and almost everything that reasons about distance
 * wants the shorter. Returns a signed delta in [-span/2, span/2].
 *
 * This is what lets the server tell a wrap from a teleport: crossing the edge
 * looks like a jump of nearly a full arena width, and looks like a few pixels
 * once measured the short way.
 */
export function shortestDelta(delta, span) {
    if (!(span > 0)) return delta;
    const half = span / 2;
    let d = delta % span;
    if (d > half) d -= span;
    else if (d < -half) d += span;
    return d;
}
