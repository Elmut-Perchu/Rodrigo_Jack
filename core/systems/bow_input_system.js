// core/systems/bow_input_system.js
import { System } from './system.js';

/**
 * Système qui gère la touche de l'arc pour le tir
 * Détecte press/hold/release et met à jour BowStateComponent
 */
export class BowInputSystem extends System {
    constructor() {
        super();
        this.drawWasPressed = false; // Track previous frame state
    }

    update() {
        // Trouver le player
        const player = Array.from(this.entities).find(e => e.getComponent('input'));
        if (!player) return;

        const input = player.getComponent('input');
        const bowState = player.getComponent('bow_state');
        const animation = player.getComponent('animation');

        if (!input || !bowState || !animation) return;

        const drawing = input.arrowShoot; // the bow key (see constants/controls.js)

        // Détection PRESS (transition false → true)
        if (drawing && !this.drawWasPressed) {
            this.handleSpacePress(player, bowState, input, animation);
        }

        // Détection HOLD (reste true)
        if (drawing && this.drawWasPressed) {
            this.handleSpaceHold(player, bowState, animation);
        }

        // Détection RELEASE (transition true → false)
        if (!drawing && this.drawWasPressed) {
            this.handleSpaceRelease(player, bowState, animation);
        }

        // Update previous state
        this.drawWasPressed = drawing;
    }

    /**
     * BOW PRESS: Démarre la charge si conditions OK
     */
    handleSpacePress(player, bowState, input, animation) {
        // Annuler si l'épée est active
        if (input.attack1 || input.attack2 || input.attack3) {
            return;
        }

        // Annuler si pas de flèches
        if (bowState.currentArrows <= 0) {
            // TODO: Add audio feedback "no arrows"
            return;
        }

        // Démarrer charge
        if (bowState.startCharge()) {
            // Capturer facing direction au moment du press
            const visual = player.getComponent('visual');
            if (visual) {
                bowState.facingDirection.x = animation.isFlipped ? -1 : 1;
                bowState.facingDirection.y = 0; // MVP: left/right uniquement
            }

            // Lancer animation player 'arrowShoot'
            animation.setState('arrowShoot');

            // TODO: Add audio "bow_draw"
        }
    }

    /**
     * BOW HOLD: Maintenir l'état charging
     */
    handleSpaceHold(player, bowState, animation) {
        // Si l'épée est sortie pendant le hold → annulation
        const input = player.getComponent('input');
        if (input.attack1 || input.attack2 || input.attack3) {
            this.cancelCharge(player, bowState, animation);
            return;
        }

        // Maintenir animation arrowShoot en boucle
        if (bowState.state === 'charging') {
            animation.setState('arrowShoot');
        }
    }

    /**
     * BOW RELEASE: Tirer si charge complète, sinon annuler
     */
    handleSpaceRelease(player, bowState, animation) {
        if (bowState.state !== 'charging') return;

        // Vérifier si charge complète (1sec écoulée)
        if (bowState.isChargeComplete()) {
            // Marquer pour spawn (ArrowSpawnSystem s'en charge)
            bowState.state = 'ready_to_shoot'; // Nouvel état temporaire
            // TODO: Add audio "bow_release"
        } else {
            // Charge incomplète: annulation
            this.cancelCharge(player, bowState, animation);
        }
    }

    /**
     * Annule la charge et retour à idle
     */
    cancelCharge(player, bowState, animation) {
        bowState.cancelCharge();
        animation.setState('idle');
        // TODO: Add audio "bow_cancel" (optionnel)
    }
}
