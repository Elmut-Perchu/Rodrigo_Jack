// core/systems_vs/vs_wrap_system.js - The arena has no outside
import { System } from '../systems/system.js';
import { wrapValue } from '../../constants/vs_wrap_constants.js';

/**
 * Carries anything that leaves the arena back in through the opposite edge.
 *
 * Runs between movement and collision, which is the only place it works: the
 * body is put on the far side *before* the tiles there get a say, so a fighter
 * arriving in a passage is resolved against that passage in the same step
 * rather than spending a frame inside whatever it landed in.
 *
 * Only bodies simulated on this machine are moved. A networked opponent's
 * position is computed by their own client and arrives already wrapped;
 * wrapping it a second time here would send them straight back out again.
 * Their smooth crossing is the interpolation's job (see Interpolation).
 *
 * The edge is measured at the body's centre, not its corner, so a fighter
 * changes side when their middle does. Doing it on the sprite's top-left made
 * the swap land visibly early on one side and late on the other.
 */
export class VSWrap extends System {
    constructor(game) {
        super(game);

        // Part of the physics, stepped at the fixed rate with the rest of it.
        this.fixedStep = true;
        this.game = game;
    }

    update() {
        const arena = this.game.arena;
        if (!arena || !(arena.width > 0) || !(arena.height > 0)) return;

        this.entities.forEach((entity) => {
            if (!this.travels(entity)) return;
            this.wrap(entity, arena);
        });
    }

    /** Whether this body is ours to carry across. */
    travels(entity) {
        const arrow = entity.getComponent('arrow');
        if (arrow) {
            // A spent arrow is scenery waiting to be picked up: it belongs to
            // the wall it is stuck in, on the side it stuck to.
            return arrow.state === 'flying' || arrow.state === 'falling';
        }

        if (entity.getComponent('spectre')) return true;

        const networkPlayer = entity.getComponent('networkPlayer');
        return !!(networkPlayer && networkPlayer.simulated);
    }

    wrap(entity, arena) {
        const position = entity.getComponent('position');
        if (!position) return;

        const centre = this.centreOf(entity, position);

        // The centre is what wraps; the sprite follows by the same amount, so
        // whatever offset it has from its own body is preserved.
        const wrappedX = wrapValue(centre.x, arena.width);
        const wrappedY = wrapValue(centre.y, arena.height);

        if (wrappedX !== centre.x) position.x += wrappedX - centre.x;
        if (wrappedY !== centre.y) position.y += wrappedY - centre.y;
    }

    /**
     * Where this body actually is.
     *
     * Fighters carry a hitbox that knows its own offset inside a 110px sprite
     * whose feet are well below its middle; everything else is centred in its
     * own frame.
     */
    centreOf(entity, position) {
        const visual = entity.getComponent('visual');
        const hitbox = entity.getComponent('circle_hitbox');

        if (hitbox && visual && typeof hitbox.getCircleCenter === 'function') {
            return hitbox.getCircleCenter(position, visual);
        }
        if (visual) {
            return { x: position.x + visual.width / 2, y: position.y + visual.height / 2 };
        }
        return { x: position.x, y: position.y };
    }
}
