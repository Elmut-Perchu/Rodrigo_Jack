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

                // 🔍 DEBUG: Log input processing
                if (!this._inputLogCount) this._inputLogCount = 0;
                this._inputLogCount++;
                if (this._inputLogCount % 120 === 0 && networkPlayer?.isLocal) {
                    console.warn(`🔍 [INPUT] Processing local player: has input=${!!input}, vector=${input?.vector ? JSON.stringify(input.vector) : 'none'}, movable=${property?.movable}`);
                }

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

