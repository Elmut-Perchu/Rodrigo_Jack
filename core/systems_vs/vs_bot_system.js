// core/systems_vs/vs_bot_system.js - Computer opponent
import { System } from '../systems/system.js';
import { MAX_HEALTH } from '../../constants/vs_combat_constants.js';
import { VS_BOW } from '../../constants/vs_bow_constants.js';

const TILE = 64;

// Sprite is 110x110; the collision circle sits at (x+55, y+79) with radius 26.
const BODY_OFFSET_X = 55;
const BODY_OFFSET_Y = 79;
const BODY_RADIUS = 26;

// Distance the bot aims to keep when it wants to use the bow rather than the
// sword. Comfortably outside melee reach (120px) without being so far that it
// loses track of the fight.
const BOW_RANGE_MIN = 220;
const BOW_RANGE_MAX = 520;

// Melee is judged at 120px between sprite origins; commit a little inside that
// so the swing is not decided on the very edge of reach.
const STRIKE_RANGE = 96;

// Small cushion so the release lands after the intended draw rather than one
// frame short of it.
const DRAW_MARGIN_MS = 60;

export class VSBot extends System {
    constructor(game) {
        super(game);
        this.game = game;
        this.grid = null; // Lazily built from the map's tile rows
    }

    update(deltaTime) {
        const now = performance.now();

        this.entities.forEach(entity => {
            const bot = entity.getComponent('bot');
            if (!bot) return;

            const property = entity.getComponent('property');
            const input = entity.getComponent('input');
            if (!input || !property) return;

            // Every frame starts from a clean slate; whatever is still wanted
            // is re-asserted below. VSBot runs before VSInput and VSBow, so
            // they only ever see the finished decision, never this reset.
            input.releaseActions();
            input.arrowShoot = false;
            input.vector.v = 0;

            // Aim is re-declared each frame by whichever state wants it (see
            // faceToward); left standing it would keep the bot staring in a
            // direction it no longer cares about.
            const animation = entity.getComponent('animation');
            if (animation) animation.facingLock = 0;

            if (property.isAlive === false) {
                input.vector.h = 0;
                return;
            }

            this.think(entity, bot, input, now);
        });
    }

    // === Perception ===

    /**
     * What the bot currently believes about its opponent.
     *
     * Refreshed no more often than the level's reaction time, so a Rookie is
     * genuinely chasing a stale position while a Master is nearly current.
     * This is where most of the difficulty difference comes from - it is not a
     * speed handicap, it is out-of-date information.
     */
    perceive(bot, now) {
        const target = this.pickTarget(bot);
        if (!target) return null;

        if (now >= bot.nextPerceptionAt) {
            const pose = this.poseOf(target);
            if (pose) {
                bot.seen = { ...pose, at: now };
                bot.targetId = target.playerId;
            }
            bot.nextPerceptionAt = now + bot.level.reactionMs;
        }

        return bot.seen.at ? bot.seen : null;
    }

    /** The nearest living opponent. */
    pickTarget(bot) {
        let best = null;
        let bestDistance = Infinity;

        const self = bot._entity;
        const selfPose = self ? this.poseOf(self) : null;
        if (!selfPose) return null;

        this.game.fighterEntities().forEach((entity, playerId) => {
            if (entity === self) return;

            const property = entity.getComponent('property');
            if (property && property.isAlive === false) return;

            // Never pick a team-mate to fight.
            const np = self.getComponent('networkPlayer');
            if (np && this.game.areAllies(np.playerId, playerId)) return;

            const pose = this.poseOf(entity);
            if (!pose) return;

            const distance = Math.hypot(pose.x - selfPose.x, pose.y - selfPose.y);
            if (distance < bestDistance) {
                bestDistance = distance;
                // Spread first: poseOf() carries a playerId of its own that
                // would otherwise overwrite the one we just resolved.
                best = { ...pose, playerId, entity };
            }
        });

        return best;
    }

    poseOf(entityOrTarget) {
        const entity = entityOrTarget.entity || entityOrTarget;
        const position = entity.getComponent('position');
        if (!position) return null;

        return {
            x: position.x,
            y: position.y,
            cx: position.x + BODY_OFFSET_X,
            cy: position.y + BODY_OFFSET_Y,
            playerId: entityOrTarget.playerId
        };
    }

    // === Thinking ===

    think(entity, bot, input, now) {
        bot._entity = entity;

        const self = this.poseOf(entity);
        const seen = this.perceive(bot, now);

        if (!self) return;

        if (!seen) {
            this.wander(entity, bot, input, now);
            return;
        }

        // A draw already under way owns the plan. Re-deciding mid-draw let go
        // of the string early and turned every shot into a half-drawn one - a
        // Master at 160ms decision intervals almost never reached full power.
        // Only the parry reflex may abandon a draw (see reflexes()).
        if (bot.chargeUntil > 0) {
            bot.state = 'shoot';
        } else if (now >= bot.nextDecisionAt) {
            bot.state = this.decide(entity, bot, self, seen, now);
            bot.nextDecisionAt = now + bot.level.decisionMs;
        }

        this.act(entity, bot, input, self, seen, now);
        this.reflexes(entity, bot, input, self, seen, now);
        this.spirit(entity, bot, input, self, seen, now);
    }

    /**
     * Channels a spirit, and sends it.
     *
     * Kept out of the state machine on purpose: filling the gauge is something
     * a bot does *while* doing something else, in the gaps between engagements,
     * exactly as a player does. What it costs is footspeed (VSSpectre halves
     * it), so the only judgement needed is whether the opponent is far enough
     * away to make that affordable - which is what spectreRange encodes.
     */
    spirit(entity, bot, input, self, seen, now) {
        const level = bot.level;
        if (!level.spectreRange) return; // This level does not use them

        const state = entity.getComponent('spectre_state');
        if (!state) return;

        // A full gauge is spent at once. VSSpectre wants a fresh press, so the
        // key is left alone for a frame first.
        if (state.ready) {
            if (bot._spiritArmed) {
                input.magicAttack = true;
                bot._spiritArmed = false;
            } else {
                bot._spiritArmed = true;
            }
            return;
        }
        bot._spiritArmed = false;

        // Never while committed to something that needs both hands.
        if (bot.state === 'strike' || bot.state === 'shoot') return;
        if (bot.chargeUntil > 0 || bot.swingAt) return;

        const distance = Math.hypot(seen.x - self.x, seen.y - self.y);
        if (distance < level.spectreRange) return;

        input.magicAttack = true;
    }

    /**
     * Picks a plan. Ordered by urgency, so a bot that is out of arrows and
     * bleeding will go and fetch one rather than keep charging in.
     */
    decide(entity, bot, self, seen, now) {
        const level = bot.level;
        const distance = Math.abs(seen.x - self.x);
        const heightGap = Math.abs(seen.y - self.y);

        // A blunder: commit to something unhelpful for one decision cycle.
        if (level.mistakeChance > 0 && Math.random() < level.mistakeChance) {
            return Math.random() < 0.5 ? 'wander' : 'approach';
        }

        const quiver = this.quiverOf(entity);
        const health = this.healthOf(entity);

        // Out of arrows: go and collect one, TowerFall-style.
        if (level.retrieveArrows && quiver === 0) {
            const arrow = this.nearestArrow(self);
            if (arrow) {
                bot.fetchArrowId = arrow.arrowId;
                return 'fetch';
            }
        }

        // Hurt and still armed: keep away and shoot.
        if (level.retreatBelowHalfHearts > 0 && health <= level.retreatBelowHalfHearts && quiver > 0) {
            return distance < BOW_RANGE_MIN ? 'retreat' : 'shoot';
        }

        // In reach on the same level: swing.
        if (distance <= STRIKE_RANGE && heightGap < 60) {
            return 'strike';
        }

        // Lined up and holding arrows: shoot, according to how much this level
        // trusts the bow over the sword.
        if (quiver > 0 && heightGap <= level.aimTolerance && Math.random() < level.arrowBias) {
            if (this.hasLineOfSight(self, seen)) {
                return distance > BOW_RANGE_MAX ? 'approach' : 'shoot';
            }
        }

        // Too far above to engage even with the double jump (~297px of lift,
        // roughly four 64px platforms): get underneath them instead and be
        // waiting when they come down.
        if (heightGap > 360) return 'approach';

        // Levels that understand spacing back off when they are too close to
        // use the bow but not close enough to swing.
        if (level.keepsDistance && quiver > 0 && distance < BOW_RANGE_MIN) {
            return 'retreat';
        }

        return Math.random() < level.aggression ? 'approach' : 'space';
    }

    /** Turns the plan into held keys. */
    act(entity, bot, input, self, seen, now) {
        switch (bot.state) {
            case 'strike':
                this.faceToward(entity, self, seen.x);
                this.moveToward(entity, bot, input, self, seen.x, now, 0.35);
                this.scheduleSwing(bot, now, 0);
                break;

            case 'approach':
                this.moveToward(entity, bot, input, self, seen.x, now);
                break;

            case 'retreat': {
                const away = self.x + (self.x < seen.x ? -1 : 1) * 260;
                this.moveToward(entity, bot, input, self, away, now);
                this.faceToward(entity, self, seen.x); // Keep the bow on target
                break;
            }

            case 'space': {
                const drift = self.x + (self.x < seen.x ? -1 : 1) * 140;
                this.moveToward(entity, bot, input, self, drift, now, 0.6);
                break;
            }

            case 'shoot':
                this.shoot(entity, bot, input, self, seen, now);
                break;

            case 'fetch':
                this.fetch(entity, bot, input, self, now);
                break;

            case 'wander':
            default:
                this.wander(entity, bot, input, now);
                break;
        }
    }

    // === Actions ===

    /**
     * Holds the bow trigger long enough to complete a draw, then lets go.
     *
     * VSBow owns the actual shot: it sees the trigger released after a full
     * charge and fires, spending an arrow. The bot only has to stand still,
     * face the right way and hold.
     */
    shoot(entity, bot, input, self, seen, now) {
        this.faceToward(entity, self, seen.x, seen.y);

        // Stand still while drawing, otherwise VSRender re-derives facing from
        // velocity and the shot can leave in the wrong direction.
        input.vector.h = 0;

        if (bot.chargeUntil === 0) {
            if (this.quiverOf(entity) <= 0) {
                bot.state = 'approach';
                return;
            }
            bot.chargeUntil = now + this.drawTime(bot);
        }

        if (now < bot.chargeUntil) {
            input.arrowShoot = true;   // Held: the draw
        } else {
            input.arrowShoot = false;  // Released: VSBow looses the arrow
            bot.chargeUntil = 0;
            bot.nextDecisionAt = 0;    // Re-plan immediately after the shot
        }
    }

    /**
     * How long this bot holds the string.
     *
     * A Rookie lets go almost immediately and lobs a weak arrow; a Master
     * holds a full draw every time. Same weapon, same rules as the player -
     * the difference is patience.
     */
    drawTime(bot) {
        const span = VS_BOW.FULL_DRAW_TIME - VS_BOW.ARM_TIME;
        return VS_BOW.ARM_TIME + span * (bot.level.drawFullness ?? 0.5) + DRAW_MARGIN_MS;
    }

    /** Walks to a planted arrow to put it back in the quiver. */
    fetch(entity, bot, input, self, now) {
        const arrows = this.game.plantedArrows();
        let target = arrows.find(a => a.arrowId === bot.fetchArrowId);

        if (!target) {
            target = this.nearestArrow(self);
            bot.fetchArrowId = target ? target.arrowId : null;
        }

        if (!target) {
            bot.state = 'approach';
            return;
        }

        this.moveToward(entity, bot, input, self, target.x + 50, now);
    }

    wander(entity, bot, input, now) {
        if (now >= bot.nextWanderAt) {
            bot.wanderDir = Math.random() < 0.5 ? -1 : 1;
            bot.nextWanderAt = now + 700 + Math.random() * 900;
        }
        input.vector.h = bot.wanderDir * 0.6;
    }

    // === Reflexes ===

    /**
     * Short-fuse responses that bypass the decision clock.
     *
     * The parry is the important one. The bot is never *granted* a parry: it
     * answers an incoming blow with a real swing, and the arbiter applies the
     * same bladesMeet test it uses between two humans. Whether that lands
     * inside the 220ms window is decided purely by the level's reflex time,
     * which is what makes a Master feel like it is reading you and a Rookie
     * like it is always a beat late.
     */
    reflexes(entity, bot, input, self, seen, now) {
        // A scheduled swing has come due
        if (bot.swingAt && now >= bot.swingAt) {
            bot.swingAt = 0;
            this.faceToward(entity, self, seen.x);
            input.attack1 = true;
            input.arrowShoot = false;
            bot.chargeUntil = 0;
            bot.lastSwingAt = now;
        }

        // Jump over an arrow flying at us, if this level is quick enough
        if (bot.level.parryReactionMs <= 170) {
            this.dodgeArrows(entity, bot, input, self, now);
        }
    }

    scheduleSwing(bot, now, delay = 0) {
        if (bot.swingAt) return;                       // Already committed
        if (now - bot.lastSwingAt < 450) return;       // VSBow's own cooldown
        bot.swingAt = now + delay;
    }

    /**
     * Called when any fighter swings. Starts the reflex that may become a
     * parry.
     */
    onAttackObserved(attackData) {
        if (!attackData || attackData.attackType !== 'melee') return;
        const now = performance.now();

        this.entities.forEach(entity => {
            const bot = entity.getComponent('bot');
            if (!bot) return;

            const np = entity.getComponent('networkPlayer');
            if (np && np.playerId === attackData.attackerId) return; // Its own swing

            const property = entity.getComponent('property');
            if (property && property.isAlive === false) return;

            if (Math.random() > bot.level.parryChance) return;

            const self = this.poseOf(entity);
            if (!self) return;

            // Only worth answering if the blades could actually meet.
            const distance = Math.hypot(attackData.x - self.x, attackData.y - self.y);
            if (distance > 162) return; // MeleeRange * ClashRangeFactor

            bot.swingAt = now + bot.level.parryReactionMs;
            bot.chargeUntil = 0;
        });
    }

    /** Hops over an incoming arrow. Only the faster levels manage it. */
    dodgeArrows(entity, bot, input, self, now) {
        const property = entity.getComponent('property');
        if (!property || !property.isOnGround) return;

        const np = entity.getComponent('networkPlayer');
        const myId = np ? np.playerId : null;

        let threatened = false;
        this.game.arrows.forEach(arrowEntity => {
            if (threatened) return;

            const arrow = arrowEntity.getComponent('arrow');
            const position = arrowEntity.getComponent('position');
            if (!arrow || !position || arrow.state !== 'flying') return;
            if (arrow.ownerPlayerId === myId) return;

            const dx = self.cx - position.x;
            const closing = arrow.direction.x > 0 ? dx > 0 : dx < 0;
            if (!closing) return;

            if (Math.abs(dx) < 260 && Math.abs(position.y + 76 - self.cy) < BODY_RADIUS + 14) {
                threatened = true;
            }
        });

        if (threatened) input.vector.v = 1;
    }

    // === Navigation ===

    /**
     * Steers toward a world x, jumping over what gets in the way.
     *
     * Deliberately reactive rather than a pathfinder: the arena is a handful of
     * platforms, and a bot that walks into things and hops is both good enough
     * and far easier to reason about than a plan that goes stale every frame.
     */
    moveToward(entity, bot, input, self, targetX, now, throttle = 1) {
        const delta = targetX - self.x;
        const dir = Math.sign(delta);

        if (Math.abs(delta) < 24) {
            input.vector.h = 0;
            return;
        }

        input.vector.h = dir * throttle;

        const property = entity.getComponent('property');
        if (!property) return;
        if (now < bot.jumpBlockedUntil) return;

        if (!property.isOnGround) {
            this.tryAirJump(entity, bot, input, property, self, now);
            return;
        }

        if (this.wallAhead(self, dir) || this.stuck(bot, self, now)) {
            input.vector.v = 1;
            bot.jumpBlockedUntil = now + 200; // Short, so the air jump can follow
        }
    }

    /**
     * Spends the second jump to reach a ledge.
     *
     * Held until the bot is on the way down, which is where it buys the most
     * height: a single jump peaks around 148px - enough for the arena's short
     * steps - and a second one roughly doubles that, which is the only way up
     * the tall ones. Spending it well is the difference between reaching a
     * ledge and bouncing off its edge.
     */
    tryAirJump(entity, bot, input, property, self, now) {
        if ((property.airJumpsUsed || 0) > 0) return;

        const velocity = entity.getComponent('velocity');
        if (!velocity || velocity.vy > 0) return; // Still rising: wait for the apex

        // Only worth it if there is something above worth reaching.
        if (!bot.seen || !bot.seen.at) return;
        if (self.y - bot.seen.y < 40) return;

        input.vector.v = 1;
        bot.jumpBlockedUntil = now + 500;
    }

    /** Notices when the bot has been pressed against something and got nowhere. */
    stuck(bot, self, now) {
        if (Math.abs(self.x - bot.lastX) > 3) {
            bot.lastX = self.x;
            bot.stuckSince = now;
            return false;
        }
        if (!bot.stuckSince) {
            bot.stuckSince = now;
            return false;
        }
        return now - bot.stuckSince > 400;
    }

    wallAhead(self, dir) {
        const probeX = self.cx + dir * (BODY_RADIUS + 10);
        return this.isSolid(probeX, self.cy) || this.isSolid(probeX, self.cy - 30);
    }

    /** Rough line of sight: no wall between the two bodies. */
    hasLineOfSight(self, target) {
        const steps = Math.ceil(Math.abs(target.x - self.x) / 32);
        if (steps === 0) return true;

        const targetCy = target.y + BODY_OFFSET_Y;
        for (let i = 1; i < steps; i++) {
            const t = i / steps;
            const x = self.cx + (target.x + BODY_OFFSET_X - self.cx) * t;
            const y = self.cy + (targetCy - self.cy) * t;
            if (this.isSolid(x, y)) return false;
        }
        return true;
    }

    isSolid(worldX, worldY) {
        const grid = this.tileGrid();
        if (!grid) return false;

        const gx = Math.floor(worldX / TILE);
        const gy = Math.floor(worldY / TILE);

        if (gy < 0 || gy >= grid.length) return true;   // Outside: treat as wall
        const row = grid[gy];
        if (gx < 0 || gx >= row.length) return true;

        return row[gx] === '1';
    }

    tileGrid() {
        if (this.grid) return this.grid;
        const map = this.game.currentMap;
        if (!map || !map.tiles) return null;
        this.grid = map.tiles;
        return this.grid;
    }

    // === Small helpers ===

    /**
     * Points the sprite at a target.
     *
     * Declares an aim direction for this frame, overriding whatever VSRender
     * would otherwise derive from movement.
     */
    faceToward(entity, self, targetX, targetY) {
        const animation = entity.getComponent('animation');
        if (!animation) return;

        // facingLock wins over both the movement direction and the velocity in
        // VSRender, which is what lets the bot back away from an opponent with
        // its bow still trained on them.
        const facing = targetX < self.x ? -1 : 1;
        animation.facingLock = facing;
        animation.isFlipped = targetX < self.x;

        // The bow reads input.aim, the same field the player's keys fill in.
        // Given a height the bot points at it properly instead of loosing flat
        // and hoping - a shot along the ground at somebody on a ledge is just
        // a wasted arrow.
        const input = entity.getComponent('input');
        if (!input || !input.aim) return;

        if (targetY === undefined) {
            input.aim.x = facing;
            input.aim.y = 0;
            return;
        }

        const dx = targetX - self.x;
        const dy = targetY - self.y;
        const length = Math.hypot(dx, dy);
        if (!length) {
            input.aim.x = facing;
            input.aim.y = 0;
            return;
        }
        input.aim.x = dx / length;
        input.aim.y = dy / length;
    }

    nearestArrow(self) {
        const arrows = this.game.plantedArrows();
        let best = null;
        let bestDistance = Infinity;

        arrows.forEach(a => {
            const distance = Math.hypot(a.x - self.x, a.y - self.y);
            if (distance < bestDistance) {
                bestDistance = distance;
                best = a;
            }
        });

        return best;
    }

    quiverOf(entity) {
        const bowState = entity.getComponent('bow_state');
        return bowState ? bowState.currentArrows : 0;
    }

    healthOf(entity) {
        const health = entity.getComponent('health');
        return health ? health.currentHealth : MAX_HEALTH;
    }
}
