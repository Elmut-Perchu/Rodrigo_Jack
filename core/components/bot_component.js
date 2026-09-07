// core/components/bot_component.js
import { Component } from './component.js';
import { getBotLevel, DEFAULT_BOT_LEVEL } from '../../constants/bot_constants.js';

/**
 * Everything the AI needs to remember between frames.
 *
 * The difficulty preset is copied in rather than referenced by id so a match
 * can tweak a single bot without touching the shared table.
 */
export class Bot extends Component {
    constructor(levelId = DEFAULT_BOT_LEVEL) {
        super();

        this.level = getBotLevel(levelId);
        this.levelId = this.level.id;

        // Current plan
        this.state = 'approach';   // approach | strike | space | shoot | fetch | retreat | wander
        this.nextDecisionAt = 0;   // performance.now() of the next re-plan
        this.targetId = null;      // Who it is fighting

        // Perception is deliberately stale: the bot only acts on what it
        // "noticed", refreshed no faster than its reaction time allows.
        this.seen = { x: 0, y: 0, facingRight: true, at: 0 };
        this.nextPerceptionAt = 0;

        // Pending reflexes, scheduled in the future so reaction time is real
        // delay rather than a probability roll.
        this.parryAt = 0;          // Swing scheduled to answer an incoming blow
        this.swingAt = 0;          // Ordinary attack scheduled
        this.lastSwingAt = 0;

        // Bow charge in progress: the trigger is held until this timestamp.
        this.chargeUntil = 0;

        // Navigation
        this.wanderDir = 1;
        this.nextWanderAt = 0;
        this.jumpBlockedUntil = 0; // Debounce so it does not hop every frame
        this.stuckSince = 0;
        this.lastX = 0;

        // Arrow the bot is currently walking toward
        this.fetchArrowId = null;
    }
}
