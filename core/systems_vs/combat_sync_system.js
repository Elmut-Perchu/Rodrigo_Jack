/**
 * CombatSyncSystem - Client-side combat synchronization
 * Handles attack messages, hit events, and death notifications
 *
 * Phase 4 Days 21-22
 */

import { System } from '../system.js';

export class CombatSyncSystem extends System {
    constructor(game) {
        super(game);

        // Combat tracking
        this.attackCooldowns = new Map(); // playerId -> lastAttackTime
        this.cooldownDuration = 500; // 500ms between attacks

        console.log('[CombatSyncSystem] Initialized');
    }

    update(deltaTime) {
        if (!this.game.mode || this.game.mode !== 'vs') return;
        if (!this.game.networkClient || !this.game.networkClient.connected) return;

        // Listen for local player attacks
        this.checkLocalPlayerAttacks();
    }

    /**
     * Check for local player attack inputs
     * @private
     */
    checkLocalPlayerAttacks() {
        const localPlayer = this.getLocalPlayer();
        if (!localPlayer) return;

        const input = localPlayer.getComponent('input');
        const position = localPlayer.getComponent('position');
        const sprite = localPlayer.getComponent('sprite');
        const health = localPlayer.getComponent('health');

        if (!input || !position || !sprite || !health) return;
        if (health.currentHealth <= 0) return; // Dead players can't attack

        // Check cooldown
        const now = Date.now();
        const lastAttack = this.attackCooldowns.get(this.game.localPlayerId) || 0;
        if (now - lastAttack < this.cooldownDuration) return;

        // Check for attack inputs
        let attackType = null;
        if (input.keys['x'] || input.keys['X']) {
            attackType = 'melee';
        } else if (input.keys['c'] || input.keys['C']) {
            attackType = 'arrow';
        } else if (input.keys['v'] || input.keys['V']) {
            attackType = 'magic';
        }

        if (attackType) {
            this.sendAttack(attackType, position, sprite);
            this.attackCooldowns.set(this.game.localPlayerId, now);
        }
    }

    /**
     * Send attack message to server
     * @private
     * @param {string} attackType - 'melee', 'arrow', or 'magic'
     * @param {Object} position - Position component
     * @param {Object} sprite - Sprite component
     */
    sendAttack(attackType, position, sprite) {
        const attackData = {
            attackType: attackType,
            x: position.x,
            y: position.y,
            direction: sprite.facingRight ? 'right' : 'left',
            facingRight: sprite.facingRight,
            timestamp: Date.now()
        };

        this.game.networkClient.send('player_attack', attackData);

        console.log(`[CombatSyncSystem] Sent ${attackType} attack at (${position.x.toFixed(0)}, ${position.y.toFixed(0)})`);
    }

    /**
     * Get local player entity
     * @private
     * @returns {Entity|null}
     */
    getLocalPlayer() {
        for (const entity of this.game.entities) {
            const networkPlayer = entity.getComponent('networkPlayer');
            if (networkPlayer && networkPlayer.playerId === this.game.localPlayerId) {
                return entity;
            }
        }
        return null;
    }

    /**
     * Handle player_attack event from server
     * @param {Object} data - Attack data
     */
    handlePlayerAttack(data) {
        console.log(`[CombatSyncSystem] Player ${data.attackerId} used ${data.attackType} attack`);

        // Visual feedback (particles, animations, etc.)
        this.playAttackAnimation(data);
    }

    /**
     * Handle player_hit event from server
     * @param {Object} data - Hit data
     */
    handlePlayerHit(data) {
        console.log(`[CombatSyncSystem] Player ${data.victimId} hit for ${data.damage} damage (health: ${data.health})`);

        // Find victim entity
        const victim = this.game.players.get(data.victimId);
        if (!victim) return;

        // Update health
        const health = victim.getComponent('health');
        if (health) {
            health.currentHealth = data.health;
            console.log(`[CombatSyncSystem] Updated ${data.victimId} health to ${data.health}`);
        }

        // Visual feedback (damage numbers, screen shake, etc.)
        this.playHitEffect(victim, data);
    }

    /**
     * Handle player_death event from server
     * @param {Object} data - Death data
     */
    handlePlayerDeath(data) {
        console.log(`[CombatSyncSystem] Player ${data.victimName} killed by ${data.killerName}`);

        // Find victim entity
        const victim = this.game.players.get(data.victimId);
        if (!victim) return;

        // Update health and alive status
        const health = victim.getComponent('health');
        if (health) {
            health.currentHealth = 0;
        }

        // Visual feedback (death animation, fade out, etc.)
        this.playDeathAnimation(victim, data);

        // Update players alive count
        this.game.playersAlive--;
    }

    /**
     * Handle match_end event from server
     * @param {Object} data - Match end data
     */
    handleMatchEnd(data) {
        console.log(`[CombatSyncSystem] Match ended - Reason: ${data.reason}`);

        if (data.winnerId) {
            console.log(`[CombatSyncSystem] Winner: ${data.winnerName}`);
        }

        // Show game over screen
        this.showMatchEndScreen(data);
    }

    /**
     * Handle player_respawn event from server
     * @param {Object} data - Respawn data
     */
    handlePlayerRespawn(data) {
        console.log(`[CombatSyncSystem] Player ${data.playerId} respawned at (${data.x}, ${data.y})`);

        const player = this.game.players.get(data.playerId);
        if (!player) return;

        // Reset position and health
        const position = player.getComponent('position');
        const health = player.getComponent('health');

        if (position) {
            position.x = data.x;
            position.y = data.y;
        }

        if (health) {
            health.currentHealth = data.health;
        }

        // Visual feedback (spawn effect)
        this.playRespawnEffect(player);
    }

    /**
     * Play attack animation/effects
     * @private
     * @param {Object} data - Attack data
     */
    playAttackAnimation(data) {
        // Find attacker entity
        const attacker = this.game.players.get(data.attackerId);
        if (!attacker) return;

        const animation = attacker.getComponent('animation');
        if (!animation) return;

        // Play appropriate attack animation
        switch (data.attackType) {
            case 'melee':
                animation.currentAnimation = 'attack';
                break;
            case 'arrow':
                animation.currentAnimation = 'shoot';
                break;
            case 'magic':
                animation.currentAnimation = 'cast';
                break;
        }

        // TODO: Create visual effects (particles, projectiles, etc.)
    }

    /**
     * Play hit effect
     * @private
     * @param {Entity} victim - Victim entity
     * @param {Object} data - Hit data
     */
    playHitEffect(victim, data) {
        // Flash victim sprite
        const sprite = victim.getComponent('sprite');
        if (sprite) {
            // TODO: Implement damage flash effect
            console.log(`[CombatSyncSystem] Playing hit effect for ${data.victimId}`);
        }

        // TODO: Show damage numbers
        // TODO: Screen shake for local player if hit
    }

    /**
     * Play death animation
     * @private
     * @param {Entity} victim - Victim entity
     * @param {Object} data - Death data
     */
    playDeathAnimation(victim, data) {
        const animation = victim.getComponent('animation');
        if (animation) {
            animation.currentAnimation = 'death';
        }

        // TODO: Fade out sprite, show death particles, etc.
    }

    /**
     * Play respawn effect
     * @private
     * @param {Entity} player - Player entity
     */
    playRespawnEffect(player) {
        // TODO: Show spawn particles, invulnerability flash, etc.
        console.log('[CombatSyncSystem] Playing respawn effect');
    }

    /**
     * Show match end screen
     * @private
     * @param {Object} data - Match end data
     */
    showMatchEndScreen(data) {
        this.game.paused = true;

        // Update game over overlay
        const gameOverScreen = document.getElementById('game-over');
        const winnerText = document.getElementById('winner-text');

        if (gameOverScreen && winnerText) {
            if (data.winnerId) {
                winnerText.textContent = `${data.winnerName} Wins!`;
            } else {
                winnerText.textContent = 'Draw!';
            }

            gameOverScreen.style.display = 'flex';
        }
    }

    /**
     * Get combat stats
     * @returns {Object}
     */
    getCombatStats() {
        return {
            playersAlive: this.game.playersAlive,
            attackCooldown: this.cooldownDuration
        };
    }
}
