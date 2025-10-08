// core/systems/bow_charge_system.js
import { System } from './system.js';
import { ARROW_CONSTANTS } from '../../constants/arrow_constants.js';

/**
 * Système qui gère les effets de la charge de l'arc sur le player
 * - Ralentissement vitesse pendant charge
 * - Monitoring timer charge
 */
export class BowChargeSystem extends System {
    update() {
        // Trouver le player
        const player = Array.from(this.entities).find(e => e.getComponent('input'));
        if (!player) return;

        const bowState = player.getComponent('bow_state');
        const velocity = player.getComponent('velocity');
        const property = player.getComponent('property');

        if (!bowState || !velocity || !property) return;

        // Appliquer ralentissement si en charge
        if (bowState.state === 'charging') {
            // Réduire vitesse horizontale (50%)
            if (velocity.vx !== 0) {
                velocity.vx *= ARROW_CONSTANTS.CHARGE_SPEED_MULTIPLIER;
            }

            // Le player peut toujours sauter (vy non affectée)
        }
    }
}
