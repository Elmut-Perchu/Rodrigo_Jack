// core/systems_vs/vs_bow_system.js - VS Mode weapon input (sword + bow)
import { System } from '../systems/system.js';
import { createArrow } from '../../create/arrow_create.js';
import { ARROW_CONSTANTS } from '../../constants/arrow_constants.js';
import { VS_BOW, shotPower } from '../../constants/vs_bow_constants.js';
import { SWING_CYCLE, COMBO_RESET_MS } from '../../constants/vs_combat_constants.js';
import { isParalysed } from '../../constants/vs_paralysis_constants.js';

// How long a sword keeps swatting arrows out of the air after it is swung.
const BLADE_ACTIVE_MS = 200;

/**
 * Turns a fighter's weapon input into game actions and network events.
 *
 * Two weapons, both driven from the Input component:
 *   X      - sword. One key for all three blows: successive swings walk
 *            through SWING_CYCLE, so a fight reads as a combo rather than the
 *            same chop over and over. Reported to the referee, which owns hit
 *            detection and damage, then echoes player_attack so every client
 *            animates the same blow.
 *   W      - bow. Tap for a snap shot, hold to draw further. Arrows are
 *            TowerFall-style consumables: firing spends one from the quiver
 *            and it only comes back by walking over it where it landed (see
 *            VSArrow).
 *
 * Every fighter simulated on this machine goes through here - the local player
 * and any bot. A bot's "keys" are written by VSBot into a BotInput of exactly
 * the same shape, so the weapon rules, the cooldown and the draw time are
 * literally the same code for both. Networked opponents are excluded: they
 * animate from the player_attack broadcasts instead.
 */
export class VSBow extends System {
    constructor(game) {
        super(game);
        this.game = game;
        // Per-fighter trigger state, keyed by entity uuid. It used to be three
        // fields on the system, which was fine while only the local player
        // could swing.
        this.triggers = new Map();
        // The arrow held on the string, one per drawing fighter. It is a
        // purely local visual: what goes on the wire is the shot itself.
        this.nocked = new Map();
        this.meleeCooldown = 450; // ms between sword swings
    }

    update() {
        this.entities.forEach(entity => {
            const networkPlayer = entity.getComponent('networkPlayer');
            if (!networkPlayer || !networkPlayer.simulated) return;

            const input = entity.getComponent('input');
            const bowState = entity.getComponent('bow_state');
            const property = entity.getComponent('property');
            if (!input || !bowState || !property) return;

            const trigger = this.triggerFor(entity);

            // A dead fighter keeps its entity around but stops acting - and so
            // does a fighter held for the "3, 2, 1" beats, who would otherwise
            // be shooting at opponents pinned in place and unable to dodge
            // (see GameVSSimple.freezeFighters), and one held by a spirit,
            // for whom losing the weapons is the whole of the punishment.
            if (property.isAlive === false || property.movable === false || isParalysed(property)) {
                trigger.bow = false;
                trigger.melee = false;
                trigger.tapped = false;
                bowState.cancelCharge();
                this.clearNocked(entity);
                return;
            }

            this.updateMelee(entity, input, trigger);
            this.updateBow(entity, input, bowState, trigger);
        });
    }

    triggerFor(entity) {
        let trigger = this.triggers.get(entity.uuid);
        if (!trigger) {
            trigger = {
                bow: false,
                melee: false,
                tapped: false,   // Bow released before the arrow was nocked
                lastMelee: 0,
                swingIndex: 0,   // Where we are in SWING_CYCLE
                comboAt: 0       // When the last blow of the chain landed
            };
            this.triggers.set(entity.uuid, trigger);
        }
        return trigger;
    }

    removeEntity(entity) {
        super.removeEntity(entity);
        this.triggers.delete(entity.uuid);
        this.clearNocked(entity);
    }

    /** Who this fighter's actions are attributed to. */
    actorId(entity) {
        const networkPlayer = entity.getComponent('networkPlayer');
        return networkPlayer ? networkPlayer.playerId : this.game.localPlayerId;
    }

    // === Sword ===

    /**
     * X swings, and keeps swinging while it is held.
     *
     * The cooldown is what paces a fight, not how fast the key can be tapped,
     * so holding the button is simply the comfortable way to play rather than
     * an advantage.
     */
    updateMelee(entity, input, trigger) {
        const pressed = !!input.attack1;
        const now = performance.now();

        if (pressed && now - trigger.lastMelee >= this.meleeCooldown) {
            trigger.lastMelee = now;
            this.swingSword(entity, trigger, now);
        }

        trigger.melee = pressed;
    }

    /**
     * Picks the next blow in the combo.
     *
     * A chain always opens on the first entry of SWING_CYCLE and works
     * forward; break off for longer than COMBO_RESET_MS and the next swing
     * starts the chain again. Which blow it is matters beyond the animation:
     * a parry may not be two identical blades meeting (see game.handleParry).
     */
    nextSwing(trigger, now) {
        if (now - trigger.comboAt > COMBO_RESET_MS) trigger.swingIndex = 0;
        else trigger.swingIndex = (trigger.swingIndex + 1) % SWING_CYCLE.length;

        trigger.comboAt = now;
        return SWING_CYCLE[trigger.swingIndex];
    }

    swingSword(entity, trigger, now) {
        const position = entity.getComponent('position');
        const animation = entity.getComponent('animation');
        if (!position) return;

        const facingRight = animation ? !animation.isFlipped : true;
        const swing = this.nextSwing(trigger, now);

        const actorId = this.actorId(entity);

        // Show it here immediately; the referee decides who it connects with.
        entity._swingVariant = swing;
        if (animation) {
            animation.setState(swing);
            animation.currentFrame = 0;
            animation.frameTimer = 0;
        }
        entity._attackHoldUntil = now + this.meleeCooldown;

        this.game.sendFrom(actorId, 'player_attack', {
            attackType: 'melee',
            swing,
            x: position.x,
            y: position.y,
            direction: facingRight ? 'right' : 'left',
            facingRight
        });

        // The blade stays dangerous to arrows for a short while after the
        // swing rather than only on the frame the key went down. An arrow
        // crosses the whole reach of a sword in about 165ms, so a single-frame
        // test made batting one down a matter of luck; VSArrow sweeps for
        // arrows entering the arc for as long as this window is open.
        entity._bladeActiveUntil = now + BLADE_ACTIVE_MS;
        entity._bladeFacingRight = facingRight;
    }

    // === Bow ===

    /**
     * W draws and looses.
     *
     * Tapping is a complete action: the shot still needs ARM_TIME to nock, but
     * it goes off on its own the moment it is ready, so a quick press always
     * produces an arrow. Holding past that point keeps drawing, and the shot
     * leaves when the key does - harder and further the longer it was held.
     */
    updateBow(entity, input, bowState, trigger) {
        const pressed = !!input.arrowShoot;
        const now = performance.now();

        if (pressed && !trigger.bow) {
            trigger.tapped = false;
            this.startDraw(entity, input, bowState);
        } else if (!pressed && trigger.bow && bowState.state === 'charging') {
            if (now - bowState.chargeStartTime < VS_BOW.ARM_TIME) {
                // Let go before the arrow was even on the string: see the
                // draw through and loose it as a snap shot rather than
                // swallowing the press.
                trigger.tapped = true;
            } else {
                this.release(entity, bowState);
            }
        }

        trigger.bow = pressed;

        // Runs whether or not the key is still down, so a tap can finish
        // arming after the finger has left it.
        if (bowState.state !== 'charging') return;

        this.updateDraw(entity, input, bowState, pressed);

        const held = now - bowState.chargeStartTime;
        if (trigger.tapped && held >= VS_BOW.ARM_TIME) {
            trigger.tapped = false;
            this.fire(entity, bowState, held);
        }
    }

    startDraw(entity, input, bowState) {
        // Sword takes priority over the bow
        if (input.attack1) return;

        if (bowState.currentArrows <= 0) {
            if (entity === this.game.localPlayer) this.game.notifyEmptyQuiver?.();
            return;
        }

        if (bowState.startCharge()) {
            this.aim(entity, input, bowState);

            // Play the draw motion, but only for as long as the arming takes.
            // After that the body goes back to running and idling normally:
            // what says "ready" is the nocked arrow out in front, not a frozen
            // pose (see VSRender). Holding the pose for the whole draw was
            // what made the fighter look stuck while walking.
            const animation = entity.getComponent('animation');
            if (animation) animation.setState('arrowShoot');
            entity._attackHoldUntil = performance.now() + VS_BOW.ARM_TIME;
            entity._bowArmed = false;
        }
    }

    /**
     * Runs every frame the draw is live.
     *
     * Once the arm time has passed an arrow appears on the string, pointing
     * wherever the fighter is aiming. That is the whole feedback loop: you do
     * not count out a charge, you watch for the arrow and let go.
     */
    updateDraw(entity, input, bowState, pressed) {
        // Turning or looking up while drawn re-aims the shot. A tap that has
        // already been released keeps the aim it was let go with.
        if (pressed) this.aim(entity, input, bowState);

        const held = performance.now() - bowState.chargeStartTime;
        if (held < VS_BOW.ARM_TIME) return;

        entity._bowArmed = true;

        const nock = this.nockPosition(entity, bowState.facingDirection);
        if (!nock) return;

        let preview = this.nocked.get(entity.uuid);
        if (!preview) {
            preview = createArrow(nock.x, nock.y, { ...bowState.facingDirection });
            const arrow = preview.getComponent('arrow');
            // 'nocked' is inert: VSArrow only simulates flying and falling
            // arrows, and only stuck ones can be picked up.
            arrow.state = 'nocked';
            arrow.isRecoverable = false;
            const velocity = preview.getComponent('velocity');
            if (velocity) { velocity.vx = 0; velocity.vy = 0; }

            this.game.addEntity(preview);
            this.nocked.set(entity.uuid, preview);
        }

        // Follow the fighter, and swing round with the aim
        const position = preview.getComponent('position');
        if (position) { position.x = nock.x; position.y = nock.y; }
        const arrow = preview.getComponent('arrow');
        if (arrow) {
            arrow.direction.x = bowState.facingDirection.x;
            arrow.direction.y = bowState.facingDirection.y;
        }
    }

    release(entity, bowState) {
        if (bowState.state !== 'charging') return;
        this.fire(entity, bowState, performance.now() - bowState.chargeStartTime);
    }

    /**
     * Points the shot.
     *
     * The direction keys aim: up, down and the diagonals all shoot. With no
     * vertical key held the aim collapses back to the way the fighter faces,
     * which is what makes the arena feel unchanged until you reach for it.
     */
    aim(entity, input, bowState) {
        const animation = entity.getComponent('animation');
        const facing = animation && animation.isFlipped ? -1 : 1;

        const wanted = input && input.aim;
        const length = wanted ? Math.hypot(wanted.x, wanted.y) : 0;

        if (!length) {
            bowState.facingDirection.x = facing;
            bowState.facingDirection.y = 0;
            return;
        }

        bowState.facingDirection.x = wanted.x / length;
        bowState.facingDirection.y = wanted.y / length;
    }

    /** Where the nocked arrow sits, and where the shot leaves from. */
    nockPosition(entity, direction) {
        const position = entity.getComponent('position');
        const visual = entity.getComponent('visual');
        if (!position || !visual) return null;

        const hitbox = entity.getComponent('circle_hitbox');
        const centreY = position.y + visual.height / 2 + (hitbox ? hitbox.offsetY : 0);

        // Offset along the aim, so a shot loosed straight up leaves above the
        // fighter's head rather than out of their hip.
        return {
            x: position.x + direction.x * ARROW_CONSTANTS.SPAWN_OFFSET_X,
            y: centreY - ARROW_CONSTANTS.ARROW_DISPLAY_HEIGHT / 2
                + direction.y * ARROW_CONSTANTS.SPAWN_OFFSET_X
        };
    }

    fire(entity, bowState, heldMs) {
        const ownerId = this.actorId(entity);
        const direction = { x: bowState.facingDirection.x, y: bowState.facingDirection.y };

        const nock = this.nockPosition(entity, direction);
        if (!nock) return;

        // Hold longer, hit harder and further.
        const power = shotPower(heldMs);

        const arrowId = `${ownerId || 'local'}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e4)}`;

        this.clearNocked(entity);
        entity._bowArmed = false;

        // Spawn locally first so the shot feels instant, then report it.
        // Speed, range and both components of the aim travel with it: every
        // client simulates the arrow itself, so they all need the same launch
        // parameters or the shot lands somewhere different on each screen.
        this.game.spawnArrowEntity(arrowId, ownerId, nock.x, nock.y, direction.x, false,
            power.speed, power.range, direction.y);

        bowState.shoot(); // Spends the arrow

        this.game.sendFrom(ownerId, 'arrow_spawn', {
            arrowId,
            x: nock.x,
            y: nock.y,
            dirX: direction.x,
            dirY: direction.y,
            speed: power.speed,
            range: power.range
        });

        this.game.refreshQuiverHud?.();
    }

    clearNocked(entity) {
        const preview = this.nocked.get(entity.uuid);
        if (!preview) return;
        this.nocked.delete(entity.uuid);
        this.game.removeEntity(preview);
    }
}
