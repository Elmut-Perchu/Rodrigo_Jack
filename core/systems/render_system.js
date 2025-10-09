import { System } from './system.js';

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

            // Check required components first
            if (!position || !visual) return;

            // If already in DOM, update position if needed
            if (visual.div.parentElement) {
                // Only update if position changed (optimization)
                const currentLeft = parseInt(visual.div.style.left) || 0;
                const currentTop = parseInt(visual.div.style.top) || 0;
                if (currentLeft !== position.x || currentTop !== position.y) {
                    visual.div.style.left = `${position.x}px`;
                    visual.div.style.top = `${position.y}px`;
                    // Debug: Log first position update
                    if (currentLeft === 0 && currentTop === 0 && (position.x !== 0 || position.y !== 0)) {
                        console.log(`[RenderSystem] Updated position for entity ${entity.uuid.substring(0, 8)}: (${currentLeft},${currentTop}) → (${position.x},${position.y})`);
                    }
                }
                return;
            }

            // Skip if already in DOM via UUID check
            if (document.querySelector(`[uuid="${entity.uuid}"]`)) return;

            // Create and style the entity's div
            visual.div.setAttribute('uuid', entity.uuid);
            visual.div.style.position = 'absolute';
            visual.div.style.left = `${position.x}px`;
            visual.div.style.top = `${position.y}px`;
            visual.div.style.width = `${visual.width}px`;
            visual.div.style.height = `${visual.height}px`;
            if (visual.bgColor) visual.div.style.backgroundColor = visual.bgColor;

            // hitbox
            if (hitbox) {
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