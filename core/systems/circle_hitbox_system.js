// core/systems/circle_hitbox_system.js
import { System } from './system.js';
import { DEBUG_VERBOSE } from '../debug_log.js';

/**
 * Round hitboxes: who is touching whom, and who is within reach of a swing.
 *
 * Only a handful of things in a level carry one - the player, the enemies, the
 * collectibles. The scenery does not. That matters, because the check is
 * pairwise: run over every entity, and a map with 280 tiles turns ten fighters
 * into ten *thousand* pair tests a frame, of which all but a hundred are a
 * wall being compared with another wall. The list of entities that actually
 * carry a hitbox is gathered once per frame instead, which is what the loop
 * always meant.
 *
 * The debug circles are drawn only when tracing is on (localStorage rjDebug,
 * the same switch as core/debug_log.js). They are painted transparent, so on
 * an ordinary run they were three invisible divs per fighter, created and
 * repositioned sixty times a second to show nobody anything.
 */
export class CircleHitbox extends System {
    constructor() {
        super();
        this.gameWorld = document.querySelector('.game-world');
        this.showCircles = DEBUG_VERBOSE;
    }

    update() {
        // Réinitialiser toutes les collisions au début de l'update
        this.entities.forEach(entity => {
            const property = entity.getComponent('property');
            if (property && property.collidingWith) {
                property.isCollided = false;
                property.collidingWith.clear(); // Vider la liste des collisions
            }
        });

        // Gathered once, then used for both halves of the pairwise test.
        const actors = [];
        this.entities.forEach(entity => {
            if (entity.getComponent('circle_hitbox')) actors.push(entity);
        });

        actors.forEach(entity => {
            const hitbox = entity.getComponent('circle_hitbox');
            const position = entity.getComponent('position');
            const visual = entity.getComponent('visual');
            const property = entity.getComponent('property');

            if (!position || !visual || !property) return;

            const center = hitbox.getCircleCenter(position, visual);

            if (this.showCircles) this.drawCircles(hitbox, center);

            // Vérifier les collisions avec d'autres entités
            this.checkEntityCollisions(entity, hitbox, center, property, actors);
        });
    }

    /** Only ever called with tracing on. */
    drawCircles(hitbox, center) {
        if (!hitbox.circles.collision) {
            hitbox.initDebugCircles(this.gameWorld);
        }

        Object.values(hitbox.circles).forEach(circle => {
            if (circle) {
                circle.style.left = `${center.x}px`;
                circle.style.top = `${center.y}px`;
            }
        });
    }

    checkEntityCollisions(entity1, hitbox1, center1, property1, actors) {
        actors.forEach(entity2 => {
            if (entity1 === entity2) return;

            const hitbox2 = entity2.getComponent('circle_hitbox');
            const position2 = entity2.getComponent('position');
            const visual2 = entity2.getComponent('visual');
            const property2 = entity2.getComponent('property');

            if (!hitbox2 || !position2 || !visual2 || !property2) return;

            // Traitement spécial pour les collectibles
            if (entity2.getComponent('collectible')) {
                const center2 = hitbox2.getCircleCenter(position2, visual2);
                if (hitbox1.checkCollision(center1, center2, hitbox1.collisionRadius, hitbox2.collisionRadius)) {
                    // Marquer juste la collision sans déplacement physique
                    property1.isCollided = true;
                    property2.isCollided = true;
                    property1.collidingWith.add(entity2);
                    property2.collidingWith.add(entity1);
                }
                return; // Passer à l'entité suivante
            }

            const center2 = hitbox2.getCircleCenter(position2, visual2);

            // Vérifier la collision physique
            if (hitbox1.checkCollision(center1, center2, hitbox1.collisionRadius, hitbox2.collisionRadius)) {
                // Marquer la collision dans les deux sens
                property1.isCollided = true;
                property2.isCollided = true;
                property1.collidingWith.add(entity2);
                property2.collidingWith.add(entity1);
            }

            // Si c'est le joueur, vérifier les zones d'attaque
            const input = entity1.getComponent('input');
            if (input) {
                if ((input.attack1 || input.attack2 || input.attack3) &&
                    hitbox1.checkCollision(center1, center2, hitbox1.meleeRadius, hitbox2.collisionRadius)) {
                    property2.collidingWith.add(entity1);
                }

                if ((input.magicAttack || input.arrowShoot) &&
                    hitbox1.checkCollision(center1, center2, hitbox1.rangedRadius, hitbox2.collisionRadius)) {
                    property2.collidingWith.add(entity1);
                }
            }
        });
    }
}

