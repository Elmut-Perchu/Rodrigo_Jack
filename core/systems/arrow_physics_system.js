// core/systems/arrow_physics_system.js
import { System } from './system.js';

/**
 * Système qui gère la physique des flèches en vol
 * - Pas de gravité (MVP)
 * - Trajectoire rectiligne
 * - Rotation sprite selon direction (optionnel)
 */
export class ArrowPhysicsSystem extends System {
    update() {
        this.entities.forEach(entity => {
            const arrow = entity.getComponent('arrow');
            const velocity = entity.getComponent('velocity');
            const visual = entity.getComponent('visual');

            if (!arrow || !velocity || !visual) return;

            // Ne traiter que les flèches en vol
            if (arrow.state !== 'flying') return;

            // Rotation sprite selon direction (flip horizontal)
            const animation = entity.getComponent('animation');
            if (animation && arrow.direction.x < 0) {
                animation.isFlipped = true;
            } else if (animation && arrow.direction.x > 0) {
                animation.isFlipped = false;
            }

            // Pas de modification velocity (pas de gravité MVP)
            // La velocity reste constante définie au spawn
        });
    }
}
