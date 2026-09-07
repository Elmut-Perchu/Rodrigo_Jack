import { System } from './system.js';
import { dlog } from '../debug_log.js';

export class Input extends System {
    update() {
        // 🔴 DEBUG: Count entities with input component
        if (!this._entityCountLog) this._entityCountLog = 0;
        this._entityCountLog++;
        if (this._entityCountLog % 120 === 0) {
            let count = 0;
            this.entities.forEach(e => { if (e.components.has('input')) count++; });
            dlog(`🔴 [INPUT SYSTEM] Entities with input component: ${count}`);
        }

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

                // CRITICAL: Call input.update() FIRST to update vector from keyboard state
                // This must happen before we read input.vector
                if (input && typeof input.update === 'function') {
                    input.update();
                }

                // 🔍 DEBUG: Log input processing ONLY when keys are pressed
                const keys = input?.keys ? Array.from(input.keys) : [];
                if (keys.length > 0) {
                    const isLocal = networkPlayer?.isLocal;
                    const instanceId = input?.instanceId || '?';
                    dlog(`🔴 [INPUT SYSTEM] instance #${instanceId}: keys=[${keys.join(',')}], vector=${JSON.stringify(input.vector)}, vx will be=${input.vector.h * property.speed}`);
                }

                if (input && input.vector && velocity && property && property.movable) {
                    const oldVx = velocity.vx;
                    velocity.vx = input.vector.h * property.speed;

                    // 🔴 DEBUG: Log when velocity changes
                    if (velocity.vx !== 0 || oldVx !== 0) {
                        dlog(`🟢 [INPUT] Velocity set: vx=${velocity.vx} (was ${oldVx}), vector.h=${input.vector.h}, isOnGround=${property.isOnGround}`);
                    }

                    if (input.vector.v > 0) {
                        input.vector.v = 0;
                        property.isOnGround = false;
                        velocity.vy = property.jumpStrength;
                        dlog(`🟢 [INPUT] Jump! vy=${velocity.vy}`);
                    }
                }
            }
        });
    }
}

