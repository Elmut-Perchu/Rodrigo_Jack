// core/components/vs_input_component.js - Arena controls
import { Component } from './component.js';

/**
 * The keyboard as the arena reads it.
 *
 * Deliberately separate from the Adventure `Input` component even though the
 * two produce the same fields. The arena needs to *aim* - up, down and the
 * diagonals feed the bow - which means the direction keys can no longer double
 * as the jump, so every binding downstream of that had to move. Adventure's
 * controls are untouched.
 *
 *   arrows / ZQSD   move and aim
 *   space           jump (and the second jump)
 *   W               bow    - hold to draw further
 *   X               sword
 *   C               spectre - hold to charge, press again to send it
 *
 * The field names are the ones the VS systems already consume - `attack1` for
 * the sword, `arrowShoot` for the bow, `magicAttack` for the spectre - so what
 * changed here is which key raises them, not the contract. That is also what
 * lets a bot's BotInput stand in for this component unchanged.
 *
 * Named VSControls rather than VSInput to stay distinct from the VSInput
 * *system*, which is what turns these fields into movement.
 */

// Held keys are normalised to lowercase, so a fighter with caps lock on, or
// holding shift, still moves.
const LEFT = new Set(['arrowleft', 'q']);
const RIGHT = new Set(['arrowright', 'd']);
const UP = new Set(['arrowup', 'z']);
const DOWN = new Set(['arrowdown', 's']);

const JUMP = ' ';
const SWORD = 'x';
const BOW = 'w';
const SPECTRE = 'c';

// Keys the browser would otherwise act on itself: space and the arrows scroll
// the page, which is very noticeable now that the menus scroll.
const SWALLOWED = new Set([
    ' ', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown'
]);

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

        this._jumpHeld = false;

        this._onKeyDown = (e) => {
            if (isTyping(e.target)) return;

            const key = normalise(e.key);
            if (SWALLOWED.has(key)) e.preventDefault();

            this.keys.add(key);

            // Jump is edge-triggered: VSInput.tryJump consumes vector.v and
            // zeroes it, so holding space cannot climb the sky one frame at a
            // time. A fresh press is what buys the second jump.
            if (key === JUMP && !this._jumpHeld) {
                this._jumpHeld = true;
                this.vector.v = 1;
            }
        };

        this._onKeyUp = (e) => {
            const key = normalise(e.key);
            this.keys.delete(key);
            if (key === JUMP) this._jumpHeld = false;
        };

        // Keys held when the window loses focus would otherwise stay held
        // forever - a fighter walking into a wall until you alt-tab back.
        this._onBlur = () => {
            this.keys.clear();
            this._jumpHeld = false;
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
        this.magicAttack = this.keys.has(SPECTRE);
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
        for (const key of group) {
            if (this.keys.has(key)) return true;
        }
        return false;
    }
}

function normalise(key) {
    return typeof key === 'string' ? key.toLowerCase() : key;
}

/** Never steal keys from the chat box or a nickname field. */
function isTyping(target) {
    if (!target || !target.tagName) return false;
    const tag = target.tagName.toLowerCase();
    return tag === 'input' || tag === 'textarea' || target.isContentEditable === true;
}
