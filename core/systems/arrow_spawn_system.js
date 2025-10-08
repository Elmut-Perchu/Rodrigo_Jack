// core/systems/arrow_spawn_system.js
import { System } from './system.js';
import { createArrow } from '../../create/arrow_create.js';
import { ARROW_CONSTANTS } from '../../constants/arrow_constants.js';

/**
 * Système qui spawn les flèches quand le player relâche SPACE
 * Détecte l'état 'ready_to_shoot' et crée l'entité arrow
 */
export class ArrowSpawnSystem extends System {
    constructor(game) {
        super();
        this.game = game; // Référence au game pour addEntity
    }

    update() {
        // Trouver le player
        const player = Array.from(this.entities).find(e => e.getComponent('input'));
        if (!player) return;

        const bowState = player.getComponent('bow_state');
        const position = player.getComponent('position');
        const visual = player.getComponent('visual');
        const animation = player.getComponent('animation');

        if (!bowState || !position || !visual || !animation) return;

        // Vérifier si prêt à tirer
        if (bowState.state === 'ready_to_shoot') {
            this.spawnArrow(player, bowState, position, visual, animation);
        }
    }

    /**
     * Crée et spawn une flèche
     */
    spawnArrow(player, bowState, position, visual, animation) {
        // Calculer position spawn (devant le player)
        const direction = bowState.facingDirection;
        const spawnX = position.x + (direction.x > 0 ? 1 : -1) * ARROW_CONSTANTS.SPAWN_OFFSET_X;

        // Spawn au centre du CircleHitbox du player
        const hitbox = player.getComponent('circle_hitbox');
        let centerY;
        if (hitbox) {
            // Centre CircleHitbox = position.y + (visual.height/2) + offsetY
            centerY = position.y + (visual.height / 2) + hitbox.offsetY;
        } else {
            // Fallback: centre visual
            centerY = position.y + (visual.height / 2);
        }

        // Top de la flèche pour que son centre soit aligné avec centerY
        const spawnY = centerY - (ARROW_CONSTANTS.ARROW_DISPLAY_HEIGHT / 2);

        // Créer l'entité arrow
        const arrow = createArrow(spawnX, spawnY, direction, player.uuid);

        // Ajouter au game
        this.game.addEntity(arrow);

        // Consommer flèche et retour idle
        bowState.shoot();
        animation.setState('idle');

        // TODO: Add audio "arrow_shoot"
    }
}
