/**
 * NicknameRenderSystem - Renders player nicknames above sprites
 * Displays player names with team colors
 *
 * Phase 4 Days 23-24
 */

import { System } from '../system.js';

export class NicknameRenderSystem extends System {
    constructor(game) {
        super(game);

        this.canvas = null;
        this.ctx = null;

        console.log('[NicknameRenderSystem] Initialized');
    }

    update(deltaTime) {
        if (!this.canvas || !this.ctx) {
            this.setupCanvas();
        }

        if (!this.canvas || !this.ctx) return;

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
        const gameWorld = document.querySelector('.game-world');
        if (!gameWorld) return;

        // Find or create canvas
        this.canvas = gameWorld.querySelector('canvas');
        if (!this.canvas) {
            console.warn('[NicknameRenderSystem] Canvas not found');
            return;
        }

        this.ctx = this.canvas.getContext('2d');
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
