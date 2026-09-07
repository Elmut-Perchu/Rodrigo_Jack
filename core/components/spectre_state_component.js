// core/components/spectre_state_component.js
import { Component } from './component.js';

/**
 * A fighter's spirit gauge.
 *
 * Carried by everyone this machine simulates - the local player and any bot -
 * so the cost of a spectre is the same whoever pays it.
 */
export class SpectreState extends Component {
    constructor() {
        super();
        this.charge = 0;          // 0 .. 1
        this.channeling = false;
        this.lastCastAt = 0;
    }

    /** Full gauge: a spectre is available. */
    get ready() {
        return this.charge >= 1;
    }

    /** Spends the gauge. */
    spend() {
        if (!this.ready) return false;
        this.charge = 0;
        this.lastCastAt = performance.now();
        return true;
    }
}
