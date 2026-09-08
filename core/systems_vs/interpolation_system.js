// core/systems_vs/interpolation_system.js - Where other people are, right now
import { System } from '../systems/system.js';

/**
 * Places networked opponents from their interpolation buffer, once per drawn
 * frame.
 *
 * This used to live inside VSMovement, which runs on the fixed physics step
 * of 1/120s. That is right for anything being simulated - a jump has to
 * measure the same on every machine - but wrong for anything being *watched*:
 * on a 120Hz screen the accumulator hands out one substep on some frames and
 * none on others, so a remote fighter was re-placed on roughly every other
 * frame and held still on the rest. The result is a fighter who advances in
 * small hops however clean the network is, and it gets worse the faster the
 * display.
 *
 * Drawing is a presentation concern, so it belongs on the presentation
 * cadence, next to VSRender. The buffer itself is read against wall-clock
 * time, so asking it more often is simply asking it for a fresher answer.
 *
 * Only opponents pass through here. The local player and any bot are
 * simulated on this machine and keep their positions from the physics step.
 */
export class VSInterpolate extends System {
    constructor(game) {
        super(game);

        // Once per drawn frame, like the rest of the presentation.
        this.fixedStep = false;
        this.game = game;
    }

    update() {
        this.game.remotePlayers.forEach(entity => {
            const network = entity.getComponent('networkPlayer');
            if (!network || network.simulated) return;

            const interpolation = entity.getComponent('interpolation');
            if (!interpolation || interpolation.enabled === false) return;

            const position = entity.getComponent('position');
            if (!position) return;

            const placed = interpolation.getInterpolatedPosition();
            if (!placed) return;

            position.x = placed.x;
            position.y = placed.y;
        });
    }
}
