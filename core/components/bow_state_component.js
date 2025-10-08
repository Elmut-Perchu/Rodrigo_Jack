// core/components/bow_state_component.js
import { Component } from './component.js';
import { ARROW_CONSTANTS } from '../../constants/arrow_constants.js';

export class BowState extends Component {
    constructor() {
        super();
        this.state = 'idle'; // 'idle' | 'charging' | 'ready_to_shoot' | 'cooldown'
        this.chargeStartTime = null; // Timestamp début charge
        this.currentArrows = ARROW_CONSTANTS.STARTING_ARROWS; // 3 au départ
        this.maxArrows = ARROW_CONSTANTS.MAX_ARROWS; // 7 max
        this.facingDirection = { x: 1, y: 0 }; // Direction tir (left/right)
    }

    /**
     * Vérifie si la charge est complète (1sec écoulée)
     */
    isChargeComplete() {
        if (this.state !== 'charging' || !this.chargeStartTime) return false;
        return (performance.now() - this.chargeStartTime) >= ARROW_CONSTANTS.CHARGE_TIME;
    }

    /**
     * Démarre la charge
     */
    startCharge() {
        if (this.state === 'idle' && this.currentArrows > 0) {
            this.state = 'charging';
            this.chargeStartTime = performance.now();
            return true;
        }
        return false;
    }

    /**
     * Annule la charge (retour idle)
     */
    cancelCharge() {
        this.state = 'idle';
        this.chargeStartTime = null;
    }

    /**
     * Consomme une flèche et retourne à idle
     */
    shoot() {
        if (this.currentArrows > 0) {
            this.currentArrows--;
            this.state = 'idle';
            this.chargeStartTime = null;
            return true;
        }
        return false;
    }

    /**
     * Récupère une flèche
     */
    pickupArrow() {
        if (this.currentArrows < this.maxArrows) {
            this.currentArrows++;
            return true;
        }
        return false;
    }
}
