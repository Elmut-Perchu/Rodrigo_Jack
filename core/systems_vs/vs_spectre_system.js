// core/systems_vs/vs_spectre_system.js - The spirit gauge, and what it summons
import { System } from '../systems/system.js';
import { VS_SPECTRE } from '../../constants/vs_spectre_constants.js';

// Sprite is 110x110 with the body centred at (x+55, y+79); the spectre's own
// frame is square, so its centre is simply half its size.
const BODY_OFFSET_X = 55;
const BODY_OFFSET_Y = 79;

/**
 * Channelling, and the wraith it pays for.
 *
 * Two halves of one mechanic, kept together because neither makes sense alone:
 *
 *   Holding C plays the casting animation and fills a gauge. It is slow, and
 *   it slows the caster down, so it has to be bought with a moment of safety.
 *
 *   A full gauge can be spent - one more press of C - to send a spectre after
 *   the nearest opponent. It steers after them on its own; there is nothing to
 *   aim.
 *
 * Like arrows, spectres are simulated by every client from the same spawn
 * message and home on the same quarry, so nothing has to be streamed frame by
 * frame. And like arrows, only the caster's client rules on whether one
 * connected - it then reports an ordinary magic attack, which means the damage,
 * the friendly-fire rule and the death that may follow all run through the
 * referee's existing paths rather than a second set of its own.
 */
export class VSSpectre extends System {
    constructor(game) {
        super(game);
        this.game = game;
        this.triggers = new Map(); // entity uuid -> { magic: bool }
        this.cutRequested = new Set(); // Spirits already reported as cut down
    }

    update(deltaTime) {
        const spectres = [];

        this.entities.forEach(entity => {
            if (entity.getComponent('spectre')) {
                spectres.push(entity);
                return;
            }
            if (entity.getComponent('spectre_state')) this.updateCaster(entity, deltaTime);
        });

        spectres.forEach(entity => this.advance(entity, deltaTime));

        // After they have moved, so a swing and a shot are judged against
        // where the spirit actually is this step.
        if (spectres.length) this.cutSweep(spectres);
    }

    removeEntity(entity) {
        super.removeEntity(entity);
        this.triggers.delete(entity.uuid);

        const spectre = entity.getComponent('spectre');
        if (spectre) this.cutRequested.delete(spectre.spectreId);
    }

    triggerFor(entity) {
        let trigger = this.triggers.get(entity.uuid);
        if (!trigger) {
            trigger = { magic: false };
            this.triggers.set(entity.uuid, trigger);
        }
        return trigger;
    }

    actorId(entity) {
        const networkPlayer = entity.getComponent('networkPlayer');
        return networkPlayer ? networkPlayer.playerId : this.game.localPlayerId;
    }

    // === The gauge ===

    updateCaster(entity, deltaTime) {
        const networkPlayer = entity.getComponent('networkPlayer');
        if (!networkPlayer || !networkPlayer.simulated) return;

        const input = entity.getComponent('input');
        const state = entity.getComponent('spectre_state');
        const property = entity.getComponent('property');
        if (!input || !state || !property) return;

        const trigger = this.triggerFor(entity);

        if (property.isAlive === false) {
            state.channeling = false;
            trigger.magic = false;
            return;
        }

        const pressed = !!input.magicAttack;
        const now = performance.now();

        if (pressed && !trigger.magic) {
            // A fresh press on a full gauge sends the spirit; otherwise it
            // starts filling one. Requiring the press to be fresh is what
            // stops a gauge that fills while C is held from firing the instant
            // it tops up, with no say from the player.
            if (state.ready && now - state.lastCastAt >= VS_SPECTRE.COOLDOWN) {
                state.channeling = false;
                this.summon(entity, state);
            } else {
                state.channeling = true;
            }
        } else if (!pressed) {
            state.channeling = false;
        }

        trigger.magic = pressed;

        if (state.channeling) {
            if (state.ready) {
                state.channeling = false;
            } else {
                state.charge = Math.min(1, state.charge + (deltaTime * 1000) / VS_SPECTRE.CHANNEL_TIME);

                // Bought with footspeed. Written as a ceiling rather than a
                // multiplier: physics runs several steps per frame, and a
                // factor reapplied on each of them compounds - it dragged the
                // caster down to a tenth of walking pace instead of a half.
                // A cap gives the same answer however many times it is applied.
                const velocity = entity.getComponent('velocity');
                if (velocity) {
                    const cap = property.speed * VS_SPECTRE.CHANNEL_SLOWDOWN;
                    if (Math.abs(velocity.vx) > cap) {
                        velocity.vx = Math.sign(velocity.vx) * cap;
                    }
                }
            }
        }

        // Repaint the gauge only when it actually moved: this runs on every
        // frame for every fighter, and a DOM write per frame for a bar that
        // changes by a fraction of a percent is pure waste.
        if (entity === this.game.localPlayer) {
            const shown = Math.round(state.charge * 100);
            if (shown !== this._shownCharge) {
                this._shownCharge = shown;
                this.game.refreshSpectreHud?.();
            }
        }
    }

    summon(entity, state) {
        const ownerId = this.actorId(entity);
        const position = entity.getComponent('position');
        const animation = entity.getComponent('animation');
        if (!position) return;

        const target = this.pickTarget(ownerId, position);
        if (!target) return; // Nobody to send it after: the gauge is kept

        if (!state.spend()) return;

        const facingRight = animation ? !animation.isFlipped : true;
        const dirX = target.dx >= 0 ? 1 : (target.dx < 0 ? -1 : (facingRight ? 1 : -1));

        const spawnX = position.x + BODY_OFFSET_X + dirX * VS_SPECTRE.SPAWN_OFFSET_X
            - VS_SPECTRE.DISPLAY_SIZE / 2;
        const spawnY = position.y + BODY_OFFSET_Y - VS_SPECTRE.DISPLAY_SIZE / 2;

        const spectreId = `${ownerId || 'local'}_sp_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e4)}`;

        // Locally first so it feels immediate, then tell everyone else.
        this.game.spawnSpectreEntity({
            spectreId,
            ownerId,
            targetId: target.playerId,
            x: spawnX,
            y: spawnY,
            dirX
        });

        this.game.sendFrom(ownerId, 'spectre_spawn', {
            spectreId,
            targetId: target.playerId,
            x: spawnX,
            y: spawnY,
            dirX
        });

        this.game.audio?.playCast?.();
    }

    /** The closest living opponent. Allies are never quarry. */
    pickTarget(ownerId, position) {
        let best = null;

        this.game.fighterEntities().forEach((entity, playerId) => {
            if (playerId === ownerId) return;
            if (this.game.areAllies(ownerId, playerId)) return;

            const property = entity.getComponent('property');
            if (property && property.isAlive === false) return;

            const pos = entity.getComponent('position');
            if (!pos) return;

            const dx = pos.x - position.x;
            const dy = pos.y - position.y;
            const distance = Math.hypot(dx, dy);

            if (!best || distance < best.distance) {
                best = { playerId, entity, distance, dx, dy };
            }
        });

        return best;
    }

    // === Flight ===

    advance(entity, deltaTime) {
        const spectre = entity.getComponent('spectre');
        const position = entity.getComponent('position');
        const velocity = entity.getComponent('velocity');
        if (!spectre || !position || !velocity) return;

        if (performance.now() - spectre.bornAt > VS_SPECTRE.LIFETIME) {
            this.expire(spectre, position);
            return;
        }

        this.steer(spectre, position, velocity, deltaTime);

        position.x += velocity.vx * deltaTime;
        position.y += velocity.vy * deltaTime;

        // Well outside the arena: it has lost its quarry for good.
        if (position.x < -400 || position.x > 1936 || position.y < -400 || position.y > 1296) {
            this.expire(spectre, position);
            return;
        }

        // Only the caster rules on contact, for the same reason only the
        // shooter rules on an arrow: one machine has to decide, or the clients
        // disagree about who was hit.
        if (!this.game.simulatesFighter(spectre.ownerId)) return;
        this.checkContact(entity, spectre, position);
    }

    /**
     * Turns the spectre toward its quarry at a limited rate.
     *
     * Steering rather than snapping is what makes it dodgeable: it overshoots
     * a fighter who breaks sideways at the last moment and has to swing back
     * round, which is the whole counterplay to a weapon that never misses by
     * being aimed badly.
     */
    steer(spectre, position, velocity, deltaTime) {
        const target = this.game.entityForPlayer(spectre.targetId);
        const targetPos = target ? target.getComponent('position') : null;
        const targetProperty = target ? target.getComponent('property') : null;

        // Quarry gone or down: the spirit drifts on and dissolves.
        if (!targetPos || (targetProperty && targetProperty.isAlive === false)) return;

        const centreX = position.x + VS_SPECTRE.DISPLAY_SIZE / 2;
        const centreY = position.y + VS_SPECTRE.DISPLAY_SIZE / 2;

        const wantedAngle = Math.atan2(
            targetPos.y + BODY_OFFSET_Y - centreY,
            targetPos.x + BODY_OFFSET_X - centreX
        );

        const currentAngle = Math.atan2(velocity.vy, velocity.vx);
        let delta = wantedAngle - currentAngle;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;

        const maxTurn = VS_SPECTRE.TURN_RATE * deltaTime;
        const angle = currentAngle + Math.max(-maxTurn, Math.min(maxTurn, delta));

        velocity.vx = Math.cos(angle) * VS_SPECTRE.SPEED;
        velocity.vy = Math.sin(angle) * VS_SPECTRE.SPEED;
    }

    checkContact(entity, spectre, position) {
        const centreX = position.x + VS_SPECTRE.DISPLAY_SIZE / 2;
        const centreY = position.y + VS_SPECTRE.DISPLAY_SIZE / 2;

        let struck = null;

        this.game.fighterEntities().forEach((fighter, playerId) => {
            if (struck) return;
            if (playerId === spectre.ownerId) return;
            if (this.game.areAllies(spectre.ownerId, playerId)) return;

            const property = fighter.getComponent('property');
            if (property && property.isAlive === false) return;

            const pos = fighter.getComponent('position');
            if (!pos) return;

            const distance = Math.hypot(
                pos.x + BODY_OFFSET_X - centreX,
                pos.y + BODY_OFFSET_Y - centreY
            );
            if (distance <= VS_SPECTRE.HIT_RADIUS) struck = { playerId, fighter };
        });

        if (!struck) return;

        // Reported as an ordinary magic blow, in the frame the referee works
        // in: it compares this point against fighters' sprite origins, so the
        // spectre's body centre is shifted back by the same offsets.
        this.game.sendFrom(spectre.ownerId, 'player_attack', {
            attackType: 'magic',
            x: centreX - BODY_OFFSET_X,
            y: centreY - BODY_OFFSET_Y,
            direction: 'right',
            facingRight: true
        });

        this.finish(spectre, position);
    }

    // === Cutting one down ===

    /**
     * Steel and arrows against a spirit.
     *
     * Reported, never applied here. Ending a spectre normally belongs to its
     * caster alone - and the caster is the last person who would end this one
     * - so the claim goes to the referee, which confirms it and tells
     * everybody at once. That keeps every client agreeing about what is still
     * in the air, which is the whole reason spectres are not streamed.
     *
     * Only claims for fighters simulated on this machine are sent: online,
     * the swinger's own client is the one that owns the claim, exactly as it
     * owns batting an arrow out of the air.
     */
    cutSweep(spectres) {
        this.bladeSweep(spectres);
        this.arrowSweep(spectres);
    }

    bladeSweep(spectres) {
        const now = performance.now();

        this.game.fighterEntities().forEach((fighter, playerId) => {
            const networkPlayer = fighter.getComponent('networkPlayer');
            if (!networkPlayer || !networkPlayer.simulated) return;

            if (!fighter._bladeActiveUntil || now > fighter._bladeActiveUntil) return;

            const property = fighter.getComponent('property');
            if (property && property.isAlive === false) return;

            const position = fighter.getComponent('position');
            if (!position) return;

            const originX = position.x + BODY_OFFSET_X;
            const originY = position.y + BODY_OFFSET_Y;

            for (const entity of spectres) {
                const spectre = entity.getComponent('spectre');
                if (!this.cuttable(spectre, playerId)) continue;

                const centre = this.centreOf(entity);
                if (!centre) continue;

                const dx = centre.x - originX;
                const dy = centre.y - originY;

                // Must be on the side the blade is sweeping
                if (fighter._bladeFacingRight ? dx < -20 : dx > 20) continue;
                if (Math.hypot(dx, dy) > VS_SPECTRE.BLADE_CUT_RANGE) continue;

                this.reportCut(playerId, spectre, centre, null);
            }
        });
    }

    arrowSweep(spectres) {
        this.game.arrows.forEach((entity, arrowId) => {
            const arrow = entity.getComponent('arrow');
            if (!arrow || arrow.state !== 'flying') return;

            // The shooter rules on what its own arrow hits, spirits included.
            if (!this.game.simulatesFighter(arrow.ownerPlayerId)) return;

            const position = entity.getComponent('position');
            const visual = entity.getComponent('visual');
            if (!position || !visual) return;

            // The shaft sits in the middle of a much larger sprite.
            const shaftX = position.x + visual.width / 2;
            const shaftY = position.y + visual.height / 2;

            for (const target of spectres) {
                const spectre = target.getComponent('spectre');
                if (!this.cuttable(spectre, arrow.ownerPlayerId)) continue;

                const centre = this.centreOf(target);
                if (!centre) continue;

                if (Math.hypot(centre.x - shaftX, centre.y - shaftY) > VS_SPECTRE.ARROW_CUT_RADIUS) {
                    continue;
                }

                // The arrow travels with the claim so the referee can drop it
                // where it struck: it is spent, not destroyed, like every
                // other arrow that has hit something.
                this.reportCut(arrow.ownerPlayerId, spectre, { x: position.x, y: position.y }, arrowId);
                return;
            }
        });
    }

    /** Anyone's spirit but your own side's, and only once. */
    cuttable(spectre, cutterId) {
        if (!spectre || spectre.spent) return false;
        if (this.cutRequested.has(spectre.spectreId)) return false;
        if (spectre.ownerId === cutterId) return false;
        return !this.game.areAllies(spectre.ownerId, cutterId);
    }

    reportCut(cutterId, spectre, at, arrowId) {
        this.cutRequested.add(spectre.spectreId);

        this.game.sendFrom(cutterId, 'spectre_cut', {
            spectreId: spectre.spectreId,
            arrowId: arrowId || undefined,
            x: at.x,
            y: at.y
        });
    }

    centreOf(entity) {
        const position = entity.getComponent('position');
        if (!position) return null;
        return {
            x: position.x + VS_SPECTRE.DISPLAY_SIZE / 2,
            y: position.y + VS_SPECTRE.DISPLAY_SIZE / 2
        };
    }

    expire(spectre, position) {
        if (!this.game.simulatesFighter(spectre.ownerId)) {
            // Everyone runs the same clock, so a spectre nobody owns here
            // still needs clearing away when its time is up.
            this.game.destroySpectre(spectre.spectreId);
            return;
        }
        this.finish(spectre, position);
    }

    finish(spectre, position) {
        if (spectre.spent) return;
        spectre.spent = true;

        this.game.sendFrom(spectre.ownerId, 'spectre_end', {
            spectreId: spectre.spectreId,
            x: position.x,
            y: position.y
        });
        this.game.destroySpectre(spectre.spectreId);
    }
}
