// constants/vs_bow_constants.js - Arena bow feel

/**
 * Bow tuning for VS mode only.
 *
 * Deliberately separate from ARROW_CONSTANTS, which Adventure's own bow
 * systems (bow_charge_system, arrow_spawn_system) read: the arena wants a much
 * snappier weapon than the solo game, and changing the shared numbers would
 * have retuned Adventure as a side effect.
 *
 * The draw has two phases:
 *
 *   0 .. ARM_TIME          nothing yet. Release here and the shot is aborted
 *                          with no arrow spent - the same grace the old
 *                          one-second charge had, just much shorter.
 *   ARM_TIME .. FULL_DRAW  the arrow is nocked and visible in front of the
 *                          fighter, and the longer it is held the harder it
 *                          flies and the further it carries.
 *
 * ARM_TIME is short enough to feel immediate; what tells the player the bow is
 * ready is the arrow appearing, not a delay they have to count out.
 */
export const VS_BOW = {
    ARM_TIME: 200,        // ms before the arrow is nocked and can be loosed
    FULL_DRAW_TIME: 850,  // ms from press to maximum power

    // Flight speed, in px/s. The old 400 read as a lobbed pebble; even a
    // snap shot now crosses the arena at a believable clip.
    MIN_SPEED: 900,
    MAX_SPEED: 1600,

    // How far the shot carries before running out of steam and arcing down.
    // This is what makes hold time matter beyond raw speed.
    MIN_RANGE: 420,
    MAX_RANGE: 1500,

    // Fraction of forward speed an exhausted arrow keeps as it drops, so it
    // arcs away rather than stopping dead in mid-air.
    SPENT_DRAG: 0.45,

    // Muzzle range, in pixels, measured between the two fighters.
    //
    // An arrow loosed with the bow against someone does not wound them, it
    // finishes them. That is what makes the bow worth closing with rather
    // than only a way of holding someone off, and it gives the sword a real
    // reason to fear a drawn bow at arm's length instead of walking into it.
    //
    // Two fighters actually in contact stand about 104px apart, body centre
    // to body centre, so this is "pressed up against each other" and not
    // merely "nearby": at a tile and a half away the shot is an ordinary one
    // again. The referee measures it from the poses it already holds, so
    // nothing about it is taken on a client's word.
    POINT_BLANK_RANGE: 120
};

/** 0 at the moment the arrow is nocked, 1 at full draw. */
export function drawRatio(heldMs) {
    const span = VS_BOW.FULL_DRAW_TIME - VS_BOW.ARM_TIME;
    return Math.max(0, Math.min(1, (heldMs - VS_BOW.ARM_TIME) / span));
}

/** Launch speed and range for a shot held this long. */
export function shotPower(heldMs) {
    const t = drawRatio(heldMs);
    return {
        ratio: t,
        speed: VS_BOW.MIN_SPEED + (VS_BOW.MAX_SPEED - VS_BOW.MIN_SPEED) * t,
        range: VS_BOW.MIN_RANGE + (VS_BOW.MAX_RANGE - VS_BOW.MIN_RANGE) * t
    };
}
