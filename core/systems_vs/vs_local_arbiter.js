// core/systems_vs/vs_local_arbiter.js - Offline referee for bot matches

/**
 * Plays the part of the Go server for a match against the computer.
 *
 * A bot match has no WebSocket, but combat rules live on the server: damage,
 * the parry window, the arrow economy, death and match end. Rather than
 * duplicating those rules inside the AI, this class re-implements the server's
 * *protocol*. It accepts exactly the messages a client would send and answers
 * with exactly the messages a client expects to receive.
 *
 * The payoff is that nothing else has to know it is offline: VSBow still
 * reports its swings, VSArrow still asks permission to pick an arrow up, the
 * HUD, the spark burst and the metallic clash all react to the same events as
 * in a networked match. Whoever changes the rules in Go has one obvious
 * counterpart to change here.
 *
 * Ported from server/game_logic.go, server/parry.go and server/combat_vs.go.
 * The constants below must stay in step with theirs.
 */

// --- server/game_logic.go ---
const MELEE_RANGE = 120.0;
const ARROW_RANGE = 400.0;
const ARROW_HIT_TOLERANCE = 160.0;

// How far the deflector may be from the arrow it claims to have swatted down.
const DEFLECT_TOLERANCE = 170.0;

// A spectre strikes as an area blow at the point of contact, exactly as the
// server treats one (server/game_logic.go isMagicHit).
const MAGIC_RADIUS = 80.0;

const MELEE_DAMAGE = 15;
const ARROW_DAMAGE = 20;
const MAGIC_DAMAGE = 25;

// --- server/parry.go ---
const PARRY_WINDOW = 220;        // ms
const CLASH_RANGE_FACTOR = 1.35;

// --- server/combat_vs.go ---
const STARTING_ARROWS = 3;
const MAX_ARROWS = 7;
const MAX_ARROWS_IN_ARENA = 64;

const SYNC_HZ = 20;

export class VSLocalArbiter {
    constructor(game) {
        this.game = game;

        this.fighters = new Map();     // playerId -> { name, entity, health, isAlive, quiver }
        this.arrows = new Map();       // arrowId -> { ownerId, x, y, dirX, stuck }
        this.pendingSwings = new Map();// attackerId -> { data, timer }

        this.active = false;
        this.matchOver = false;
        this.syncTimer = null;
    }

    // === Registration ===

    addFighter(playerId, name, entity) {
        this.fighters.set(playerId, {
            name: name || 'Fighter',
            entity,
            health: 100,
            isAlive: true,
            quiver: STARTING_ARROWS
        });
    }

    start() {
        this.active = true;
        this.matchOver = false;

        // Announce the roster, then the starting quiver, exactly as the server
        // does once every client has reported game_ready.
        this.emit('room_state', {
            players: [...this.fighters.entries()].map(([playerId, f]) => ({
                playerId,
                playerName: f.name,
                isAlive: true,
                health: f.health
            }))
        });

        this.fighters.forEach((f, playerId) => this.sendQuiver(playerId));

        this.emit('match_start', {});

        this.syncTimer = setInterval(() => this.broadcastState(), 1000 / SYNC_HZ);
    }

    stop() {
        this.active = false;
        if (this.syncTimer) clearInterval(this.syncTimer);
        this.syncTimer = null;
        this.pendingSwings.forEach(s => clearTimeout(s.timer));
        this.pendingSwings.clear();
    }

    // === Inbound: what a client would put on the wire ===

    fromClient(playerId, type, data = {}) {
        if (!this.active) return;
        const fighter = this.fighters.get(playerId);
        if (!fighter) return;

        switch (type) {
            case 'player_attack':
                this.handleAttack(playerId, data);
                break;
            case 'arrow_spawn':
                this.handleArrowSpawn(playerId, data);
                break;
            case 'arrow_stuck':
                this.handleArrowStuck(playerId, data);
                break;
            case 'arrow_pickup':
                this.handleArrowPickup(playerId, data);
                break;
            case 'arrow_hit':
                this.handleArrowHit(playerId, data);
                break;
            case 'arrow_deflect':
                this.handleArrowDeflect(playerId, data);
                break;

            // A spirit is a pure relay: the referee has no say in where it
            // goes, only in the magic blow it reports when it arrives, which
            // comes back through player_attack like any other.
            case 'spectre_spawn':
                this.handleSpectreSpawn(playerId, data);
                break;
            case 'spectre_end':
                this.emit('spectre_ended', { spectreId: data.spectreId });
                break;

            // Positions are read straight off the entities in a local match,
            // so the state stream carries no information the arbiter lacks.
            case 'player_state':
            case 'game_ready':
                break;

            default:
                break;
        }
    }

    /** Sends a server-shaped message into the game's normal handler. */
    emit(type, data) {
        this.game.handleServerMessage({ type, data, timestamp: Date.now() });
    }

    // === Positions ===

    /** Live pose of a fighter, read from its entity. */
    poseOf(playerId) {
        const fighter = this.fighters.get(playerId);
        if (!fighter || !fighter.entity) return null;

        const position = fighter.entity.getComponent('position');
        const velocity = fighter.entity.getComponent('velocity');
        const animation = fighter.entity.getComponent('animation');
        if (!position) return null;

        return {
            x: position.x,
            y: position.y,
            vx: velocity ? velocity.vx : 0,
            vy: velocity ? velocity.vy : 0,
            facingRight: animation ? !animation.isFlipped : true
        };
    }

    broadcastState() {
        if (!this.active) return;

        const players = [];
        this.fighters.forEach((f, playerId) => {
            const pose = this.poseOf(playerId) || { x: 0, y: 0, vx: 0, vy: 0, facingRight: true };
            players.push({
                playerId,
                x: pose.x,
                y: pose.y,
                vx: pose.vx,
                vy: pose.vy,
                facingRight: pose.facingRight,
                health: f.health,
                isAlive: f.isAlive
            });
        });

        this.emit('game_state_sync', { players });
    }

    // === Melee, and the parry window (server/parry.go) ===

    handleAttack(attackerId, data) {
        const fighter = this.fighters.get(attackerId);
        if (!fighter || !fighter.isAlive) return;

        const attack = {
            attackerId,
            attackType: data.attackType || 'melee',
            // Which of the three sword blows it was. Relayed untouched: the
            // referee has no opinion on it, but the clients need it to show
            // the right swing and to keep two parrying blades distinct.
            swing: data.swing,
            x: data.x ?? 0,
            y: data.y ?? 0,
            direction: data.direction,
            facingRight: data.facingRight !== false
        };

        // The swing is always shown at once; only its outcome waits.
        this.emit('player_attack', attack);

        if (attack.attackType === 'melee') {
            this.registerSwing(attackerId, attack);
            return;
        }

        this.applyAttackDamage(attackerId, attack);
    }

    /**
     * Queues a sword blow, or cancels it against an opposing blade already
     * mid-swing.
     */
    registerSwing(attackerId, attack) {
        for (const [otherId, pending] of this.pendingSwings) {
            if (otherId === attackerId) continue;
            if (!bladesMeet(attack, pending.data)) continue;

            clearTimeout(pending.timer);
            this.pendingSwings.delete(otherId);

            const midX = (attack.x + pending.data.x) / 2;
            const midY = (attack.y + pending.data.y) / 2;

            this.emit('parry', {
                x: midX,
                y: midY,
                attackerId,
                defenderId: otherId
            });
            return;
        }

        const previous = this.pendingSwings.get(attackerId);
        if (previous) clearTimeout(previous.timer);

        const timer = setTimeout(() => this.resolveSwing(attackerId), PARRY_WINDOW);
        this.pendingSwings.set(attackerId, { data: attack, timer });
    }

    resolveSwing(attackerId) {
        const pending = this.pendingSwings.get(attackerId);
        if (!pending) return; // Parried, or superseded
        this.pendingSwings.delete(attackerId);

        const fighter = this.fighters.get(attackerId);
        if (!this.active || !fighter || !fighter.isAlive) return;

        this.applyAttackDamage(attackerId, pending.data);
    }

    // === Damage ===

    applyAttackDamage(attackerId, attack) {
        this.findVictims(attackerId, attack).forEach(victimId => {
            this.applyDamage(attackerId, victimId, attack.attackType);
        });
    }

    findVictims(attackerId, attack) {
        const victims = [];

        this.fighters.forEach((f, playerId) => {
            if (playerId === attackerId || !f.isAlive) return;
            if (this.game.areAllies(attackerId, playerId)) return;

            const pose = this.poseOf(playerId);
            if (!pose) return;

            const distance = Math.hypot(attack.x - pose.x, attack.y - pose.y);

            let hit = false;
            if (attack.attackType === 'melee') {
                hit = isMeleeHit(attack, pose, distance);
            } else if (attack.attackType === 'arrow') {
                hit = isArrowHit(attack, pose, distance);
            } else if (attack.attackType === 'magic') {
                hit = distance <= MAGIC_RADIUS;
            }

            if (hit) victims.push(playerId);
        });

        return victims;
    }

    applyDamage(attackerId, victimId, attackType) {
        const victim = this.fighters.get(victimId);
        const attacker = this.fighters.get(attackerId);
        if (!victim || !attacker || !victim.isAlive) return;

        const damage = attackType === 'arrow' ? ARROW_DAMAGE
            : attackType === 'magic' ? MAGIC_DAMAGE
            : MELEE_DAMAGE;

        victim.health = Math.max(0, victim.health - damage);

        this.emit('player_hit', {
            attackerId,
            victimId,
            damage,
            health: victim.health,
            attackType
        });

        if (victim.health <= 0) this.handleDeath(victimId, attackerId);
    }

    handleDeath(victimId, killerId) {
        const victim = this.fighters.get(victimId);
        const killer = this.fighters.get(killerId);
        if (!victim || !victim.isAlive) return;

        victim.isAlive = false;

        this.emit('player_death', {
            victimId,
            killerId,
            victimName: victim.name,
            killerName: killer ? killer.name : 'Someone'
        });

        let aliveCount = 0;
        let lastAliveId = null;
        this.fighters.forEach((f, id) => {
            if (f.isAlive) { aliveCount++; lastAliveId = id; }
        });

        if (aliveCount <= 1) {
            this.matchOver = true;
            this.active = false;
            const winner = lastAliveId ? this.fighters.get(lastAliveId) : null;
            this.emit('match_end', {
                winnerId: lastAliveId,
                winnerName: winner ? winner.name : null
            });
        }
    }

    // === Arrows (server/combat_vs.go) ===

    sendQuiver(playerId) {
        const fighter = this.fighters.get(playerId);
        if (!fighter) return;

        this.emit('quiver_update', {
            playerId,
            arrows: fighter.quiver,
            max: MAX_ARROWS
        });
    }

    handleArrowSpawn(ownerId, data) {
        const fighter = this.fighters.get(ownerId);
        if (!fighter || !fighter.isAlive) return;

        const arrowId = data.arrowId;
        if (!arrowId || this.arrows.has(arrowId)) return;
        if (this.arrows.size >= MAX_ARROWS_IN_ARENA) return;

        if (fighter.quiver <= 0) {
            this.sendQuiver(ownerId); // Re-sync a client that thought it had one
            return;
        }

        fighter.quiver--;
        this.arrows.set(arrowId, {
            ownerId,
            x: data.x ?? 0,
            y: data.y ?? 0,
            dirX: data.dirX ?? 1,
            // Both components of the aim: the arena's bow shoots up, down and
            // diagonally, so a shot is a vector rather than a side.
            dirY: data.dirY ?? 0,
            // Set by how long the draw was held; every client needs them to
            // simulate the same flight.
            speed: data.speed,
            range: data.range,
            stuck: false
        });

        this.sendQuiver(ownerId);

        // Unlike the server this also reaches the shooter, whose arrow already
        // exists locally; spawnArrowEntity ignores a duplicate id.
        this.emit('arrow_spawned', {
            arrowId,
            ownerId,
            x: data.x,
            y: data.y,
            dirX: data.dirX,
            dirY: data.dirY,
            speed: data.speed,
            range: data.range
        });
    }

    handleArrowStuck(ownerId, data) {
        const arrow = this.arrows.get(data.arrowId);
        if (!arrow || arrow.ownerId !== ownerId) return;

        arrow.x = data.x;
        arrow.y = data.y;
        arrow.stuck = true;

        this.emit('arrow_stuck', { arrowId: data.arrowId, x: data.x, y: data.y });
    }

    handleArrowPickup(playerId, data) {
        const fighter = this.fighters.get(playerId);
        if (!fighter || !fighter.isAlive) return;

        const arrow = this.arrows.get(data.arrowId);
        if (!arrow || !arrow.stuck) return;
        if (fighter.quiver >= MAX_ARROWS) return;

        this.arrows.delete(data.arrowId);
        fighter.quiver++;

        this.sendQuiver(playerId);
        this.emit('arrow_picked', { arrowId: data.arrowId, playerId });
    }

    /**
     * A fighter reports batting an arrow out of the air.
     *
     * Confirmed rather than trusted: the arrow has to still be in flight, and
     * the deflector has to actually be next to it. Ownership then moves to the
     * deflector, who becomes the one client authoritative for where it lands.
     */
    handleArrowDeflect(deflectorId, data) {
        const fighter = this.fighters.get(deflectorId);
        if (!fighter || !fighter.isAlive) return;

        const arrow = this.arrows.get(data.arrowId);
        if (!arrow || arrow.stuck) return;
        if (arrow.ownerId === deflectorId) return;

        const pose = this.poseOf(deflectorId);
        if (!pose) return;
        if (Math.hypot((data.x ?? 0) - pose.x, (data.y ?? 0) - pose.y) > DEFLECT_TOLERANCE) return;

        arrow.ownerId = deflectorId;

        this.emit('arrow_deflected', {
            arrowId: data.arrowId,
            ownerId: deflectorId
        });
    }

    handleArrowHit(shooterId, data) {
        const shooter = this.fighters.get(shooterId);
        if (!shooter || !shooter.isAlive) return;

        const victimId = data.victimId;
        if (!victimId || victimId === shooterId) return;

        const victim = this.fighters.get(victimId);
        if (!victim || !victim.isAlive) return;

        const pose = this.poseOf(victimId);
        if (!pose) return;

        // Same sanity check as the server, and the same ordering: the arrow is
        // only consumed once the claim is accepted, so a rejected claim does
        // not quietly delete a perfectly good arrow.
        if (Math.hypot((data.x ?? 0) - pose.x, (data.y ?? 0) - pose.y) > ARROW_HIT_TOLERANCE) {
            return;
        }

        // The arrow is not consumed by the hit: it drops where it landed and
        // stays part of the arena's stock, to be picked up again.
        if (data.arrowId) {
            const arrow = this.arrows.get(data.arrowId);
            if (arrow) {
                arrow.x = data.x ?? arrow.x;
                arrow.y = data.y ?? arrow.y;
            }
            this.emit('arrow_dropped', { arrowId: data.arrowId, x: data.x, y: data.y });
        }

        this.applyDamage(shooterId, victimId, 'arrow');
    }

    /**
     * Passes a summoned spirit on to the other fighters.
     *
     * Mirrors the server's relay: nothing is validated because there is
     * nothing to validate - a spectre deals no damage by existing. What it
     * eventually hits arrives as an ordinary magic attack.
     */
    handleSpectreSpawn(ownerId, data) {
        const fighter = this.fighters.get(ownerId);
        if (!fighter || !fighter.isAlive) return;

        this.emit('spectre_spawned', {
            spectreId: data.spectreId,
            ownerId,
            targetId: data.targetId,
            x: data.x,
            y: data.y,
            dirX: data.dirX
        });
    }

    /** Planted arrows, for the AI to go and fetch. */
    plantedArrows() {
        const out = [];
        this.arrows.forEach((a, arrowId) => {
            if (a.stuck) out.push({ arrowId, ...a });
        });
        return out;
    }

    quiverOf(playerId) {
        const fighter = this.fighters.get(playerId);
        return fighter ? fighter.quiver : 0;
    }

    healthOf(playerId) {
        const fighter = this.fighters.get(playerId);
        return fighter ? fighter.health : 0;
    }
}

// === Hit rules, ported verbatim from server/game_logic.go ===

function isMeleeHit(attack, victimPose, distance) {
    if (distance > MELEE_RANGE) return false;
    if (attack.facingRight && victimPose.x < attack.x) return false;
    if (!attack.facingRight && victimPose.x > attack.x) return false;
    return true;
}

function isArrowHit(attack, victimPose, distance) {
    if (distance > ARROW_RANGE) return false;
    if (attack.facingRight && victimPose.x < attack.x) return false;
    if (!attack.facingRight && victimPose.x > attack.x) return false;
    if (Math.abs(victimPose.y - attack.y) > 50) return false;
    return true;
}

/**
 * Whether two simultaneous swings collide - server/parry.go bladesMeet().
 *
 * Close enough, and each fighter turned toward the other. Two players swinging
 * the same way are not parrying: the one in front takes it in the back.
 */
function bladesMeet(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (Math.hypot(dx, dy) > MELEE_RANGE * CLASH_RANGE_FACTOR) return false;

    const aFacesB = (a.facingRight && dx > 0) || (!a.facingRight && dx < 0);
    const bFacesA = (b.facingRight && dx < 0) || (!b.facingRight && dx > 0);

    return aFacesB && bFacesA;
}
