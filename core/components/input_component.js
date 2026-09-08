//core/components/input_component.js
import { Component } from './component.js';
import { dlog } from '../debug_log.js';
import {
    LEFT, RIGHT,
    JUMP, SWORD, BOW, MAGIC, ROLL, SWALLOWED,
    normalise, isTyping, held
} from '../../constants/controls.js';
import { SWING_CYCLE, COMBO_RESET_MS } from '../../constants/vs_combat_constants.js';

// Global counter for unique IDs
let inputInstanceCounter = 0;

/**
 * The keyboard as the solo game reads it.
 *
 * Bindings come from constants/controls.js, the same ones the arena uses, so
 * a player who has learned to fight in one mode is not made to relearn it in
 * the other. What changed for Adventure: the jump moved from Up to space, the
 * bow from space to W, magic from V to C, and the sword onto X.
 *
 * The sword used to have a key each for its three blows. It now has one, and
 * successive swings walk through them the way the arena's does, so a fight
 * still shows all three animations - the variety comes from staying on the
 * attack rather than from remembering which finger does which chop. The order
 * and the reset delay are imported rather than copied, so the two modes
 * cannot drift apart again.
 *
 * The fields below are the contract the Adventure systems read - `attack1`
 * through `attack3`, `magicAttack`, `arrowShoot`, `roll` - and none of them
 * changed. Only which key raises them did.
 */
export class Input extends Component {
    constructor() {
        super();
        this.instanceId = ++inputInstanceCounter;
        this.keys = new Set();
        this.vector = { h: 0, v: 0 };
        this.jump = 0;
        this.jumpPressed = false;
        this.isRolling = false;
        this.rollDirection = 0;
        this.rollStartTime = 0;
        this.rollDuration = 400; // durée de la roulade en ms

        // Where we are in the sword chain, and when its last blow landed.
        this.swingIndex = 0;
        this.swing = SWING_CYCLE[0];
        this.comboAt = 0;

        dlog(`🟡 [INPUT COMPONENT] Created instance #${this.instanceId}`);

        document.addEventListener('keydown', (e) => {
            // A search box or a name field keeps its keystrokes: the
            // leaderboard is typed into while the player entity is still
            // alive, and space is the jump now, so a swallowed space would
            // be a space that never reaches the field.
            if (isTyping(e.target)) return;

            const key = normalise(e.key);

            // 🔴 DEBUG: Log keydown events with instance ID
            dlog(`🔴 [INPUT COMPONENT #${this.instanceId}] keydown: ${key}, keys: [${Array.from(this.keys).join(',')}]`);

            // Space and the arrows scroll the page if left alone.
            if (SWALLOWED.has(key)) e.preventDefault();

            // Read before the key joins the set, so an auto-repeat is told
            // apart from a genuinely fresh press.
            const fresh = !this.keys.has(key);
            this.keys.add(key);

            if (this.keys.has(JUMP) && this.jump < 2 && !this.jumpPressed) {
                this.jump++;
                this.jumpPressed = true;
                this.vector.v = 1;
            }

            // Each fresh swing takes the next blow of the chain.
            if (key === SWORD && fresh) this.nextSwing();

            // Initier la roulade
            if (key === ROLL && !this.isRolling) {
                this.startRoll();
            }
        });

        document.addEventListener('keyup', (e) => {
            const key = normalise(e.key);
            this.keys.delete(key);
            if (key === JUMP) {
                this.jumpPressed = false;
            }
        });

        // Keys held when the window loses focus would otherwise stay held
        // forever - a player walking into a wall until you alt-tab back.
        window.addEventListener('blur', () => {
            this.keys.clear();
            this.jumpPressed = false;
        });
    }

    /**
     * Picks the next blow.
     *
     * A chain always opens on the first entry of SWING_CYCLE and works
     * forward; break off for longer than COMBO_RESET_MS and the next swing
     * starts it again.
     */
    nextSwing() {
        const now = Date.now();
        if (now - this.comboAt > COMBO_RESET_MS) this.swingIndex = 0;
        else this.swingIndex = (this.swingIndex + 1) % SWING_CYCLE.length;

        this.comboAt = now;
        this.swing = SWING_CYCLE[this.swingIndex];
    }

    startRoll() {
        this.isRolling = true;
        this.rollStartTime = Date.now();
        // Utiliser la direction actuelle ou la dernière direction
        this.rollDirection = this.vector.h || this.lastNonZeroDirection || 1;
        this.lastNonZeroDirection = this.rollDirection;
    }

    update() {
        // Mettre à jour le vecteur de direction uniquement si on ne roule pas
        if (!this.isRolling) {
            this.vector.h = 0;
            if (held(this.keys, LEFT)) {
                this.vector.h = -1;
                this.lastNonZeroDirection = -1;
            }
            if (held(this.keys, RIGHT)) {
                this.vector.h = 1;
                this.lastNonZeroDirection = 1;
            }
        } else {
            // Pendant la roulade, forcer la direction
            this.vector.h = this.rollDirection;

            // Vérifier si la roulade est terminée
            if (Date.now() - this.rollStartTime >= this.rollDuration) {
                this.isRolling = false;
            }
        }

        // Actions spéciales. One sword key, three blows: which one is showing
        // was decided when the key went down.
        const swinging = this.keys.has(SWORD);
        this.attack1 = swinging && this.swing === 'attack1';
        this.attack2 = swinging && this.swing === 'attack2';
        this.attack3 = swinging && this.swing === 'attack3';
        this.magicAttack = this.keys.has(MAGIC);
        this.arrowShoot = this.keys.has(BOW);
        this.roll = this.isRolling;
    }
}
