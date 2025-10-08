// core/systems/arrow_collision_system.js
import { System } from './system.js';
import { TILE_CONSTANTS } from '../../constants/tile_constants.js';
import { ARROW_CONSTANTS } from '../../constants/arrow_constants.js';

/**
 * Système qui détecte les collisions des flèches avec tiles et enemies
 * - Collision tile solide → impact_tile
 * - Collision enemy → impact_enemy
 */
export class ArrowCollisionSystem extends System {
    constructor(game) {
        super();
        this.game = game;
    }

    update() {
        // Récupérer toutes les flèches en vol depuis ce système
        const flyingArrows = Array.from(this.entities).filter(e => {
            const arrow = e.getComponent('arrow');
            return arrow && arrow.state === 'flying';
        });

        if (flyingArrows.length === 0) return;

        // DEBUG: Vérifier game.entities
        console.log('🎯 [ArrowCollisionSystem] DEBUG game.entities');
        console.log('  - game.entities type:', typeof this.game.entities);
        console.log('  - game.entities size:', this.game.entities ? this.game.entities.size || this.game.entities.length : 'undefined');

        // Récupérer tiles et enemies depuis TOUTES les entités du jeu
        const allEntities = Array.from(this.game.entities || []);
        console.log('  - Total entities in game:', allEntities.length);

        const tiles = allEntities.filter(e => e.getComponent('tile'));

        // DEBUG: Vérifier les properties de toutes les entités
        const entitiesWithProperty = allEntities.filter(e => e.getComponent('property'));
        console.log('  - Entities with property:', entitiesWithProperty.length);

        // Examiner les 5 premières entités avec property
        entitiesWithProperty.slice(0, 5).forEach((e, i) => {
            const prop = e.getComponent('property');
            console.log(`    Entity ${i}:`, {
                isPlayer: prop.isPlayer,
                isEnemy: prop.isEnemy,
                isArrow: prop.isArrow,
                solid: prop.solid,
                movable: prop.movable
            });
        });

        const enemies = allEntities.filter(e => {
            const property = e.getComponent('property');
            return property && property.isEnemy;
        });

        console.log('  - Tiles count:', tiles.length);
        console.log('  - Enemies count:', enemies.length);

        // Checker chaque flèche
        flyingArrows.forEach(arrowEntity => {
            const arrow = arrowEntity.getComponent('arrow');
            const position = arrowEntity.getComponent('position');
            const visual = arrowEntity.getComponent('visual');
            const velocity = arrowEntity.getComponent('velocity');

            if (!position || !visual) return;

            // Ignorer collisions pendant le délai initial (100ms après spawn)
            const elapsedSinceSpawn = performance.now() - arrow.spawnTime;
            if (elapsedSinceSpawn < arrow.collisionDelay) {
                return; // Pas encore de collision
            }

            // 1. Check collision avec tiles solides
            const tileCollision = this.checkTileCollision(arrowEntity, position, visual, tiles);
            if (tileCollision) {
                this.handleTileCollision(arrowEntity, arrow, velocity, position);
                return; // Stop checking
            }

            // 2. Check collision avec enemies
            const enemyCollision = this.checkEnemyCollision(arrowEntity, position, visual, enemies);
            if (enemyCollision) {
                console.log('🎯 [ArrowCollisionSystem] Enemy collision detected!', enemyCollision.uuid);
                this.handleEnemyCollision(arrowEntity, arrow, velocity, position, enemyCollision);
                return; // Stop checking
            }
        });
    }

    /**
     * Vérifie collision avec tiles solides
     */
    checkTileCollision(arrowEntity, position, visual, tiles) {
        // Calculer position du VRAI hitbox (centré dans le visual)
        const hitboxWidth = ARROW_CONSTANTS.ARROW_HITBOX_WIDTH;
        const hitboxHeight = ARROW_CONSTANTS.ARROW_HITBOX_HEIGHT;
        const hitboxX = position.x + (visual.width - hitboxWidth) / 2;
        const hitboxY = position.y + (visual.height - hitboxHeight) / 2;

        for (const tile of tiles) {
            const tilePos = tile.getComponent('position');
            const tileVisual = tile.getComponent('visual');
            const tileProperty = tile.getComponent('property');

            if (!tilePos || !tileVisual || !tileProperty) continue;
            if (!tileProperty.solid) continue; // Ignorer tiles non-solides

            // AABB collision avec le VRAI hitbox
            if (this.checkRectCollision(
                hitboxX, hitboxY, hitboxWidth, hitboxHeight,
                tilePos.x, tilePos.y, tileVisual.width, tileVisual.height
            )) {
                return tile;
            }
        }
        return null;
    }

    /**
     * Vérifie collision avec enemies
     */
    checkEnemyCollision(arrowEntity, position, visual, enemies) {
        // Calculer position du VRAI hitbox (centré dans le visual)
        const hitboxWidth = ARROW_CONSTANTS.ARROW_HITBOX_WIDTH;
        const hitboxHeight = ARROW_CONSTANTS.ARROW_HITBOX_HEIGHT;
        const hitboxX = position.x + (visual.width - hitboxWidth) / 2;
        const hitboxY = position.y + (visual.height - hitboxHeight) / 2;

        console.log('🎯 [ArrowCollisionSystem] Checking enemy collision');
        console.log('  - Enemies count:', enemies.length);
        console.log('  - Arrow hitbox:', {x: hitboxX, y: hitboxY, w: hitboxWidth, h: hitboxHeight});

        for (const enemy of enemies) {
            const enemyPos = enemy.getComponent('position');
            const enemyVisual = enemy.getComponent('visual');
            const enemyHitbox = enemy.getComponent('circle_hitbox');
            const enemyProperty = enemy.getComponent('property');

            if (!enemyPos || !enemyVisual) continue;

            // Ignorer ennemis déjà morts
            if (enemyProperty && enemyProperty.isDead) continue;

            // Utiliser circle hitbox si disponible, sinon rect
            if (enemyHitbox) {
                const center = enemyHitbox.getCircleCenter(enemyPos, enemyVisual);
                if (this.checkCircleRectCollision(
                    hitboxX, hitboxY, hitboxWidth, hitboxHeight,
                    center.x, center.y, enemyHitbox.collisionRadius
                )) {
                    console.log('🎯 [ArrowCollisionSystem] Circle-Rect collision detected');
                    console.log('  - Arrow hitbox:', {x: hitboxX, y: hitboxY, w: hitboxWidth, h: hitboxHeight});
                    console.log('  - Enemy circle:', {cx: center.x, cy: center.y, r: enemyHitbox.collisionRadius});
                    return enemy;
                }
            } else {
                // Fallback: rect collision
                if (this.checkRectCollision(
                    hitboxX, hitboxY, hitboxWidth, hitboxHeight,
                    enemyPos.x, enemyPos.y, enemyVisual.width, enemyVisual.height
                )) {
                    console.log('🎯 [ArrowCollisionSystem] Rect-Rect collision detected');
                    return enemy;
                }
            }
        }
        return null;
    }

    /**
     * Gère collision avec tile
     */
    handleTileCollision(arrowEntity, arrow, velocity, position) {
        // Reculer légèrement la flèche pour qu'elle ne rentre pas dans la tile
        // (compense le mouvement qui s'est produit entre la frame précédente et la détection)
        const backoffDistance = 25; // pixels
        position.x -= arrow.direction.x * backoffDistance;
        position.y -= arrow.direction.y * backoffDistance;

        // Stopper mouvement
        velocity.vx = 0;
        velocity.vy = 0;

        // Changer état
        arrow.state = 'impacting_tile';
        arrow.impactStartTime = performance.now();
    }

    /**
     * Gère collision avec enemy
     */
    handleEnemyCollision(arrowEntity, arrow, velocity, position, enemy) {
        console.log('🎯 [ArrowCollisionSystem] handleEnemyCollision called');
        console.log('  - Enemy UUID:', enemy.uuid);
        console.log('  - Arrow direction:', arrow.direction);

        // Reculer légèrement la flèche
        const backoffDistance = 15; // Moins que tiles car l'ennemi n'est pas solide
        position.x -= arrow.direction.x * backoffDistance;
        position.y -= arrow.direction.y * backoffDistance;

        // Sauvegarder la position d'impact (où la flèche touche l'ennemi)
        arrow.impactPosition = { x: position.x, y: position.y };

        // Stopper mouvement
        velocity.vx = 0;
        velocity.vy = 0;

        // Changer état
        arrow.state = 'impacting_enemy';
        arrow.impactStartTime = performance.now();
        arrow.impactTargetUUID = enemy.uuid;

        console.log('  - Arrow state changed to:', arrow.state);
        console.log('  - impactTargetUUID:', arrow.impactTargetUUID);
    }

    /**
     * AABB rectangle collision
     */
    checkRectCollision(x1, y1, w1, h1, x2, y2, w2, h2) {
        return x1 < x2 + w2 && x1 + w1 > x2 && y1 < y2 + h2 && y1 + h1 > y2;
    }

    /**
     * Circle-Rectangle collision
     */
    checkCircleRectCollision(rx, ry, rw, rh, cx, cy, radius) {
        // Find closest point on rectangle to circle center
        const closestX = Math.max(rx, Math.min(cx, rx + rw));
        const closestY = Math.max(ry, Math.min(cy, ry + rh));

        // Distance between closest point and circle center
        const dx = cx - closestX;
        const dy = cy - closestY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        return distance < radius;
    }
}
