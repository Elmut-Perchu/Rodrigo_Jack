/**
 * NicknameRenderSystem - Renders player nicknames above sprites
 * Displays player names with team colors
 *
 * Phase 4 Days 23-24
 */

import { System } from '../systems/system.js';

export class NicknameRenderSystem extends System {
    constructor(game) {
        super(game);

        this.canvas = null;
        this.ctx = null;
        this.setupAttempted = false;
        this.setupWarningShown = false;

        console.log('[NicknameRenderSystem] Initialized');
    }

    update(deltaTime) {
        // Try to setup canvas if not ready
        if (!this.canvas || !this.ctx) {
            this.setupCanvas();
        }

        // Skip rendering if canvas still not ready (don't spam console)
        if (!this.canvas || !this.ctx) {
            return; // Canvas not ready yet, will retry next frame
        }

        // Clear canvas before rendering (prevent ghosting)
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Render all player nicknames
        for (const entity of this.game.entities) {
            const nickname = entity.getComponent('nickname');
            const position = entity.getComponent('position');
            const property = entity.getComponent('property');

            if (!nickname || !position || !nickname.visible) continue;
            if (property && !property.isAlive) continue; // Don't show names for dead players

            this.renderNickname(entity, nickname, position);
        }
    }

    /**
     * Setup canvas reference
     * @private
     */
    setupCanvas() {
        // Prevent multiple setup attempts from spamming console
        if (this.setupAttempted && !this.canvas) {
            // Already tried and failed, don't spam console
            return;
        }

        this.setupAttempted = true;

        // Find canvas by ID (vs_game.html) or inside .game-world (adventure mode)
        this.canvas = document.getElementById('nickname-canvas');

        if (!this.canvas) {
            // Fallback: look inside .game-world (adventure mode)
            const gameWorld = document.querySelector('.game-world');
            if (gameWorld) {
                this.canvas = gameWorld.querySelector('canvas');
            }
        }

        if (!this.canvas) {
            // Only log warning once (not every frame)
            if (!this.setupWarningShown) {
                console.warn('[NicknameRenderSystem] Canvas not found - will retry on next frame');
                this.setupWarningShown = true;
            }
            // Reset setupAttempted so we can retry on next frame
            this.setupAttempted = false;
            return;
        }

        console.log('[NicknameRenderSystem] Canvas setup successful');

        // Set canvas size to match window
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;

        this.ctx = this.canvas.getContext('2d');

        // Resize canvas when window resizes
        window.addEventListener('resize', () => {
            if (this.canvas) {
                this.canvas.width = window.innerWidth;
                this.canvas.height = window.innerHeight;
                console.log(`[NicknameRenderSystem] Canvas resized to ${this.canvas.width}x${this.canvas.height}`);
            }
        });
    }

    /**
     * Render player nickname
     * @private
     * @param {Entity} entity - Player entity
     * @param {Object} nickname - Nickname component
     * @param {Object} position - Position component
     */
    renderNickname(entity, nickname, position) {
        if (!this.ctx) return;

        // Get camera offset
        const camera = this.getCameraOffset();

        // Calculate screen position
        const screenX = position.x - camera.x;
        const screenY = position.y - camera.y + nickname.offsetY;

        // Setup text style
        this.ctx.save();
        this.ctx.font = `bold ${nickname.fontSize}px Arial`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'bottom';

        // Measure text for background
        const textMetrics = this.ctx.measureText(nickname.text);
        const textWidth = textMetrics.width;
        const textHeight = nickname.fontSize;

        // Draw background (semi-transparent)
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        this.ctx.fillRect(
            screenX - textWidth / 2 - 2,
            screenY - textHeight - 2,
            textWidth + 4,
            textHeight + 4
        );

        // Draw outline (black)
        this.ctx.strokeStyle = 'black';
        this.ctx.lineWidth = 3;
        this.ctx.strokeText(nickname.text, screenX, screenY);

        // Draw text (player color)
        this.ctx.fillStyle = nickname.color;
        this.ctx.fillText(nickname.text, screenX, screenY);

        this.ctx.restore();
    }

    /**
     * Get camera offset
     * @private
     * @returns {Object} - Camera offset {x, y}
     */
    getCameraOffset() {
        // Check if there's a camera component
        for (const entity of this.game.entities) {
            const camera = entity.getComponent('camera');
            const position = entity.getComponent('position');

            if (camera && position) {
                // Calculate camera offset (center on camera target)
                const canvasWidth = this.canvas ? this.canvas.width : 640;
                const canvasHeight = this.canvas ? this.canvas.height : 360;

                return {
                    x: position.x - canvasWidth / 2,
                    y: position.y - canvasHeight / 2
                };
            }
        }

        // No camera found, use 0,0
        return { x: 0, y: 0 };
    }

    /**
     * Update nickname text
     * @param {Entity} entity - Player entity
     * @param {string} newText - New nickname text
     */
    updateNickname(entity, newText) {
        const nickname = entity.getComponent('nickname');
        if (nickname) {
            nickname.text = newText;
        }
    }

    /**
     * Toggle nickname visibility
     * @param {Entity} entity - Player entity
     * @param {boolean} visible - Visibility state
     */
    setNicknameVisible(entity, visible) {
        const nickname = entity.getComponent('nickname');
        if (nickname) {
            nickname.visible = visible;
        }
    }
}
