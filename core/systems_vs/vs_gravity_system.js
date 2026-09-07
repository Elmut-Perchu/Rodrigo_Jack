// core/systems_vs/vs_gravity_system.js - VS Mode Gravity System
import { System } from '../systems/system.js';
import {
    GRAVITY,
    FALL_MULTIPLIER,
    APEX_SPEED,
    APEX_MULTIPLIER,
    TERMINAL_VELOCITY
} from '../../constants/vs_movement_constants.js';

/**
 * The arc a fighter falls through.
 *
 * Not a single constant but three, because a jump that rises and falls at the
 * same rate is the definition of floaty: the descent is heavier than the
 * climb, and both ease off near the peak so there is a moment of hang at the
 * top. See constants/vs_movement_constants.js for why each number is what it
 * is.
 *
 * Only fighters get the shaped arc. Anything else that falls - there is
 * nothing today, but arrows and spectres pass through this system - keeps
 * plain constant gravity, so adding weight to a jump can never quietly bend a
 * projectile's flight.
 */
export class VSGravity extends System {
    constructor(game) {
        super(game);

        // Stepped at a fixed rate by the game loop, so the same jump measures
        // the same height on every machine.
        this.fixedStep = true;

        this.gravity = GRAVITY;
        this.terminalVelocity = TERMINAL_VELOCITY;
    }

    update(deltaTime) {
        this.entities.forEach((entity) => {
            const velocity = entity.getComponent('velocity');
            const property = entity.getComponent('property');
            const networkPlayer = entity.getComponent('networkPlayer');

            if (!velocity || !property) return;

            // Only fighters simulated on this machine fall: the local player
            // and any bot. A networked opponent's position already arrives
            // with gravity applied by whoever is running it.
            if (networkPlayer && !networkPlayer.simulated) return;

            // Gravity is applied unconditionally, exactly like Adventure mode:
            // the collision pass is what zeroes vy and re-plants the player on
            // a tile. Gating this on !isOnGround instead left the flag latched
            // true after the first landing, so walking off a ledge made the
            // player float.
            if (!property.applyGravity) return;

            velocity.vy -= this.pull(velocity.vy, !!networkPlayer) * deltaTime;

            // Falling speed is clamped so a long drop cannot push the player
            // past the server's MAX_VELOCITY check (server/constants.go),
            // which would get every state update rejected and snap the player
            // back.
            if (velocity.vy < -this.terminalVelocity) {
                velocity.vy = -this.terminalVelocity;
            }
        });
    }

    /**
     * How hard this entity is pulled down right now.
     *
     * Two modifiers, and they stack: near the apex the pull eases so the
     * fighter hangs a moment where a jump is most worth reacting from, and
     * once past it the descent runs heavier than the climb so control comes
     * back sooner without the peak moving.
     */
    pull(vy, isFighter) {
        if (!isFighter) return this.gravity;

        let pull = this.gravity;
        if (vy <= 0) pull *= FALL_MULTIPLIER;
        if (Math.abs(vy) < APEX_SPEED) pull *= APEX_MULTIPLIER;

        return pull;
    }
}
