import { System } from './system.js';

export class Input extends System {
    update() {
        this.entities.forEach((entity) => {
            if (entity.components.has('input')) {
                // VS Mode safety: Skip remote players (they should never have 'input' component anyway)
                const networkPlayer = entity.getComponent('networkPlayer');
                if (networkPlayer && !networkPlayer.isLocal) {
                    // This should never happen (remote players don't have 'input' component)
                    console.warn('[Input] Skipping remote player:', networkPlayer.playerName);
                    return;
                }

                const input = entity.getComponent('input');
                const velocity = entity.getComponent('velocity');
                const property = entity.getComponent('property');
                if (input && input.vector && velocity && property && property.movable) {
                    velocity.vx = input.vector.h * property.speed;
                    if (input.vector.v > 0) {
                        input.vector.v = 0;
                        property.isOnGround = false;
                        velocity.vy = property.jumpStrength;
                    }
                }
            }
        });
    }
}

