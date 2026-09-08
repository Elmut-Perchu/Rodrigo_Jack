// constants/bot_constants.js - AI opponent difficulty presets

/**
 * Difficulty levels for the computer opponent.
 *
 * The levels are NOT stat scaling on a single behaviour: a Rookie and a Master
 * play differently, not just faster. What separates them is mostly *timing* and
 * *judgement* - how quickly they answer a threat, how well they hold spacing,
 * and whether they manage their quiver at all.
 *
 * Two reaction budgets are tracked separately because they serve different
 * purposes:
 *
 *   reactionMs      - how long the bot takes to notice a change in the
 *                     situation (the opponent moved, changed height, ...).
 *   parryReactionMs - the reflex to answer an incoming sword blow.
 *
 * drawFullness says how patiently the bot holds a bow draw, and therefore how
 * hard and how far its arrows fly (see constants/vs_bow_constants.js).
 *
 * spectreRange is the third weapon. Channelling a spirit costs a long moment
 * of near-standing-still, so knowing when it is safe to start is a judgement
 * call rather than a stat: a Rookie never risks it at all, and the better
 * levels are willing to begin from progressively closer in.
 *
 * The second one is the interesting one. Parries are not granted to the bot:
 * it answers with a real swing, and the same arbiter rule that judges two human
 * players decides whether the blades met (see vs_local_arbiter.js). The parry
 * window is 220ms, so a bot that reacts in 400ms simply cannot parry, however
 * much it would like to - which is exactly what makes the Rookie feel like a
 * Rookie.
 */
export const BOT_LEVELS = {
    rookie: {
        id: 'rookie',
        label: 'Rookie',
        blurb: 'Wanders, swings late, never parries.',

        reactionMs: 520,
        parryReactionMs: 400,   // Past the 220ms window: cannot parry
        parryChance: 0.05,
        decisionMs: 460,

        aggression: 0.35,       // How much it commits to closing distance
        speedFactor: 0.72,      // Fraction of the player's run speed
        mistakeChance: 0.30,    // Odds a decision is replaced by a blunder

        arrowBias: 0.15,        // Preference for the bow over the sword
        drawFullness: 0.15,     // Lets go almost at once: weak, short shots
        aimTolerance: 90,       // Vertical alignment slack when shooting (px)
        retrieveArrows: false,  // Does not bother collecting spent arrows

        keepsDistance: false,   // Does not back off to bow range
        retreatBelowHalfHearts: 0,   // Never retreats

        spectreRange: 0         // Never channels a spirit
    },

    soldier: {
        id: 'soldier',
        label: 'Soldier',
        blurb: 'Closes in, mixes sword and bow, parries sometimes.',

        reactionMs: 320,
        parryReactionMs: 170,
        parryChance: 0.30,
        decisionMs: 320,

        aggression: 0.60,
        speedFactor: 0.85,
        mistakeChance: 0.15,

        arrowBias: 0.40,
        drawFullness: 0.50,     // Half a draw
        aimTolerance: 50,
        retrieveArrows: true,

        keepsDistance: false,
        retreatBelowHalfHearts: 0,

        spectreRange: 620       // Channels only when well out of reach
    },

    veteran: {
        id: 'veteran',
        label: 'Veteran',
        blurb: 'Holds spacing, manages its quiver, parries often.',

        reactionMs: 190,
        parryReactionMs: 110,
        parryChance: 0.62,
        decisionMs: 220,

        aggression: 0.80,
        speedFactor: 1.0,
        mistakeChance: 0.05,

        arrowBias: 0.55,
        drawFullness: 0.85,     // Nearly always a full draw
        aimTolerance: 24,
        retrieveArrows: true,

        keepsDistance: true,
        retreatBelowHalfHearts: 2,   // under one heart

        spectreRange: 480
    },

    master: {
        id: 'master',
        label: 'Master',
        blurb: 'Reads your swings, punishes whiffs, rarely wastes an arrow.',

        reactionMs: 110,
        parryReactionMs: 60,
        parryChance: 0.88,
        decisionMs: 160,

        aggression: 0.95,
        speedFactor: 1.0,
        mistakeChance: 0.0,

        arrowBias: 0.65,
        drawFullness: 1.00,     // Always at full power
        aimTolerance: 8,
        retrieveArrows: true,

        keepsDistance: true,
        retreatBelowHalfHearts: 3,   // under one and a half

        spectreRange: 360       // Confident enough to channel under pressure
    }
};

export const BOT_LEVEL_ORDER = ['rookie', 'soldier', 'veteran', 'master'];

export const DEFAULT_BOT_LEVEL = 'soldier';

export function getBotLevel(id) {
    return BOT_LEVELS[id] || BOT_LEVELS[DEFAULT_BOT_LEVEL];
}

/** Names given to computer opponents, one per difficulty. */
export const BOT_NAMES = {
    rookie: 'Grunt',
    soldier: 'Sentinel',
    veteran: 'Warden',
    master: 'Blackblade'
};
