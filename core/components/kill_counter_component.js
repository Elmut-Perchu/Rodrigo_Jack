// core/components/kill_counter_component.js
import { Component } from './component.js';
import { ui } from '../mobile.js';

export class KillCounter extends Component {
    constructor() {
        super();
        this.countDisplay = this.createKillCountDisplay();
    }

    /**
     * The kill tally, under the hearts.
     *
     * It used to sit at the top right, on top of the score panel - the two
     * were drawn one across the other and neither could be read. The top left
     * has nothing below the three hearts, so the counter goes there: no
     * measuring of a panel it does not own, and no collision to reappear the
     * next time that panel grows a line.
     */
    createKillCountDisplay() {
        const display = document.createElement('div');
        display.style.position = 'fixed';
        display.style.top = `${ui(56)}px`; // Sous les vies
        display.style.left = `${ui(20)}px`;
        display.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        display.style.color = '#FF5555'; // Rouge pour représenter les ennemis tués
        display.style.padding = `${ui(10)}px ${ui(15)}px`;
        display.style.borderRadius = `${ui(10)}px`;
        display.style.fontSize = `${ui(18)}px`;
        display.style.fontFamily = "'Press Start 2P', sans-serif";
        display.style.zIndex = '1000';
        document.body.appendChild(display);
        return display;
    }

    updateDisplay(count) {
        this.countDisplay.textContent = `Ennemis vaincus: ${count}`;
    }
}