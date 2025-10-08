// core/systems/arrow_impact_system.js
import { System } from './system.js';
import { ARROW_CONSTANTS } from '../../constants/arrow_constants.js';

/**
 * Système qui gère les animations d'impact des flèches
 * - Impact tile: frames 0-1 puis freeze → stuck
 * - Impact enemy: frames 0-4 → trigger death → flèche tombe (récupérable)
 */
export class ArrowImpactSystem extends System {
    constructor(game) {
        super();
        this.game = game;
    }

    update() {
        const impactingArrows = Array.from(this.entities).filter(e => {
            const arrow = e.getComponent('arrow');
            return arrow && (arrow.state === 'impacting_tile' || arrow.state === 'impacting_enemy');
        });

        impactingArrows.forEach(arrowEntity => {
            const arrow = arrowEntity.getComponent('arrow');
            const animation = arrowEntity.getComponent('animation');
            const position = arrowEntity.getComponent('position');

            if (!arrow || !animation) return;

            // Vérifier si animation pas encore initialisée
            if (!arrow.impactAnimationStarted) {
                this.startImpactAnimation(arrowEntity, arrow, animation);
                arrow.impactAnimationStarted = true;
            }

            // Calculer temps écoulé depuis début impact
            const elapsed = performance.now() - arrow.impactStartTime;

            // Si impacting_enemy, garder la flèche à la position d'impact sauvegardée
            if (arrow.state === 'impacting_enemy' && arrow.impactPosition) {
                // Garder la position d'impact fixe (ne pas suivre l'ennemi)
                position.x = arrow.impactPosition.x;
                position.y = arrow.impactPosition.y;
            }

            // Gérer selon type d'impact
            if (arrow.state === 'impacting_tile') {
                this.handleTileImpact(arrowEntity, arrow, animation, elapsed);
            } else if (arrow.state === 'impacting_enemy') {
                this.handleEnemyImpact(arrowEntity, arrow, animation, elapsed);
            }
        });
    }

    /**
     * Initialise l'animation d'impact
     */
    startImpactAnimation(arrowEntity, arrow, animation) {
        console.log('🎯 [ArrowImpactSystem] startImpactAnimation called');
        console.log('  - arrow.state:', arrow.state);
        console.log('  - animation.currentState BEFORE:', animation.currentState);
        console.log('  - animation.initialized BEFORE:', animation.initialized);

        // Switch vers impact spritesheet
        animation.switchToImpactSprite();

        console.log('  - animation.initialized AFTER switchToImpactSprite:', animation.initialized);
        console.log('  - animation.spriteSheet.src:', animation.spriteSheet.src);

        // Set animation selon type
        if (arrow.state === 'impacting_tile') {
            animation.setState('impact_tile');
            console.log('  - setState("impact_tile") called');
        } else if (arrow.state === 'impacting_enemy') {
            animation.setState('impact_enemy');
            console.log('  - setState("impact_enemy") called');
        }

        console.log('  - animation.currentState AFTER:', animation.currentState);
        console.log('  - animation.currentSequence:', animation.currentSequence);

        // TODO: Add audio "arrow_impact_tile" ou "arrow_impact_enemy"
    }

    /**
     * Gère impact sur tile
     */
    handleTileImpact(arrowEntity, arrow, animation, elapsed) {
        // Durée pour 2 frames à 5fps = 400ms
        const duration = (ARROW_CONSTANTS.IMPACT_TILE_FRAMES / ARROW_CONSTANTS.FPS_IMPACT) * 1000;

        if (elapsed >= duration) {
            // Animation complète : passer en stuck et freeze sur frame 1
            console.log('🎯 [ArrowImpactSystem] Completing tile impact - transition to stuck');
            animation.currentFrame = 1; // Force frame 1 (dernière frame)
            arrow.state = 'stuck'; // Maintenant AnimationSystem va skip updateAnimation
            arrow.isRecoverable = true;
        }
    }

    /**
     * Gère impact sur enemy
     */
    handleEnemyImpact(arrowEntity, arrow, animation, elapsed) {
        // Durée pour 5 frames à 5fps = 1000ms
        const duration = (ARROW_CONSTANTS.IMPACT_ENEMY_FRAMES / ARROW_CONSTANTS.FPS_IMPACT) * 1000;

        console.log('🎯 [ArrowImpactSystem] handleEnemyImpact - elapsed:', elapsed, 'duration:', duration);

        if (elapsed >= duration) {
            console.log('🎯 [ArrowImpactSystem] Impact duration complete, killing enemy');

            // Animation complète: trigger death enemy
            const enemy = Array.from(this.game.entities).find(e => e.uuid === arrow.impactTargetUUID);
            if (enemy) {
                console.log('  - Enemy found:', enemy.uuid);
                this.triggerEnemyDeath(enemy);
            } else {
                console.log('  - ERROR: Enemy not found with UUID:', arrow.impactTargetUUID);
            }

            // Flèche tombe au sol (reste stuck et récupérable)
            arrow.state = 'stuck';
            arrow.isRecoverable = true;

            // Optionnel: faire tomber la flèche un peu plus bas
            const position = arrowEntity.getComponent('position');
            if (position) {
                position.y += 20; // Tombe légèrement
            }

            console.log('  - Arrow now stuck and recoverable');
        }
    }

    /**
     * Déclenche la mort de l'enemy
     */
    triggerEnemyDeath(enemy) {
        const animation = enemy.getComponent('animation');
        const property = enemy.getComponent('property');

        if (animation) {
            animation.setState('death');
        }

        // Marquer comme mort
        if (property) {
            property.isDead = true;
        }

        // Ajouter à levelState pour persistance (ne respawn pas si on revient)
        if (this.game.levelState && this.game.levelState.deadEnemies) {
            this.game.levelState.deadEnemies.add(enemy.uuid);
            console.log('🎯 Enemy killed by arrow, added to deadEnemies:', enemy.uuid);
        }

        // Incrémenter stats globales
        if (this.game.globalStats) {
            this.game.globalStats.enemiesKilled = (this.game.globalStats.enemiesKilled || 0) + 1;
        }

        // Supprimer l'ennemi après l'animation de mort
        const deathDuration = (animation.sequences.death.frames.length / animation.sequences.death.speed) * 1000;
        setTimeout(() => {
            if (this.game && this.game.removeEntity) {
                this.game.removeEntity(enemy);
                console.log('🎯 Enemy removed after death animation:', enemy.uuid);
            }
        }, deathDuration);

        // TODO: Add audio "enemy_death_by_arrow"
    }
}
