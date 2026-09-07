// core/components/bot_input_component.js
import { Component } from './component.js';

/**
 * A keyboard-shaped input that nobody types on.
 *
 * The whole VS pipeline - VSInput, VSBow, VSRender's animation selection -
 * already knows how to drive a fighter from an Input component. Giving the bot
 * the same shape means the AI only has to decide *which keys are held*, and
 * every existing system moves it, swings its sword and animates it without
 * knowing a machine is at the controls.
 *
 * The real Input class cannot be reused: it attaches document-level keydown
 * listeners in its constructor, so a bot built on it would mirror whatever the
 * human player pressed.
 */
export class BotInput extends Component {
    constructor() {
        super();
        this.vector = { h: 0, v: 0 };
        this.jump = 0;

        // Bots jump to full height. VSInput cuts a jump short when this goes
        // false partway up; deciding when a shorter hop is the better move is
        // a question for VSBot, not something to leave to a missing field.
        this.jumpHeld = true;

        // Where the bow points, exactly as VSControls reports it. A bot that
        // only ever fires along the ground would be unable to answer a shot
        // from a ledge.
        this.aim = { x: 1, y: 0 };
        this.facing = 1;

        this.attack1 = false;
        this.attack2 = false;
        this.attack3 = false;
        this.magicAttack = false;
        this.arrowShoot = false;
        this.roll = false;

        this.isRolling = false;
    }

    /**
     * No-op: VSInput calls this every frame expecting the component to read
     * the keyboard. The bot's decisions are written straight into the fields
     * above by VSBot, which runs first.
     */
    update() {}

    /** Clears the one-frame action presses. Held states are set again by VSBot. */
    releaseActions() {
        this.attack1 = false;
        this.attack2 = false;
        this.attack3 = false;
        this.magicAttack = false;
    }
}
