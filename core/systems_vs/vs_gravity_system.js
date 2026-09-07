// core/systems_vs/vs_gravity_system.js - VS Mode Gravity System
import { System } from '../systems/system.js';

export class VSGravity extends System {
    constructor(game) {
        super(game);
        this.gravity = 1500; // Same as Adventure mode

        // Falling speed is clamped so a long drop cannot push the player past
        // the server's MAX_VELOCITY check (server/constants.go), which would
        // get every state update rejected and snap the player back.
        this.terminalVelocity = 900;
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
            if (property.applyGravity) {
                velocity.vy -= this.gravity * deltaTime;
                if (velocity.vy < -this.terminalVelocity) {
                    velocity.vy = -this.terminalVelocity;
                }
            }
        });
    }
}
