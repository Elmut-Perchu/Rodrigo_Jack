// core/ui/touch_controls.js - A thumbstick and four buttons, for both modes
import { LEFT, RIGHT, UP, DOWN, JUMP, SWORD, BOW, MAGIC } from '../../constants/controls.js';
import { swordIcon, bowIcon, ghostIcon, jumpIcon } from '../vs_pixel_icons.js';

/**
 * The controls a phone gets instead of a keyboard.
 *
 * A stick under the right thumb, four buttons under the left: jump at the
 * bottom where it is pressed most and needs the least aim, the bow and the
 * sword out to either side, the spirit on top. The stick both walks and - in
 * the arena - aims, exactly as the direction keys do.
 *
 * ## Why this synthesises key events rather than writing to the input components
 *
 * Every rule that makes the fighter feel right lives behind the keyboard: the
 * double jump counts fresh presses, the jump buffer remembers one that arrived
 * too early, releasing the key cuts the climb short, the sword walks through
 * three blows on successive presses, the bow charges while held, the spirit
 * gauge fills while held and fires on a *fresh* press once full. Reaching past
 * all of that to set `input.attack1 = true` would mean re-deriving each rule
 * here, and then maintaining two copies of them that only diverge.
 *
 * So a button press dispatches the keydown its key would have produced, and a
 * release dispatches the keyup. The Input components never learn there was no
 * keyboard, which means a phone and a desktop play the same game by
 * construction rather than by inspection - and rebinding a key in
 * constants/controls.js moves the button with it, since the bindings below are
 * imported from there rather than spelled out again.
 *
 * The eight-way stick falls out of the same decision: the arena aims the bow
 * with the direction keys, so a diagonal on the stick is a diagonal shot with
 * nothing further to write.
 */

// One canonical key per direction. The binding sets hold every alias a player
// might press (arrows and ZQSD both); to *send* one we need to pick, so we
// take the first - still imported, so a rebinding is followed here too.
const KEY_LEFT = [...LEFT][0];
const KEY_RIGHT = [...RIGHT][0];
const KEY_UP = [...UP][0];
const KEY_DOWN = [...DOWN][0];

/**
 * The cluster, read as a compass.
 *
 * Jump sits at the bottom because it is the button pressed most often and the
 * one a thumb finds by falling onto it. The two weapons take the sides, where
 * they can be reached without letting go of jump. The spirit goes on top: it
 * is the slowest, most deliberate action of the three and the one whose
 * mispress costs the most.
 */
const BUTTONS = [
    { slot: 'up', key: MAGIC, name: 'Spectre', icon: ghostIcon, tint: '#9b59b6' },
    { slot: 'left', key: BOW, name: 'Arc', icon: bowIcon, tint: '#27ae60' },
    { slot: 'right', key: SWORD, name: 'Épée', icon: swordIcon, tint: '#e67e22' },
    { slot: 'down', key: JUMP, name: 'Saut', icon: jumpIcon, tint: '#3498db' }
];

// How far the thumb must push before a direction is read, as a fraction of
// the stick's travel. Generous, because a thumb resting on the stick drifts,
// and a fighter that walks off on its own is worse than one that needs a
// deliberate shove.
const DEAD_ZONE = 0.3;

export class TouchControls {
    /**
     * @param {object} options
     * @param {string} [options.mode]  'adventure' or 'vs'. Only affects the
     *        hint text: the arena aims with the stick, the solo game does not.
     */
    constructor(options = {}) {
        this.mode = options.mode || 'adventure';

        // What the stick is currently asking for, in screen terms: -1 is left
        // and up. Held so a move can be turned into the presses and releases
        // that changed, rather than a stream of keydowns.
        this.direction = { h: 0, v: 0 };

        // pointerId -> the key that pointer is holding down, so two thumbs on
        // two buttons release the right one each.
        this.heldByPointer = new Map();
        this.stickPointer = null;

        this.root = null;
        this.visible = false;
    }

    // === Building ===

    mount(parent = document.body) {
        if (this.root) return this;

        injectStyles();

        this.root = document.createElement('div');
        this.root.className = 'tc-root';
        this.root.hidden = true;

        this.root.appendChild(this.buildButtons());
        this.root.appendChild(this.buildStick());

        parent.appendChild(this.root);

        // A long press over a button would otherwise raise the browser's own
        // menu mid-fight - and a long press is how fullscreen is toggled
        // elsewhere on the page, so it has to be inert here specifically.
        this.root.addEventListener('contextmenu', event => event.preventDefault());

        // Anything that takes the page away takes the thumbs with it, and a
        // key left down would have the fighter walking into a wall on return.
        this.onBlur = () => this.releaseAll();
        window.addEventListener('blur', this.onBlur);
        document.addEventListener('visibilitychange', this.onBlur);

        return this;
    }

    buildButtons() {
        const pad = document.createElement('div');
        pad.className = 'tc-pad';

        BUTTONS.forEach(spec => {
            const button = document.createElement('div');
            button.className = `tc-btn tc-btn-${spec.slot}`;
            button.style.setProperty('--tint', spec.tint);
            button.setAttribute('role', 'button');
            button.setAttribute('aria-label', spec.name);

            const glyph = document.createElement('span');
            glyph.className = 'tc-glyph';
            glyph.style.backgroundImage = spec.icon('#f4f6f7');
            button.appendChild(glyph);

            const label = document.createElement('span');
            label.className = 'tc-label';
            label.textContent = spec.name;
            button.appendChild(label);

            this.wireButton(button, spec.key);
            pad.appendChild(button);
        });

        return pad;
    }

    buildStick() {
        const zone = document.createElement('div');
        zone.className = 'tc-stick-zone';

        this.stickBase = document.createElement('div');
        this.stickBase.className = 'tc-stick-base';

        this.stickKnob = document.createElement('div');
        this.stickKnob.className = 'tc-stick-knob';
        this.stickBase.appendChild(this.stickKnob);

        zone.appendChild(this.stickBase);
        this.wireStick(zone);

        return zone;
    }

    // === Buttons ===

    wireButton(element, key) {
        element.addEventListener('pointerdown', event => {
            event.preventDefault();
            // Captured so the keyup is guaranteed to reach us even if the
            // thumb rolls off the button before lifting - otherwise the key
            // stays down and the fighter swings forever.
            element.setPointerCapture(event.pointerId);
            this.heldByPointer.set(event.pointerId, key);
            element.classList.add('tc-active');
            press(key);
        });

        const lift = event => {
            if (!this.heldByPointer.has(event.pointerId)) return;
            this.heldByPointer.delete(event.pointerId);
            element.classList.remove('tc-active');
            release(key);
        };

        element.addEventListener('pointerup', lift);
        element.addEventListener('pointercancel', lift);
    }

    // === Stick ===

    wireStick(zone) {
        zone.addEventListener('pointerdown', event => {
            if (this.stickPointer !== null) return; // One thumb owns the stick
            event.preventDefault();
            zone.setPointerCapture(event.pointerId);
            this.stickPointer = event.pointerId;

            // The stick comes to the thumb rather than the other way round.
            // A fixed stick means looking down to find it, which in a fight
            // is the same as not having it.
            const bounds = zone.getBoundingClientRect();
            this.originX = event.clientX - bounds.left;
            this.originY = event.clientY - bounds.top;
            this.stickBase.style.left = `${this.originX}px`;
            this.stickBase.style.top = `${this.originY}px`;
            this.stickBase.classList.add('tc-active');

            this.moveStick(0, 0);
        });

        zone.addEventListener('pointermove', event => {
            if (event.pointerId !== this.stickPointer) return;
            event.preventDefault();
            const bounds = zone.getBoundingClientRect();
            this.moveStick(
                event.clientX - bounds.left - this.originX,
                event.clientY - bounds.top - this.originY
            );
        });

        const lift = event => {
            if (event.pointerId !== this.stickPointer) return;
            this.stickPointer = null;
            this.stickBase.classList.remove('tc-active');
            this.stickKnob.style.transform = 'translate(-50%, -50%)';
            this.applyDirection(0, 0);
        };

        zone.addEventListener('pointerup', lift);
        zone.addEventListener('pointercancel', lift);
    }

    /** Places the knob and turns the push into a compass direction. */
    moveStick(dx, dy) {
        const travel = this.stickBase.offsetWidth / 2 || 1;
        const distance = Math.hypot(dx, dy);

        // The knob stops at the rim, but the thumb may keep going: past the
        // edge the direction simply holds, which is what a thumb sliding off
        // the side of a small screen expects.
        const clamp = distance > travel ? travel / distance : 1;
        const knobX = dx * clamp;
        const knobY = dy * clamp;

        this.stickKnob.style.transform =
            `translate(calc(-50% + ${knobX}px), calc(-50% + ${knobY}px))`;

        const normX = knobX / travel;
        const normY = knobY / travel;

        this.applyDirection(axis(normX), axis(normY));
    }

    /**
     * Sends only what changed.
     *
     * Both axes are independent, so a thumb rolling from "left" to "down-left"
     * presses Down and leaves Left alone - which is what keeps a diagonal shot
     * in the arena from re-triggering the horizontal key every frame.
     */
    applyDirection(h, v) {
        if (h !== this.direction.h) {
            if (this.direction.h < 0) release(KEY_LEFT);
            if (this.direction.h > 0) release(KEY_RIGHT);
            if (h < 0) press(KEY_LEFT);
            if (h > 0) press(KEY_RIGHT);
            this.direction.h = h;
        }

        if (v !== this.direction.v) {
            if (this.direction.v < 0) release(KEY_UP);
            if (this.direction.v > 0) release(KEY_DOWN);
            if (v < 0) press(KEY_UP);
            if (v > 0) press(KEY_DOWN);
            this.direction.v = v;
        }
    }

    // === Showing and hiding ===

    /**
     * The overlay is only up while there is a fighter to drive.
     *
     * Hiding it also lets go of everything it was holding: a menu opened with
     * a direction pushed would otherwise come back to a fighter still walking.
     */
    setVisible(visible) {
        if (!this.root || visible === this.visible) return;
        this.visible = visible;
        this.root.hidden = !visible;
        if (!visible) this.releaseAll();
    }

    releaseAll() {
        this.heldByPointer.forEach(key => release(key));
        this.heldByPointer.clear();

        this.root?.querySelectorAll('.tc-active')
            .forEach(element => element.classList.remove('tc-active'));

        this.stickPointer = null;
        if (this.stickKnob) this.stickKnob.style.transform = 'translate(-50%, -50%)';
        this.applyDirection(0, 0);
    }

    destroy() {
        this.releaseAll();
        window.removeEventListener('blur', this.onBlur);
        document.removeEventListener('visibilitychange', this.onBlur);
        this.root?.remove();
        this.root = null;
    }
}

/** One axis of the stick, past its dead zone. */
function axis(value) {
    if (value > DEAD_ZONE) return 1;
    if (value < -DEAD_ZONE) return -1;
    return 0;
}

// === Speaking keyboard ===
//
// Dispatched on `document`, which is where both Input components listen. The
// event carries no target element, so the "never steal keys from a text field"
// guard in constants/controls.js sees no field and lets it through - correct,
// since a thumb on a game button is not typing.

function press(key) {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

function release(key) {
    document.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true, cancelable: true }));
}

// === Look ===

let stylesInjected = false;

function injectStyles() {
    if (stylesInjected) return;
    stylesInjected = true;

    const style = document.createElement('style');
    style.textContent = `
/* One button's diameter, and the whole layout expressed in terms of it. Sized
   off the short edge of the screen, so a button is the same fraction of a
   thumb's reach on a small phone and a large one, with a floor and a ceiling
   so it stays a button rather than becoming a dot or a slab. */
.tc-root {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 1800;
    /* The overlay itself is a hole: only the stick's zone and the four
       buttons take touches, so the arena and its menus stay reachable. */
    pointer-events: none;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
    -webkit-tap-highlight-color: transparent;
    font-family: 'Press Start 2P', sans-serif;

    --tc-btn: clamp(46px, 13vmin, 82px);
    --tc-gap: calc(var(--tc-btn) * 0.14);
    --tc-cluster: calc(var(--tc-btn) * 3 + var(--tc-gap) * 2);
    --tc-stick: clamp(96px, 26vmin, 168px);
}

.tc-root[hidden] { display: none; }

/* Four buttons in a diamond, on the left. Laid out on a 3x3 grid rather than
   by absolute offsets so the cluster resizes with the button. */
.tc-pad {
    position: absolute;
    left: max(12px, 3vw);
    bottom: max(12px, 4vh);
    width: var(--tc-cluster);
    height: var(--tc-cluster);
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    grid-template-rows: repeat(3, 1fr);
    gap: var(--tc-gap);
}

/* The weapon's colour under a dark vignette, rather than a colour mixed with
   a dark one. Same result, but background-color and a gradient image are two
   independent declarations: on a browser too old for one of them the button is
   merely flatter, where a single "background" shorthand carrying an
   unsupported colour function would drop out entirely and leave a transparent
   ring. */
.tc-btn {
    pointer-events: auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    border-radius: 50%;
    background-color: var(--tint);
    background-image: radial-gradient(circle at 34% 30%,
        rgba(255, 255, 255, 0.3), rgba(0, 0, 0, 0.62) 74%);
    border: 2px solid var(--tint);
    box-shadow: 0 3px 0 rgba(0, 0, 0, 0.55), 0 0 14px rgba(0, 0, 0, 0.45);
    transition: transform 0.06s ease, filter 0.06s ease;
}

/* A pressed button has to be obvious without being looked at directly: it
   sinks onto its own shadow and brightens. */
.tc-btn.tc-active {
    transform: translateY(2px) scale(0.94);
    filter: brightness(1.5);
    box-shadow: 0 1px 0 rgba(0, 0, 0, 0.55), 0 0 18px var(--tint);
}

.tc-btn-up    { grid-column: 2; grid-row: 1; }
.tc-btn-left  { grid-column: 1; grid-row: 2; }
.tc-btn-right { grid-column: 3; grid-row: 2; }
.tc-btn-down  { grid-column: 2; grid-row: 3; }

.tc-glyph {
    width: 46%;
    height: 46%;
    background-repeat: no-repeat;
    background-position: center;
    background-size: contain;
    image-rendering: pixelated;
    pointer-events: none;
}

/* Named as well as drawn: the icons are learnt in one match, and until they
   are, a word is faster than a guess. */
.tc-label {
    font-size: clamp(5px, 1.5vmin, 8px);
    color: rgba(255, 255, 255, 0.82);
    text-shadow: 1px 1px 0 rgba(0, 0, 0, 0.9);
    pointer-events: none;
    white-space: nowrap;
}

/* The stick's catchment: the whole lower right of the screen, invisible.
   A thumb should never have to find the stick - the stick appears where the
   thumb lands (see wireStick). */
.tc-stick-zone {
    position: absolute;
    right: 0;
    bottom: 0;
    width: min(46vw, 460px);
    height: min(62vh, 440px);
    pointer-events: auto;
    touch-action: none;
}

.tc-stick-base {
    position: absolute;
    /* Where it rests before the first touch, so the control is discoverable
       rather than a secret. */
    left: 55%;
    top: 62%;
    /* Width and height rather than aspect-ratio: the knob inside is sized as
       a percentage of it, and on a browser without aspect-ratio that would be
       a percentage of nothing. */
    width: var(--tc-stick);
    height: var(--tc-stick);
    transform: translate(-50%, -50%);
    border-radius: 50%;
    background: radial-gradient(circle,
        rgba(255, 255, 255, 0.08), rgba(0, 0, 0, 0.34) 70%);
    border: 2px solid rgba(236, 240, 241, 0.45);
    /* Visible enough at rest to be found without looking for it, faint enough
       not to compete with the arena it is drawn over. */
    opacity: 0.7;
    transition: opacity 0.15s ease;
    pointer-events: none;
}

.tc-stick-base.tc-active { opacity: 0.92; }

.tc-stick-knob {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 42%;
    height: 42%;
    transform: translate(-50%, -50%);
    border-radius: 50%;
    background: radial-gradient(circle at 34% 30%,
        rgba(255, 255, 255, 0.4), rgba(52, 73, 94, 0.95) 72%);
    border: 2px solid rgba(236, 240, 241, 0.7);
    box-shadow: 0 0 12px rgba(0, 0, 0, 0.6);
}
`;
    document.head.appendChild(style);
}
