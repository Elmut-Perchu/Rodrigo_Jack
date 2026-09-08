// core/systems/collision_system.js
import { System } from './system.js';
import { dlog } from '../debug_log.js';

/**
 * Resolves overlaps: bodies against the scenery, and bodies against each other.
 *
 * The scenery is the expensive half. Every moving body used to walk the entire
 * entity list twice - once looking for tiles and once for everything else -
 * asking each entity whether it was a tile. On a map with 280 of them that is
 * some six thousand component lookups a frame to find the two or three tiles
 * anywhere near the player's feet.
 *
 * The list is now partitioned once per frame and every candidate tile gets a
 * four-comparison box test before anything is measured properly. The box test
 * is exactly equivalent to the full one - a tile whose box is further away
 * than the radius cannot possibly overlap the circle - so nothing about the
 * result changes, only the work done to reach it.
 */
export class Collision extends System {
    update() {
        const entities = Array.from(this.entities);

        // Réinitialiser l'état de collision pour toutes les entités
        entities.forEach((entity) => {
            const property = entity.getComponent('property');
            if (property) {
                property.isCollided = false;
            }
        });

        // Partitioned once, then reused by every body below.
        const solidTiles = [];
        const circleActors = [];
        let player = null;

        for (const entity of entities) {
            if (entity.getComponent('tile')) {
                const property = entity.getComponent('property');
                if (property && property.solid) solidTiles.push(entity);
                continue;
            }
            if (entity.getComponent('circle_hitbox')) circleActors.push(entity);
            if (!player && entity.getComponent('input')) player = entity;
        }

        // Traiter les collisions pour chaque entité
        for (const entity of entities) {
            const position = entity.getComponent('position');
            const visual = entity.getComponent('visual');
            const velocity = entity.getComponent('velocity');
            const property = entity.getComponent('property');
            const hitbox = entity.getComponent('circle_hitbox');
            const input = entity.getComponent('input');

            if (!position || !visual || !velocity) continue;

            // CRITICAL FIX: Skip remote players in VS mode
            // Remote players are controlled by NetworkSyncSystem interpolation
            // Collision resolution would interfere with smooth interpolation
            const networkPlayer = entity.getComponent('networkPlayer');
            if (networkPlayer && !networkPlayer.isLocal) {
                continue; // Remote player - no local collision resolution
            }

            // Traiter différemment les entités avec et sans hitbox circulaire
            if (hitbox) {
                this.handleCircleCollisions(entity, solidTiles, circleActors);
            } else {
                this.handleRectangleCollisions(entity, player);
            }
        }
    }

    handleCircleCollisions(entity, solidTiles, circleActors) {
        const position = entity.getComponent('position');
        const visual = entity.getComponent('visual');
        const velocity = entity.getComponent('velocity');
        const property = entity.getComponent('property');
        const hitbox = entity.getComponent('circle_hitbox');
        const input = entity.getComponent('input');
        const networkPlayer = entity.getComponent('networkPlayer');

        const circleCenter = hitbox.getCircleCenter(position, visual);
        const circleRadius = hitbox.collisionRadius;

        // 1. Collisions avec les tiles
        //
        // The reach of the circle, as a box. Anything outside it is rejected
        // in four comparisons, without allocating or taking a square root.
        const reachLeft = circleCenter.x - circleRadius;
        const reachRight = circleCenter.x + circleRadius;
        const reachTop = circleCenter.y - circleRadius;
        const reachBottom = circleCenter.y + circleRadius;

        for (const other of solidTiles) {
            const tilePos = other.getComponent('position');
            const tileVisual = other.getComponent('visual');

            if (!tilePos || !tileVisual) continue;

            const left = tilePos.x;
            const right = tilePos.x + tileVisual.width;
            const top = tilePos.y;
            const bottom = tilePos.y + tileVisual.height;

            if (right < reachLeft || left > reachRight) continue;
            if (bottom < reachTop || top > reachBottom) continue;

            const closestX = Math.max(left, Math.min(circleCenter.x, right));
            const closestY = Math.max(top, Math.min(circleCenter.y, bottom));

            const dx = circleCenter.x - closestX;
            const dy = circleCenter.y - closestY;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < circleRadius) {
                if (distance === 0) continue;

                const overlap = circleRadius - distance;
                const normalX = dx / distance;
                const normalY = dy / distance;

                // 🔴 DEBUG: Log collision corrections for local player
                if (networkPlayer && networkPlayer.isLocal) {
                    dlog(`🔵 [COLLISION] Hit tile at (${tilePos.x}, ${tilePos.y}), overlap=${overlap.toFixed(1)}, normal=(${normalX.toFixed(2)}, ${normalY.toFixed(2)})`);
                }

                if (Math.abs(normalX) > 0.7) {
                    if (networkPlayer && networkPlayer.isLocal) {
                        dlog(`🔵 [COLLISION] Blocking X: vx=${velocity.vx} → 0, pos.x += ${(normalX * overlap).toFixed(2)}`);
                    }
                    velocity.vx = 0;
                    position.x = position.x + normalX * overlap;
                }

                if (Math.abs(normalY) > 0.7) {
                    if (normalY < 0) {
                        property.isOnGround = true;
                        if (input) input.jump = 0;
                    }
                    if (networkPlayer && networkPlayer.isLocal) {
                        dlog(`🔵 [COLLISION] Blocking Y: vy=${velocity.vy} → 0, pos.y += ${(normalY * overlap).toFixed(2)}`);
                    }
                    velocity.vy = 0;
                    position.y = position.y + normalY * overlap;
                }

                // The div is deliberately not written here. Render runs three
                // systems later in the same frame and paints whatever the
                // position ended up being - writing it now only means writing
                // it twice, and a second write is a second layout.
            }
        }

        // 2. Collisions avec les autres entités circulaires
        for (const other of circleActors) {
            if (entity === other) continue;

            // CRITICAL FIX: In VS mode, skip player-to-player collisions
            // Remote players are controlled by server, collision would cause "prison" effect
            const otherNetworkPlayer = other.getComponent('networkPlayer');
            if (networkPlayer && otherNetworkPlayer) {
                // Both are network players - skip collision between them in VS mode
                continue;
            }

            const posB = other.getComponent('position');
            const visualB = other.getComponent('visual');
            const hitboxB = other.getComponent('circle_hitbox');
            const propertyB = other.getComponent('property');

            if (!hitboxB) continue;

            const centerB = hitboxB.getCircleCenter(posB, visualB);
            const dx = centerB.x - circleCenter.x;
            const dy = centerB.y - circleCenter.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            const minDistance = circleRadius + hitboxB.collisionRadius;
            if (distance < minDistance && distance > 0) {
                const overlap = minDistance - distance;
                const normalX = dx / distance;
                const normalY = dy / distance;

                const moveRatio = propertyB?.movable ? 0.5 : 1;

                position.x -= normalX * overlap * moveRatio;
                position.y -= normalY * overlap * moveRatio;

                if (propertyB?.movable) {
                    posB.x += normalX * overlap * moveRatio;
                    posB.y += normalY * overlap * moveRatio;
                }

                // Both divs are left to Render, as above.

                property.isCollided = true;
                propertyB.isCollided = true;
            }
        }
    }

    handleRectangleCollisions(entity, player) {
        if (!player) return;

        const position = entity.getComponent('position');
        const visual = entity.getComponent('visual');
        const property = entity.getComponent('property');

        const playerPos = player.getComponent('position');
        const playerVisual = player.getComponent('visual');

        if (this.checkRectCollision(position.x, position.y, visual.width, visual.height,
            playerPos.x, playerPos.y, playerVisual.width, playerVisual.height)) {
            property.isCollided = true;
        }
    }

    checkRectCollision(x1, y1, w1, h1, x2, y2, w2, h2) {
        return x1 < x2 + w2 && x1 + w1 > x2 && y1 < y2 + h2 && y1 + h1 > y2;
    }
}