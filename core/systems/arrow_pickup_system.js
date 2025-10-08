// core/systems/arrow_pickup_system.js
import { System } from './system.js';
import { ARROW_CONSTANTS } from '../../constants/arrow_constants.js';

/**
 * Système qui gère la récupération des flèches plantées
 * - Auto-pickup au contact du player
 * - Max arrows = 7
 */
export class ArrowPickupSystem extends System {
    constructor(game) {
        super();
        this.game = game;
    }

    update() {
        // Trouver le player
        const player = Array.from(this.entities).find(e => e.getComponent('input'));
        if (!player) return;

        const playerPos = player.getComponent('position');
        const playerVisual = player.getComponent('visual');
        const bowState = player.getComponent('bow_state');

        if (!playerPos || !playerVisual || !bowState) return;

        // Trouver toutes les flèches stuck et récupérables
        const stuckArrows = Array.from(this.entities).filter(e => {
            const arrow = e.getComponent('arrow');
            return arrow && arrow.state === 'stuck' && arrow.isRecoverable;
        });

        if (stuckArrows.length === 0) return;

        // Calculer centre player
        const playerCenterX = playerPos.x + playerVisual.width / 2;
        const playerCenterY = playerPos.y + playerVisual.height / 2;

        // Checker distance avec chaque flèche
        stuckArrows.forEach(arrowEntity => {
            const arrowPos = arrowEntity.getComponent('position');
            const arrowVisual = arrowEntity.getComponent('visual');

            if (!arrowPos || !arrowVisual) return;

            // Calculer centre flèche
            const arrowCenterX = arrowPos.x + arrowVisual.width / 2;
            const arrowCenterY = arrowPos.y + arrowVisual.height / 2;

            // Distance
            const dx = playerCenterX - arrowCenterX;
            const dy = playerCenterY - arrowCenterY;
            const distance = Math.sqrt(dx * dx + dy * dy);

            // Si proche et pas full arrows
            if (distance <= ARROW_CONSTANTS.PICKUP_RADIUS) {
                if (bowState.pickupArrow()) {
                    // Récupération réussie: destroy arrow
                    this.game.removeEntity(arrowEntity);
                    // TODO: Add audio "arrow_pickup"
                }
            }
        });
    }
}
