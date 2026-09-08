// core/systems_vs/vs_movement_system.js - VS Mode Movement System
import { System } from '../systems/system.js';

export class VSMovement extends System {
    constructor(game) {
        super(game);

        // Integrated at a fixed rate, not per frame: semi-implicit Euler is
        // not frame-rate independent, and the same jump used to measure 95px
        // at 120fps against 84px at 20fps.
        this.fixedStep = true;
    }

    update(deltaTime) {
        this.entities.forEach((entity) => {
            const position = entity.getComponent('position');
            const velocity = entity.getComponent('velocity');
            const networkPlayer = entity.getComponent('networkPlayer');

            if (!position || !velocity) return;

            if (networkPlayer && networkPlayer.simulated) {
                // Simulated here (local player or bot): integrate velocity
                position.x += velocity.vx * deltaTime;
                position.y -= velocity.vy * deltaTime;
            }

            // A networked opponent is placed from their interpolation buffer
            // instead, and not here: that is drawing rather than simulating,
            // and it belongs on the frame cadence rather than on this fixed
            // step (see VSInterpolate). Anything else - a tile - does not
            // move at all.
        });
    }
}
