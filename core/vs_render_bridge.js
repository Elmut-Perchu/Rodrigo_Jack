/**
 * VSRenderBridge - Bridge between VSSyncManager and ECS Render System
 * Converts simple player objects → visual divs with sprites
 *
 * This allows us to use the working sync logic from test_sync
 * while keeping the nice sprite rendering from Adventure mode
 */

import { PlayerAnimation } from './components/animation_component.js';

export class VSRenderBridge {
    constructor(game, syncManager) {
        this.game = game;
        this.syncManager = syncManager;

        // Map playerId → visual data
        this.playerVisuals = new Map();

        // Player colors (same as remote_player_create.js)
        this.PLAYER_COLORS = [
            { primary: '#FF4444', secondary: '#CC0000', name: 'Red' },
            { primary: '#4444FF', secondary: '#0000CC', name: 'Blue' },
            { primary: '#44FF44', secondary: '#00CC00', name: 'Green' },
            { primary: '#FFFF44', secondary: '#CCCC00', name: 'Yellow' }
        ];

        console.log('[VSRenderBridge] Initialized');
    }

    /**
     * Update all player visuals
     * Called by game loop after syncManager.update()
     */
    update() {
        // DEBUG: Log update calls
        if (!this._updateCount) this._updateCount = 0;
        this._updateCount++;

        if (this._updateCount % 60 === 0) {
            console.log(`[VSRenderBridge] Update ${this._updateCount}, players: ${this.syncManager.players.size}, visuals: ${this.playerVisuals.size}`);
            for (const [id, player] of this.syncManager.players) {
                console.log(`  - Player ${player.name} at (${player.x}, ${player.y})`);
            }
        }

        // Get all players from sync manager
        for (const [playerId, player] of this.syncManager.players) {
            let visual = this.playerVisuals.get(playerId);

            // Create visual if doesn't exist
            if (!visual) {
                console.log(`[VSRenderBridge] Creating visual for ${player.name}`);
                visual = this.createVisual(player);
                this.playerVisuals.set(playerId, visual);
            }

            // Update position
            this.updateVisual(visual, player);
        }

        // Remove visuals for players that left
        for (const [playerId, visual] of this.playerVisuals) {
            if (!this.syncManager.players.has(playerId)) {
                this.removeVisual(playerId);
            }
        }
    }

    /**
     * Create visual div for player
     */
    createVisual(player) {
        const color = this.PLAYER_COLORS[player.playerIndex % this.PLAYER_COLORS.length];

        // Create player div (72x72 to match sprite frame size)
        const div = document.createElement('div');
        div.className = 'character';
        div.style.position = 'absolute';
        div.style.width = '72px';
        div.style.height = '72px';
        div.style.left = `${player.x}px`;
        div.style.top = `${player.y}px`;

        // Add to game world
        const gameWorld = document.querySelector('.game-world');
        if (gameWorld) {
            gameWorld.appendChild(div);
        }

        // Create animation component
        const animation = new PlayerAnimation();
        animation.setState('idle');

        // Create nickname label
        const nickname = document.createElement('div');
        nickname.className = 'player-nickname';
        nickname.textContent = player.name;
        nickname.style.position = 'absolute';
        nickname.style.top = '-20px';
        nickname.style.left = '50%';
        nickname.style.transform = 'translateX(-50%)';
        nickname.style.fontSize = '10px';
        nickname.style.color = color.primary;
        nickname.style.fontWeight = 'bold';
        nickname.style.textAlign = 'center';
        nickname.style.whiteSpace = 'nowrap';
        nickname.style.pointerEvents = 'none';
        nickname.style.textShadow = '1px 1px 2px black';
        div.appendChild(nickname);

        // Create health bar
        const healthBar = document.createElement('div');
        healthBar.className = 'health-bar';
        healthBar.style.position = 'absolute';
        healthBar.style.top = '-10px';
        healthBar.style.left = '5px';
        healthBar.style.width = '100px';
        healthBar.style.height = '5px';
        healthBar.style.backgroundColor = 'rgba(0,0,0,0.5)';
        healthBar.style.border = '1px solid black';
        div.appendChild(healthBar);

        const healthFill = document.createElement('div');
        healthFill.className = 'health-fill';
        healthFill.style.position = 'absolute';
        healthFill.style.top = '0';
        healthFill.style.left = '0';
        healthFill.style.width = '100%';
        healthFill.style.height = '100%';
        healthFill.style.backgroundColor = '#2ecc71';
        healthFill.style.transition = 'width 0.3s';
        healthBar.appendChild(healthFill);

        console.log(`[VSRenderBridge] Created visual for ${player.name} (${color.name})`);

        return {
            div: div,
            animation: animation,
            nickname: nickname,
            healthBar: healthBar,
            healthFill: healthFill,
            lastAnimation: 'idle',
            playerId: player.id
        };
    }

    /**
     * Update visual div from player data
     */
    updateVisual(visual, player) {
        // Update position (smooth, already interpolated by syncManager)
        visual.div.style.left = `${player.x - 36}px`; // Center sprite (72/2)
        visual.div.style.top = `${player.y - 72}px`; // Place feet at y

        // Update animation if changed
        if (player.animation !== visual.lastAnimation) {
            visual.animation.setState(player.animation);
            visual.lastAnimation = player.animation;
        }

        // Update facing direction
        visual.animation.isFlipped = !player.facingRight;

        // Update animation frame
        visual.animation.updateAnimation(0.016); // Assume 60fps

        // Render sprite using background-image + background-position (like Adventure mode)
        const frameWidth = visual.animation.frameWidth;
        const frameHeight = visual.animation.frameHeight;

        // Get current frame info
        const frameIndex = visual.animation.currentSequence[visual.animation.currentFrame];
        const framePos = visual.animation.getFramePosition(frameIndex);

        // Set sprite sheet and frame position
        visual.div.style.backgroundImage = `url(${visual.animation.spriteSheet.src})`;
        visual.div.style.backgroundSize = `${frameWidth * visual.animation.columns}px ${frameHeight * visual.animation.rows}px`;
        visual.div.style.backgroundPosition = `-${framePos.x * frameWidth}px -${framePos.y * frameHeight}px`;
        visual.div.style.backgroundRepeat = 'no-repeat';

        // Handle flip
        if (visual.animation.isFlipped) {
            visual.div.style.transform = 'scaleX(-1)';
        } else {
            visual.div.style.transform = 'scaleX(1)';
        }

        // Update health bar
        const healthPercent = (player.health / 100) * 100;
        visual.healthFill.style.width = `${healthPercent}%`;

        // Change health bar color based on health
        if (healthPercent > 60) {
            visual.healthFill.style.backgroundColor = '#2ecc71'; // Green
        } else if (healthPercent > 30) {
            visual.healthFill.style.backgroundColor = '#f39c12'; // Orange
        } else {
            visual.healthFill.style.backgroundColor = '#e74c3c'; // Red
        }

        // Hide if dead
        if (!player.isAlive) {
            visual.div.style.opacity = '0.5';
        } else {
            visual.div.style.opacity = '1';
        }
    }

    /**
     * Remove visual
     */
    removeVisual(playerId) {
        const visual = this.playerVisuals.get(playerId);
        if (visual && visual.div) {
            visual.div.remove();
            this.playerVisuals.delete(playerId);
            console.log(`[VSRenderBridge] Removed visual for player ${playerId}`);
        }
    }

    /**
     * Cleanup all visuals
     */
    cleanup() {
        for (const [playerId, visual] of this.playerVisuals) {
            if (visual.div) {
                visual.div.remove();
            }
        }
        this.playerVisuals.clear();
        console.log('[VSRenderBridge] Cleanup complete');
    }
}
