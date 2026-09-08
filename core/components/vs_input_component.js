// core/components/vs_input_component.js - Arena controls
import { Component } from './component.js';
import {
    LEFT, RIGHT, UP, DOWN,
    JUMP, SWORD, BOW, MAGIC, SWALLOWED,
    normalise, isTyping, held
} from '../../constants/controls.js';

/**
 * The keyboard as the arena reads it.
 *
 * The bindings themselves live in constants/controls.js, shared with
 * Adventure's own Input component: one character, one pair of hands, one
 * layout. What is arena-specific is here - chiefly the aim, since up, down
 * and the diagonals feed the bow, which the solo game has no use for.
 *
 * The field names are the ones the VS systems already consume - `attack1` for
 * the sword, `arrowShoot` for the bow, `magicAttack` for the spectre - so a
 * binding change never reaches past this file. That is also what lets a bot's
 * BotInput stand in for this component unchanged.
 *
 * Named VSControls rather than VSInput to stay distinct from the VSInput
 * *system*, which is what turns these fields into movement.
 */

export class VSControls extends Component {
    constructor() {
        super();
        this.keys = new Set();
        this.vector = { h: 0, v: 0 };

        // Where the bow points. Follows the direction keys, and falls back to
        // the way the fighter is facing when no vertical key is held.
        this.aim = { x: 1, y: 0 };
        this.facing = 1;

        this.attack1 = false;      // Sword
        this.arrowShoot = false;   // Bow
        this.magicAttack = false;  // Spectre
        this.attack2 = false;
        this.attack3 = false;
        this.roll = false;
        this.isRolling = false;

        // Read by VSInput: releasing the key while still rising ends the climb
        // early, which is what gives the jump a range of heights rather than
        // one fixed arc.
        this.jumpHeld = false;

        this._onKeyDown = (e) => {
            if (isTyping(e.target)) return;

            const key = normalise(e.key);
            if (SWALLOWED.has(key)) e.preventDefault();

            this.keys.add(key);

            // Jump is edge-triggered: VSInput.tryJump consumes vector.v, so
            // holding space cannot climb the sky one frame at a time. A fresh
            // press is what buys the second jump - and one that arrives too
            // early to be used is held for a moment rather than thrown away.
            if (key === JUMP && !this.jumpHeld) {
                this.jumpHeld = true;
                this.vector.v = 1;
            }
        };

        this._onKeyUp = (e) => {
            const key = normalise(e.key);
            this.keys.delete(key);
            if (key === JUMP) this.jumpHeld = false;
        };

        // Keys held when the window loses focus would otherwise stay held
        // forever - a fighter walking into a wall until you alt-tab back.
        this._onBlur = () => {
            this.keys.clear();
            this.jumpHeld = false;
        };

        document.addEventListener('keydown', this._onKeyDown);
        document.addEventListener('keyup', this._onKeyUp);
        window.addEventListener('blur', this._onBlur);
    }

    /** Detaches the listeners. Called when the fighter leaves the arena. */
    dispose() {
        document.removeEventListener('keydown', this._onKeyDown);
        document.removeEventListener('keyup', this._onKeyUp);
        window.removeEventListener('blur', this._onBlur);
    }

    update() {
        const left = this.held(LEFT);
        const right = this.held(RIGHT);
        const up = this.held(UP);
        const down = this.held(DOWN);

        this.vector.h = (right ? 1 : 0) - (left ? 1 : 0);
        if (this.vector.h !== 0) this.facing = this.vector.h;

        this.setAim(this.vector.h, (down ? 1 : 0) - (up ? 1 : 0));

        this.attack1 = this.keys.has(SWORD);
        this.arrowShoot = this.keys.has(BOW);
        this.magicAttack = this.keys.has(MAGIC);
    }

    /**
     * Eight directions out of two axes.
     *
     * With no vertical key the shot goes where the fighter looks, which is the
     * old behaviour and what you want the vast majority of the time. Holding
     * up or down alone fires straight up or straight down; holding it with a
     * direction gives the diagonal.
     */
    setAim(h, v) {
        if (v === 0) {
            this.aim.x = this.facing;
            this.aim.y = 0;
            return;
        }
        if (h === 0) {
            this.aim.x = 0;
            this.aim.y = v;
            return;
        }
        const diagonal = Math.SQRT1_2;
        this.aim.x = h * diagonal;
        this.aim.y = v * diagonal;
    }

    held(group) {
        return held(this.keys, group);
    }
}
