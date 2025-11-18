import { System } from './system.js';

export class Render extends System {
    constructor(container) {
        super();
        this.container = container;
        this.gameWorld = this.container.querySelector('.game-world');

        // DIAGNOSTIC MODE: Track conflicts with NetworkSyncSystem
        this.diagnosticMode = true; // SET TO FALSE after audit
        this.updateStats = {
            totalUpdates: 0,
            remotePlayerUpdates: 0,
            lastLogTime: 0
        };
        this.logCounter = 0;
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
                // Only update if position changed (optimization)
                const currentLeft = parseInt(visual.div.style.left) || 0;
                const currentTop = parseInt(visual.div.style.top) || 0;

                // CRITICAL FIX: Always update remote players (interpolation creates micro-movements)
                // parseInt() rounds values, so 1200.6 === 1200, causing skipped updates
                const needsUpdate = (networkPlayer && !networkPlayer.isLocal)
                    ? true  // Remote: always update every frame
                    : (currentLeft !== Math.round(position.x) || currentTop !== Math.round(position.y));

                if (needsUpdate) {
                    visual.div.style.left = `${position.x}px`;
                    visual.div.style.top = `${position.y}px`;
                    this.updateStats.totalUpdates++;

                    // DIAGNOSTIC: Track remote player updates
                    if (networkPlayer && !networkPlayer.isLocal) {
                        this.updateStats.remotePlayerUpdates++;
                        this.logCounter++;

                        // Log every 60 updates (~1 second at 60fps)
                        if (this.diagnosticMode && this.logCounter % 60 === 0) {
                            const deltaX = currentLeft - position.x;
                            const deltaY = currentTop - position.y;
                            console.log(`
║ 🎨 [RENDER CONFLICT?] RenderSystem also updated visual.div!
║ Player: ${networkPlayer.playerName}
║ Changed: (${currentLeft},${currentTop}) → (${position.x.toFixed(1)},${position.y.toFixed(1)})
║ Delta: (${deltaX.toFixed(1)}, ${deltaY.toFixed(1)})
║ ⚠️  If NetworkSyncSystem also logs, this is a RACE CONDITION!`);
                        }
                    }
                }

                // Log stats every 5 seconds
                const now = performance.now();
                if (this.diagnosticMode && (now - this.updateStats.lastLogTime) > 5000) {
                    console.log(`
📊 [RENDER STATS] 5-second summary:
   - Total visual updates: ${this.updateStats.totalUpdates}
   - Remote player updates: ${this.updateStats.remotePlayerUpdates}
   - Update rate: ${(this.updateStats.totalUpdates / 5).toFixed(1)} Hz`);

                    this.updateStats.totalUpdates = 0;
                    this.updateStats.remotePlayerUpdates = 0;
                    this.updateStats.lastLogTime = now;
                }

                return;
            }

            // Skip if already in DOM via UUID check
            if (document.querySelector(`[uuid="${entity.uuid}"]`)) return;

            // Debug: Log initial rendering for network players
            if (networkPlayer) {
                const playerType = networkPlayer.isLocal ? 'Local' : 'Remote';
                console.log(`[RenderSystem] ${playerType} player "${networkPlayer.playerName}" initial render at (${position.x}, ${position.y})`);
            }

            // Create and style the entity's div
            visual.div.setAttribute('uuid', entity.uuid);
            visual.div.style.position = 'absolute';
            visual.div.style.left = `${position.x}px`;
            visual.div.style.top = `${position.y}px`;
            visual.div.style.width = `${visual.width}px`;
            visual.div.style.height = `${visual.height}px`;
            if (visual.bgColor) visual.div.style.backgroundColor = visual.bgColor;

            // hitbox
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