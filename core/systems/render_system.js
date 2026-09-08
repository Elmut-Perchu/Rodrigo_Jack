import { System } from './system.js';

/**
 * Puts entities on the page and keeps them where they belong.
 *
 * Two things were costing real frame time here and neither was doing any work:
 *
 *   The position was read back out of the DOM every frame - parseInt over
 *   div.style.left and .top, for every entity - purely to decide whether it
 *   had changed. On a map with three hundred entities that is thirty-five
 *   thousand string parses a second to answer a question the system already
 *   knew the answer to. Visual.place() remembers what it drew instead, and
 *   moves the div with a transform rather than left/top, which keeps the
 *   browser out of layout entirely (see visual_component.js).
 *
 *   A diagnostic pass left over from the VS synchronisation work - marked
 *   "SET TO FALSE after audit" and never set to false - counted entities every
 *   300 frames and printed a report to the console every five seconds, in
 *   every session, for everyone.
 *
 */
export class Render extends System {
    constructor(container) {
        super();
        this.container = container;
        this.gameWorld = this.container.querySelector('.game-world');
    }

    update() {
        this.entities.forEach((entity) => {
            const visual = entity.getComponent('visual');
            const position = entity.getComponent('position');
            const hitbox = entity.getComponent('circle_hitbox');
            const networkPlayer = entity.getComponent('networkPlayer');

            // Check required components first
            if (!position || !visual) return;

            // If already in DOM, update position if needed
            if (visual.div.parentElement) {
                visual.place(position.x, position.y);
                return;
            }

            // Skip if already in DOM via UUID check
            if (document.querySelector(`[uuid="${entity.uuid}"]`)) return;

            // Create and style the entity's div
            visual.div.setAttribute('uuid', entity.uuid);
            visual.div.style.position = 'absolute';
            // Pinned at the origin: everything after this is a transform, so
            // layout never has to think about this element again.
            visual.div.style.left = '0';
            visual.div.style.top = '0';
            visual.div.style.width = `${visual.width}px`;
            visual.div.style.height = `${visual.height}px`;
            visual.place(position.x, position.y);
            if (visual.bgColor) visual.div.style.backgroundColor = visual.bgColor;

            // hitbox - only present when tracing is on (see CircleHitbox)
            if (hitbox && hitbox.circles && hitbox.circles.collision) {
                hitbox.circles.collision.setAttribute('uuid', entity.uuid);
                this.gameWorld.appendChild(hitbox.circles.collision)
                hitbox.circles.melee.setAttribute('uuid', entity.uuid);
                this.gameWorld.appendChild(hitbox.circles.melee)
                hitbox.circles.ranged.setAttribute('uuid', entity.uuid);
                this.gameWorld.appendChild(hitbox.circles.ranged)
            }

            // Add to game world instead of container
            this.gameWorld.appendChild(visual.div);
        });
    }
}
