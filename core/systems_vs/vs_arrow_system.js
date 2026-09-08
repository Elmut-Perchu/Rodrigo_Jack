// core/systems_vs/vs_arrow_system.js - VS Mode arrow lifecycle
import { System } from '../systems/system.js';
import { ARROW_CONSTANTS } from '../../constants/arrow_constants.js';
import { VS_BOW } from '../../constants/vs_bow_constants.js';

// How far past the wall face a planted arrow is pulled back, so its shaft
// stays reachable instead of flush with (or inside) the tile.
const ARROW_CLEARANCE = 10;

// Inset from the 110px player frame down to roughly the character's body.
const PLAYER_BOX_INSET = 28;

// Slack around the arrow's thin shaft when testing for pickup contact.
const PICKUP_GRACE = 22;

// How long before a claim the referee ignored is worth sending again. Long
// enough not to spam it every frame, short enough that an arrow refused once
// (see VictimClaimDelay) becomes collectable again by simply standing there.
const CLAIM_RETRY_MS = 1000;

// How far in front of a fighter the sword can swat an arrow out of the air,
// measured from the body centre to the arrow's shaft. Roughly the melee reach:
// the skill in a deflection is the timing of the swing, not the spacing, and
// VSBow keeps the blade live for 200ms to make that timing fair.
const DEFLECT_RANGE = 112;

// Sprite is 110x110 with the collision circle at (x+55, y+79).
const BODY_OFFSET_X = 55;
const BODY_OFFSET_Y = 79;

// Downward pull on an arrow that has been knocked out of its flight, matching
// the fighters' own gravity so everything in the arena falls at one rate.
const ARROW_GRAVITY = 1500;

/**
 * Flight, impact and recovery of arrows in the arena.
 *
 * Every client simulates every arrow: they travel in a straight line at a
 * constant speed, so the simulation is deterministic and nothing has to be
 * streamed frame by frame. Outcomes, though, are decided by one machine only:
 *
 *   - The SHOOTER decides what its own arrow hits (wall or player) and tells
 *     the server, which relays the resting place. Letting each client decide
 *     independently would leave arrows planted in different spots.
 *   - The SERVER arbitrates pickups, so two players walking over the same
 *     arrow cannot both pocket it.
 */
export class VSArrow extends System {
    constructor(game) {
        super(game);
        this.game = game;
        // "playerId:arrowId" -> when the claim was sent. A claim the referee
        // refuses is answered with silence (server/combat_vs.go returns), so a
        // claim that never expires locks that fighter out of that arrow for
        // good - which is exactly what happens to the one it was just shot
        // with, refused for VictimClaimDelay and then never asked for again.
        this.pickupRequested = new Map();
        this.deflectRequested = new Set(); // Arrows already reported as swatted down
    }

    update(deltaTime) {
        const arrows = this.collectArrows();
        if (arrows.length === 0) return;

        const tiles = this.collectTiles();

        for (const entity of arrows) {
            const arrow = entity.getComponent('arrow');
            if (arrow.state === 'flying') {
                this.advance(entity, arrow, tiles, deltaTime);
            } else if (arrow.state === 'falling') {
                this.fall(entity, arrow, tiles, deltaTime);
            }
        }

        this.deflectSweep(arrows);
        this.tryPickup(arrows);
    }

    collectArrows() {
        const out = [];
        this.entities.forEach(e => {
            if (e.getComponent('arrow')) out.push(e);
        });
        return out;
    }

    collectTiles() {
        const out = [];
        this.entities.forEach(e => {
            const property = e.getComponent('property');
            if (e.getComponent('tile') && property && property.solid) out.push(e);
        });
        return out;
    }

    // === Flight ===

    advance(entity, arrow, tiles, deltaTime) {
        const position = entity.getComponent('position');
        const velocity = entity.getComponent('velocity');
        const visual = entity.getComponent('visual');
        if (!position || !velocity || !visual) return;

        const stepX = velocity.vx * deltaTime;
        const stepY = velocity.vy * deltaTime;
        position.x += stepX;
        position.y += stepY;

        // How long the shooter held the draw decides how far the shot carries.
        // Past that it is spent: it keeps a little of its momentum and arcs
        // down, landing as a recoverable arrow like any other.
        arrow.travelled += Math.hypot(stepX, stepY);
        if (arrow.travelled >= arrow.maxRange) {
            arrow.state = 'falling';
            velocity.vx *= VS_BOW.SPENT_DRAG;
            velocity.vy = 0;
            return;
        }

        const box = this.hitbox(position, visual);

        // Left the arena entirely: drop it, it is unreachable anyway.
        if (box.x < -200 || box.x > 1736 || box.y < -200 || box.y > 1096) {
            this.game.destroyArrow(arrow.arrowId);
            return;
        }

        // A freshly fired arrow briefly ignores collisions so it does not
        // stick to the shooter's own feet.
        if (performance.now() - arrow.spawnTime < arrow.collisionDelay) return;

        // Only the shooter rules on impacts (see class comment). Against a
        // bot the shooter may be the bot itself, which is simulated here.
        if (!this.game.simulatesFighter(arrow.ownerPlayerId)) return;

        const victim = this.findPlayerHit(box, arrow.ownerPlayerId);
        if (victim) {
            this.game.sendFrom(arrow.ownerPlayerId, 'arrow_hit', {
                arrowId: arrow.arrowId,
                victimId: victim.playerId,
                x: position.x,
                y: position.y
            });
            // It struck home; it does not disappear. Arrows are conserved -
            // this one drops at the victim's feet and can be collected, by
            // them or by anyone else who gets there first.
            this.game.dropArrowEntity(arrow.arrowId);
            return;
        }

        if (this.hitsTile(box, tiles)) {
            this.backOutOfWall(arrow, position, visual, tiles);
            this.plant(entity, arrow, position);
        }
    }

    /**
     * Rewinds the arrow along its flight path until its hitbox no longer
     * overlaps any wall, plus a little clearance.
     *
     * A fixed step-back was not enough: an arrow fired point blank at a wall
     * buried its whole sprite inside the tile, and since pickup is a proximity
     * test the player could never reach far enough in to collect it. Stepping
     * back until actually clear leaves the shaft sticking out, reachable.
     */
    backOutOfWall(arrow, position, visual, tiles) {
        const step = 4;
        let guard = 0;

        while (guard++ < 60 && this.hitsTile(this.hitbox(position, visual), tiles)) {
            position.x -= arrow.direction.x * step;
            position.y -= arrow.direction.y * step;
        }

        // Extra clearance so the arrow is visibly planted, not flush
        position.x -= arrow.direction.x * ARROW_CLEARANCE;
        position.y -= arrow.direction.y * ARROW_CLEARANCE;
    }

    plant(entity, arrow, position) {
        const velocity = entity.getComponent('velocity');
        if (velocity) { velocity.vx = 0; velocity.vy = 0; }

        arrow.state = 'stuck';
        arrow.isRecoverable = true;

        // Where it came to rest is the owner's call to report.
        if (!this.game.simulatesFighter(arrow.ownerPlayerId)) return;

        this.game.sendFrom(arrow.ownerPlayerId, 'arrow_stuck', {
            arrowId: arrow.arrowId,
            x: position.x,
            y: position.y
        });
    }

    // === Deflection ===

    /**
     * Sword meets arrow: knocks any shaft in front of the blade out of the air.
     *
     * Only reported, never applied directly - the referee confirms it and
     * hands the arrow to the deflector, who then owns where it comes to rest.
     * That mirrors how a shot arrow belongs to its shooter, and keeps every
     * client agreeing on one resting place instead of each simulating its own.
     */
    deflectSweep(arrows) {
        const now = performance.now();

        this.game.fighterEntities().forEach((fighter, playerId) => {
            const networkPlayer = fighter.getComponent('networkPlayer');
            // Only report for fighters we run: online, the swinger's own
            // client is the one that owns the claim.
            if (!networkPlayer || !networkPlayer.simulated) return;

            if (!fighter._bladeActiveUntil || now > fighter._bladeActiveUntil) return;

            const property = fighter.getComponent('property');
            if (property && property.isAlive === false) return;

            const position = fighter.getComponent('position');
            if (!position) return;

            this.deflectAround(playerId, position, fighter._bladeFacingRight, arrows);
        });
    }

    deflectAround(attackerId, playerPos, facingRight, arrows) {
        const originX = playerPos.x + BODY_OFFSET_X;
        const originY = playerPos.y + BODY_OFFSET_Y;

        for (const entity of arrows) {
            const arrow = entity.getComponent('arrow');
            if (!arrow || arrow.state !== 'flying') continue;

            // Your own arrow, still leaving the bow, is not swatted down by
            // the same swing that would have fired it.
            if (arrow.ownerPlayerId === attackerId) continue;
            if (this.deflectRequested.has(arrow.arrowId)) continue;

            const position = entity.getComponent('position');
            const visual = entity.getComponent('visual');
            if (!position || !visual) continue;

            const box = this.hitbox(position, visual);
            const dx = box.x + box.w / 2 - originX;
            const dy = box.y + box.h / 2 - originY;

            // Must be on the side the blade is sweeping
            if (facingRight ? dx < -20 : dx > 20) continue;
            if (Math.hypot(dx, dy) > DEFLECT_RANGE) continue;

            this.deflectRequested.add(arrow.arrowId);
            this.game.sendFrom(attackerId, 'arrow_deflect', {
                arrowId: arrow.arrowId,
                x: position.x,
                y: position.y
            });
        }
    }

    /**
     * A deflected arrow drops out of the sky.
     *
     * It carries no damage on the way down - it has been dealt with - and
     * plants itself where it lands, ready to be picked up like any other.
     */
    fall(entity, arrow, tiles, deltaTime) {
        const position = entity.getComponent('position');
        const velocity = entity.getComponent('velocity');
        const visual = entity.getComponent('visual');
        if (!position || !velocity || !visual) return;

        velocity.vy += ARROW_GRAVITY * deltaTime;
        position.x += velocity.vx * deltaTime;
        position.y += velocity.vy * deltaTime;

        const box = this.hitbox(position, visual);
        if (box.y > 1096 || box.x < -200 || box.x > 1736) {
            this.game.destroyArrow(arrow.arrowId);
            return;
        }

        if (this.hitsTile(box, tiles)) {
            // Back out upwards: it came down, so that is the way out.
            let guard = 0;
            while (guard++ < 60 && this.hitsTile(this.hitbox(position, visual), tiles)) {
                position.y -= 4;
            }
            position.y -= ARROW_CLEARANCE;
            this.plant(entity, arrow, position);
        }
    }

    /** The arrow's real hitbox: a thin sliver centred in a much larger sprite. */
    hitbox(position, visual) {
        const w = ARROW_CONSTANTS.ARROW_HITBOX_WIDTH;
        const h = ARROW_CONSTANTS.ARROW_HITBOX_HEIGHT;
        return {
            x: position.x + (visual.width - w) / 2,
            y: position.y + (visual.height - h) / 2,
            w,
            h
        };
    }

    hitsTile(box, tiles) {
        for (const tile of tiles) {
            const p = tile.getComponent('position');
            const v = tile.getComponent('visual');
            if (!p || !v) continue;
            if (this.overlaps(box, p.x, p.y, v.width, v.height)) return tile;
        }
        return null;
    }

    /** Returns the networkPlayer component of a player the arrow just struck. */
    findPlayerHit(box, ownerId) {
        let hit = null;

        this.entities.forEach(e => {
            if (hit) return;

            const np = e.getComponent('networkPlayer');
            if (!np || np.playerId === ownerId) return;

            // An arrow passes through an ally: the server would refuse the
            // claim anyway, and stopping it here keeps the shot honest.
            if (this.game.areAllies(ownerId, np.playerId)) return;

            const property = e.getComponent('property');
            if (property && property.isAlive === false) return;

            const p = e.getComponent('position');
            const v = e.getComponent('visual');
            const circle = e.getComponent('circle_hitbox');
            if (!p || !v) return;

            if (circle) {
                const c = circle.getCircleCenter(p, v);
                if (this.overlapsCircle(box, c.x, c.y, circle.collisionRadius)) hit = np;
            } else if (this.overlaps(box, p.x, p.y, v.width, v.height)) {
                hit = np;
            }
        });

        return hit;
    }

    overlaps(box, x, y, w, h) {
        return box.x < x + w && box.x + box.w > x && box.y < y + h && box.y + box.h > y;
    }

    overlapsCircle(box, cx, cy, radius) {
        const closestX = Math.max(box.x, Math.min(cx, box.x + box.w));
        const closestY = Math.max(box.y, Math.min(cy, box.y + box.h));
        const dx = cx - closestX;
        const dy = cy - closestY;
        return Math.sqrt(dx * dx + dy * dy) < radius;
    }

    // === Recovery ===

    /**
     * Walk over a planted arrow to collect it. The request goes to the server
     * and the quiver only moves once it answers with arrow_picked, so a
     * contested arrow is never counted twice.
     */
    tryPickup(arrows) {
        this.game.fighterEntities().forEach((entity, playerId) => {
            const networkPlayer = entity.getComponent('networkPlayer');
            if (!networkPlayer || !networkPlayer.simulated) return;
            this.tryPickupFor(entity, playerId, arrows);
        });
    }

    tryPickupFor(fighter, playerId, arrows) {
        const bowState = fighter.getComponent('bow_state');
        const playerPos = fighter.getComponent('position');
        const playerVisual = fighter.getComponent('visual');
        const property = fighter.getComponent('property');
        if (!bowState || !playerPos || !playerVisual) return;
        if (property && property.isAlive === false) return;
        if (bowState.currentArrows >= bowState.maxArrows) return;

        // Body, trimmed to roughly the character inside its 110px frame
        const body = {
            x: playerPos.x + PLAYER_BOX_INSET,
            y: playerPos.y + PLAYER_BOX_INSET,
            w: playerVisual.width - PLAYER_BOX_INSET * 2,
            h: playerVisual.height - PLAYER_BOX_INSET * 2
        };

        for (const entity of arrows) {
            const arrow = entity.getComponent('arrow');
            if (arrow.state !== 'stuck' || !arrow.isRecoverable) continue;

            // Keyed per fighter: two of them may reach for the same arrow,
            // and the referee is what decides who actually gets it.
            const claim = `${playerId}:${arrow.arrowId}`;
            const claimedAt = this.pickupRequested.get(claim);
            if (claimedAt !== undefined && performance.now() - claimedAt < CLAIM_RETRY_MS) continue;

            const pos = entity.getComponent('position');
            const vis = entity.getComponent('visual');
            if (!pos || !vis) continue;

            // Touching the arrow is enough. A centre-to-centre radius test was
            // used before, but both sprites are far larger than their real
            // hitboxes, so an arrow planted in a wall sat permanently out of
            // reach even with the player pressed against it.
            const shaft = this.hitbox(pos, vis);
            const reach = {
                x: shaft.x - PICKUP_GRACE,
                y: shaft.y - PICKUP_GRACE,
                w: shaft.w + PICKUP_GRACE * 2,
                h: shaft.h + PICKUP_GRACE * 2
            };

            if (this.overlaps(body, reach.x, reach.y, reach.w, reach.h)) {
                this.pickupRequested.set(claim, performance.now());
                this.game.sendFrom(playerId, 'arrow_pickup', { arrowId: arrow.arrowId });
            }
        }
    }

    /** Lets the game drop bookkeeping for an arrow that no longer exists. */
    forgetArrow(arrowId) {
        [...this.pickupRequested.keys()].forEach(claim => {
            if (claim.endsWith(`:${arrowId}`)) this.pickupRequested.delete(claim);
        });
        this.deflectRequested.delete(arrowId);
    }
}
