//core/systems/movement_system.js
import { System } from './system.js';
import { dlog } from '../debug_log.js';

export class Movement extends System {
    update(deltaTime) {
        this.entities.forEach((entity) => {
            const position = entity.getComponent('position');
            const velocity = entity.getComponent('velocity');
            const visual = entity.getComponent('visual');
            const health = entity.getComponent('health');

            if (!position || !velocity || !visual) return;

            // CRITICAL FIX: Skip remote players in VS mode
            // Remote players are controlled by NetworkSyncSystem interpolation
            // Only local player should be updated by MovementSystem
            const networkPlayer = entity.getComponent('networkPlayer');
            if (networkPlayer && !networkPlayer.isLocal) {
                return; // Remote player - controlled by NetworkSyncSystem
            }

            // 🔴 DEBUG: Log velocity BEFORE applying movement
            if (networkPlayer && networkPlayer.isLocal && velocity.vx !== 0) {
                dlog(`🟣 [MOVEMENT] BEFORE: entity=${entity.uuid.slice(0,8)}, vx=${velocity.vx.toFixed(1)}, vy=${velocity.vy.toFixed(1)}`);
            }

            // Mettre à jour la position même pendant le knockback
            const oldX = position.x;
            const oldY = position.y;
            position.x += velocity.vx * deltaTime;
            position.y -= velocity.vy * deltaTime;

            // 🔴 DEBUG: Log when position actually changes
            if (networkPlayer && networkPlayer.isLocal) {
                const dx = position.x - oldX;
                const dy = position.y - oldY;
                if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
                    dlog(`🟣 [MOVEMENT] AFTER: (${oldX.toFixed(1)}, ${oldY.toFixed(1)}) → (${position.x.toFixed(1)}, ${position.y.toFixed(1)}), delta=(${dx.toFixed(2)}, ${dy.toFixed(2)})`);
                }
            }

            // Appliquer un amortissement à la vélocité si en knockback
            if (health?.isBeingKnockedBack) {
                velocity.vx *= 0.95;
                velocity.vy *= 0.95;
            }

            // Mettre à jour la position visuelle
            visual.div.style.left = `${position.x}px`;
            visual.div.style.top = `${position.y}px`;

            // NOTE: input.update() is now called by InputSystem BEFORE velocity calculation
            // This was moved to ensure input.vector is updated before we read it
        });
    }
}
