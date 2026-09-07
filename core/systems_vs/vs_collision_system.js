// core/systems_vs/vs_collision_system.js - VS Mode Collision System
import { System } from '../systems/system.js';

// How hard fighters bounce off each other. 1 would be a perfectly elastic
// rebound; a little under that keeps the shove readable without launching
// anyone across the arena.
const PLAYER_BOUNCE = 0.55;

// Minimum push-apart speed, so two players walking into each other still
// separate visibly instead of grinding to a standstill.
const MIN_BOUNCE_SPEED = 160;

// How long the shove keeps control of the fighter, in ms.
//
// Without this the rebound was invisible: VSInput reassigns vx from the held
// direction key every frame, so the bounce was overwritten before it could
// move anyone. Briefly locking out horizontal input lets the knock land.
const KNOCKBACK_MS = 170;

export class VSCollision extends System {
    constructor(game) {
        super(game);

        // Runs with the rest of the physics on the fixed step, so a fighter
        // is never moved further between two collision tests on a slow frame
        // than on a fast one.
        this.fixedStep = true;
    }

    update() {
        const entities = Array.from(this.entities);

        // Process collisions for each player entity
        for (const entity of entities) {
            const networkPlayer = entity.getComponent('networkPlayer');

            // Only fighters simulated here are resolved. A networked opponent
            // is positioned by its own client; a bot is one of ours.
            if (!networkPlayer || !networkPlayer.simulated) continue;

            const position = entity.getComponent('position');
            const velocity = entity.getComponent('velocity');
            const property = entity.getComponent('property');
            const hitbox = entity.getComponent('circle_hitbox');
            const visual = entity.getComponent('visual');
            const input = entity.getComponent('input');

            if (!position || !velocity || !property || !hitbox || !visual) continue;

            // Fighters are solid to each other. Resolved BEFORE the world so
            // the tiles below get the final say: a shove that lands someone
            // inside a wall is undone in the same frame instead of the next.
            // Ordered the other way round, a dead player pinned in a corner
            // was pushed straight through the arena wall and fell out of the
            // level.
            if (property.isAlive !== false) {
                this.resolvePlayerCollisions(entity, entities, position, velocity, hitbox, visual);
            }

            let circleCenter = hitbox.getCircleCenter(position, visual);
            const circleRadius = hitbox.collisionRadius;

            // Recomputed every frame: a landing below re-sets it. Without this
            // the flag stayed true forever after the first touchdown, so the
            // player could jump in mid-air and never fell off a ledge.
            property.isOnGround = false;

            // Check collisions with tiles only
            for (const other of entities) {
                if (entity === other) continue;
                if (!other.getComponent('tile')) continue;

                const tilePos = other.getComponent('position');
                const tileVisual = other.getComponent('visual');
                const tileProperty = other.getComponent('property');

                if (!tilePos || !tileVisual || !tileProperty || !tileProperty.solid) continue;

                // Rectangle bounds
                const rect = {
                    left: tilePos.x,
                    right: tilePos.x + tileVisual.width,
                    top: tilePos.y,
                    bottom: tilePos.y + tileVisual.height,
                };

                // Find closest point on rectangle to circle
                const closestPoint = {
                    x: Math.max(rect.left, Math.min(circleCenter.x, rect.right)),
                    y: Math.max(rect.top, Math.min(circleCenter.y, rect.bottom)),
                };

                // Distance from circle center to closest point
                const dx = circleCenter.x - closestPoint.x;
                const dy = circleCenter.y - closestPoint.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                // Collision detected
                if (distance < circleRadius) {
                    if (distance === 0) continue;

                    const overlap = circleRadius - distance;
                    const normalX = dx / distance;
                    const normalY = dy / distance;

                    // Horizontal collision
                    if (Math.abs(normalX) > 0.7) {
                        velocity.vx = 0;
                        position.x += normalX * overlap;
                    }

                    // Vertical collision
                    if (Math.abs(normalY) > 0.7) {
                        if (normalY < 0) {
                            // Landing on ground
                            property.isOnGround = true;
                            property.airJumpsUsed = 0; // Refills the double jump
                            if (input) input.jump = 0;
                        }
                        velocity.vy = 0;
                        position.y += normalY * overlap;
                    }

                    // The centre moved: later tiles in this same frame must be
                    // tested against where the body actually is now, otherwise
                    // a correction in a corner is computed from a stale
                    // position and can push the body out the other side.
                    circleCenter = hitbox.getCircleCenter(position, visual);
                }
            }
        }
    }

    /**
     * Keeps two fighters from standing inside one another, and bounces them
     * apart on contact.
     *
     * Only fighters simulated here are moved. Online, each client runs this
     * for its own character, so a collision separates both of them
     * symmetrically without anyone being authoritative over someone else's
     * position. Against a bot, both sides are simulated locally and the same
     * pass runs twice - once per fighter - which reproduces exactly the same
     * separation as the networked case.
     */
    resolvePlayerCollisions(entity, entities, position, velocity, hitbox, visual) {
        const myCenter = hitbox.getCircleCenter(position, visual);
        const myRadius = hitbox.collisionRadius;

        for (const other of entities) {
            if (other === entity) continue;

            const otherNetwork = other.getComponent('networkPlayer');
            if (!otherNetwork) continue;

            const otherProperty = other.getComponent('property');
            if (otherProperty && otherProperty.isAlive === false) continue;

            const otherPos = other.getComponent('position');
            const otherVisual = other.getComponent('visual');
            const otherHitbox = other.getComponent('circle_hitbox');
            if (!otherPos || !otherVisual || !otherHitbox) continue;

            const theirCenter = otherHitbox.getCircleCenter(otherPos, otherVisual);
            const minDistance = myRadius + otherHitbox.collisionRadius;

            let dx = myCenter.x - theirCenter.x;
            let dy = myCenter.y - theirCenter.y;
            let distance = Math.sqrt(dx * dx + dy * dy);

            if (distance >= minDistance) continue;

            // Exactly overlapping centres give no direction to push along:
            // pick one so the pair still separates.
            if (distance === 0) {
                dx = 1;
                dy = 0;
                distance = 1;
            }

            const normalX = dx / distance;
            const normalY = dy / distance;
            const overlap = minDistance - distance;

            // Separate first, so the bounce starts from a clean position
            position.x += normalX * overlap;
            position.y += normalY * overlap;

            // Then push away along the contact normal. Only speed heading
            // into the other player is reversed; movement already going away
            // is left alone so you can still walk out of a scrum.
            const closingSpeed = velocity.vx * normalX - velocity.vy * normalY;
            if (closingSpeed < 0) {
                const bounce = Math.max(-closingSpeed * PLAYER_BOUNCE, MIN_BOUNCE_SPEED);
                velocity.vx += normalX * bounce;
                velocity.vy -= normalY * bounce;

                // Armed once per collision, never extended. Refreshing it on
                // every step meant two fighters leaning on each other kept
                // renewing the lockout indefinitely, so neither ever got their
                // footing back until the contact broke - which needed the
                // footing they no longer had.
                const property = entity.getComponent('property');
                const now = performance.now();
                if (property && !(property.knockbackUntil > now)) {
                    property.knockbackUntil = now + KNOCKBACK_MS;
                }
            }
        }
    }
}
