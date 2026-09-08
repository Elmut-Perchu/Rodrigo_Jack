// core/systems_vs/vs_input_system.js - VS Mode Input System
import { System } from '../systems/system.js';
import {
    JUMP_CUT,
    COYOTE_MS,
    JUMP_BUFFER_MS,
    GROUND_ACCEL_MS,
    AIR_ACCEL_MS
} from '../../constants/vs_movement_constants.js';
import { isParalysed } from '../../constants/vs_paralysis_constants.js';

// Jumps allowed after leaving the ground. One extra gives the classic double
// jump, and it is what makes the arena's tall climbs reachable at all: a
// single jump clears a 128px step, and only the pair clears a 192px one.
const MAX_AIR_JUMPS = 1;

/**
 * Turns held keys into movement.
 *
 * Three things happen here beyond reading the keyboard, and all three exist to
 * close the gap between what the player pressed and what the fighter did:
 *
 *   Coyote time      - a jump still works for a moment after walking off a ledge
 *   A jump buffer    - a jump pressed just before landing fires on touchdown
 *   The release cut  - letting go while rising ends the climb early
 *
 * The first two are forgiveness: without them the arena regularly ate an input
 * and gave nothing back, which is the one failure a player cannot learn around
 * because there is nothing to see. The third is the opposite - it hands back a
 * whole axis of expression, since the jump stops being a single fixed arc.
 */
export class VSInput extends System {
    constructor(game) {
        super(game);

        // Stepped at a fixed rate by the game loop: jump height must not
        // depend on the refresh rate of the screen it is played on.
        this.fixedStep = true;
    }

    update(deltaTime) {
        const now = performance.now();

        this.entities.forEach((entity) => {
            // Only process entities with input component (local player only)
            if (!entity.components.has('input')) return;

            const input = entity.getComponent('input');
            const velocity = entity.getComponent('velocity');
            const property = entity.getComponent('property');

            if (!input || !velocity || !property) return;

            // Update input vector from keyboard state
            if (typeof input.update === 'function') {
                input.update();
            }

            // Recorded before anything can clear it: the coyote window is
            // measured from the last frame the fighter was actually standing
            // on something.
            if (property.isOnGround) property.lastGroundedAt = now;

            // A shove from another fighter holds the ground keys off for a
            // moment, so the rebound is actually felt instead of being
            // cancelled by the direction key still being held (see
            // VSCollision).
            //
            // It suppresses footing only, never the jump. Blocking both meant
            // a fighter pinned in a scrum could not jump out of it: the
            // contact re-armed the window faster than it expired, and every
            // press was swallowed for as long as the two stayed touching. A
            // shove is a good reason to lose your footing and a bad reason to
            // lose the one input that would end the shove.
            const knocked = property.knockbackUntil && now < property.knockbackUntil;

            // Held by a spirit. Nothing the player presses reaches the
            // fighter's legs, and what was already pressed is dropped rather
            // than buffered - two seconds is far longer than the jump buffer
            // was ever meant to hold anything, and a jump fired the instant
            // the hold ends is a jump nobody asked for.
            //
            // Gravity is deliberately still running (VSGravity does not
            // consult this): a fighter caught in mid-air falls out of the sky
            // rather than hanging there, which is both funnier and much
            // clearer than freezing them in place.
            if (isParalysed(property)) {
                velocity.vx = 0;
                input.vector.v = 0;
                property.jumpBufferedAt = 0;
                return;
            }

            // Apply input to velocity
            if (property.movable) {
                if (!knocked) this.accelerate(property, velocity, input, deltaTime);
                this.tryJump(property, velocity, input, now);
                this.applyJumpCut(property, velocity, input);
            }
        });
    }

    /**
     * Eases horizontal speed toward what the keys are asking for.
     *
     * Snapping straight to full speed reads as weightless, and snapping to a
     * stop reads as sticky. The ramp is short enough that nothing feels
     * delayed - about four frames on the ground - and slower in the air, so
     * leaving the ground is a decision rather than a free re-aim.
     */
    accelerate(property, velocity, input, deltaTime) {
        const target = input.vector.h * property.speed;
        const rampMs = property.isOnGround ? GROUND_ACCEL_MS : AIR_ACCEL_MS;

        if (!(rampMs > 0)) {
            velocity.vx = target;
            return;
        }

        const step = (property.speed / (rampMs / 1000)) * deltaTime;
        const gap = target - velocity.vx;

        velocity.vx += Math.abs(gap) <= step ? gap : Math.sign(gap) * step;
    }

    /**
     * Ground jump, plus a limited number of jumps in mid-air.
     *
     * The air jump resets vertical speed outright rather than adding to it, so
     * it always gives the same lift whether it is used at the top of the arc
     * or halfway down.
     *
     * A press that cannot be used is held rather than thrown away. That single
     * change is what fixed the worst of the old feel: `input.vector.v` used to
     * be cleared before the ground was even tested, so a jump asked for a
     * fraction of a second too early simply never happened, and the player had
     * no way to tell that was what went wrong.
     */
    tryJump(property, velocity, input, now) {
        if (input.vector.v > 0) {
            input.vector.v = 0;
            property.jumpBufferedAt = now;
        }

        if (now - (property.jumpBufferedAt || 0) > JUMP_BUFFER_MS) return;

        // Still counted as standing for a moment after the ledge runs out.
        // Spending the window zeroes it, so a ground jump can never be
        // followed by a second free one.
        const grounded = property.isOnGround
            || now - (property.lastGroundedAt || 0) <= COYOTE_MS;

        if (grounded) {
            this.launch(property, velocity);
            property.isOnGround = false;
            property.airJumpsUsed = 0;
            property.lastGroundedAt = 0;
            return;
        }

        if ((property.airJumpsUsed || 0) < MAX_AIR_JUMPS) {
            property.airJumpsUsed = (property.airJumpsUsed || 0) + 1;
            this.launch(property, velocity);
        }

        // Otherwise the press stays buffered: it may still be usable when the
        // fighter lands, which is exactly the case this was added for.
    }

    launch(property, velocity) {
        velocity.vy = property.jumpStrength;
        property.jumpBufferedAt = 0;
        property.jumpCutArmed = true;
    }

    /**
     * Releasing the jump key ends the climb early.
     *
     * Armed only by an actual jump, so a rebound off another fighter keeps its
     * full arc: a shove is not something the player asked for and should not
     * be cut short by a key they were never holding.
     */
    applyJumpCut(property, velocity, input) {
        if (!property.jumpCutArmed) return;

        if (velocity.vy <= 0) {
            property.jumpCutArmed = false;
            return;
        }

        // A bot holds its jumps to full height; varying them is a decision for
        // VSBot, not something to infer from a missing field.
        if (input.jumpHeld !== false) return;

        velocity.vy *= JUMP_CUT;
        property.jumpCutArmed = false;
    }
}
