// core/systems_vs/vs_input_system.js - VS Mode Input System
import { System } from '../systems/system.js';

// Jumps allowed after leaving the ground. One extra gives the classic double
// jump, and it is what makes the arena's 64px platforms climbable: a single
// jump peaks at about 60px (425 launch against 1500 gravity), just short of a
// tile, so height used to be something you could only lose.
const MAX_AIR_JUMPS = 1;

export class VSInput extends System {
    update() {
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

            // A shove from another fighter keeps control for a moment, so the
            // rebound is actually felt instead of being cancelled by the
            // direction key still being held (see VSCollision).
            const knocked = property.knockbackUntil && performance.now() < property.knockbackUntil;

            // Apply input to velocity
            if (property.movable && !knocked) {
                velocity.vx = input.vector.h * property.speed;
                this.tryJump(property, velocity, input);
            }
        });
    }

    /**
     * Ground jump, plus a limited number of jumps in mid-air.
     *
     * The second jump resets vertical speed outright rather than adding to it,
     * so it always gives the same lift whether it is used at the top of the
     * arc or halfway down.
     */
    tryJump(property, velocity, input) {
        if (!(input.vector.v > 0)) return;
        input.vector.v = 0;

        if (property.isOnGround) {
            property.isOnGround = false;
            property.airJumpsUsed = 0;
            velocity.vy = property.jumpStrength;
            return;
        }

        if ((property.airJumpsUsed || 0) < MAX_AIR_JUMPS) {
            property.airJumpsUsed = (property.airJumpsUsed || 0) + 1;
            velocity.vy = property.jumpStrength;
        }
    }
}
