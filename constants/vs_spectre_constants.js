// constants/vs_spectre_constants.js - The spectre, and the gauge that pays for it

/**
 * Channelling a spirit is the arena's slow weapon.
 *
 * The sword is instant and the bow costs an arrow you have to walk back and
 * pick up; the spectre costs *time spent standing still and visible*. Holding
 * C plays the casting animation and fills a gauge; a full gauge can be spent
 * to send a wraith after an opponent, which then hunts them on its own.
 *
 * The numbers below are what make that trade honest: long enough to channel
 * that an opponent watching you do it has time to close the distance, slow
 * enough on foot while channelling that you cannot do it on the run.
 */
export const VS_SPECTRE = {
    // Seconds of channelling to fill an empty gauge.
    CHANNEL_TIME: 2600,

    // Footspeed while channelling. Standing still is not enforced, but
    // crossing the arena mid-cast is not an option either.
    CHANNEL_SLOWDOWN: 0.45,

    // The gauge is not lost when you stop channelling: it is a reward for
    // time invested, and bleeding it away would only punish players who have
    // to break off to defend themselves.

    // Flight. The spectre is slower than an arrow but it does not miss by
    // being aimed badly - it turns after its quarry.
    SPEED: 330,
    TURN_RATE: 3.6,       // radians per second

    // How long it hunts before dissolving, so a spectre chasing someone who
    // has run out of reach does not follow them for the rest of the match.
    LIFETIME: 5200,

    // Distance from the spectre's centre to a fighter's body centre that
    // counts as contact.
    HIT_RADIUS: 52,

    // Where it appears, relative to the caster.
    SPAWN_OFFSET_X: 70,

    // Breathing room between two casts.
    COOLDOWN: 600,

    // Display size of the 32x32 wraith frames.
    DISPLAY_SIZE: 84,

    // What it takes to cut one down.
    //
    // A spirit that could only be outrun made the third weapon a thing to
    // suffer rather than a thing to answer: it never misses by being aimed
    // badly, so the counter to it cannot be dodging either. A sword swung
    // through one, or an arrow put into it, dissolves it - which turns the
    // two seconds the caster spent standing still into a gamble instead of a
    // guarantee.
    //
    // Measured from the spirit's centre: the blade to the fighter's body
    // centre, roughly its reach; the arrow to its shaft, forgiving enough
    // that catching a wraith mid-turn is a shot worth attempting.
    BLADE_CUT_RANGE: 120,
    ARROW_CUT_RADIUS: 44
};
