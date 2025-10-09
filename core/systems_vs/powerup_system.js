/**
 * PowerUpSystem - Manages power-up collection and effects in VS mode
 * Handles respawn, collision detection, and active effect management
 *
 * Phase 5 Days 25-27
 */

import { System } from '../system.js';

export class PowerUpSystem extends System {
    constructor(game) {
        super(game);

        this.checkInterval = 100; // Check for respawn every 100ms
        this.lastCheck = 0;

        console.log('[PowerUpSystem] Initialized');
    }

    update(deltaTime) {
        if (!this.game.mode || this.game.mode !== 'vs') return;

        this.lastCheck += deltaTime;

        // Check power-up respawns
        if (this.lastCheck >= this.checkInterval) {
            this.checkRespawns();
            this.lastCheck = 0;
        }

        // Update active effects on players
        this.updatePlayerEffects();

        // Check for power-up collection (local player only)
        this.checkPowerUpCollection();
    }

    /**
     * Check for power-up respawns
     * @private
     */
    checkRespawns() {
        for (const entity of this.game.entities) {
            const powerup = entity.getComponent('powerup');
            if (!powerup) continue;

            if (powerup.shouldRespawn()) {
                powerup.respawn();

                // Make visible again
                const sprite = entity.getComponent('sprite');
                if (sprite) {
                    sprite.visible = true;
                }
            }
        }
    }

    /**
     * Update active power-up effects on players
     * @private
     */
    updatePlayerEffects() {
        for (const entity of this.game.entities) {
            const activePowerup = entity.getComponent('activePowerup');
            if (!activePowerup) continue;

            // Remove expired effects
            const expired = activePowerup.updateEffects();

            // Notify if effects expired
            for (const effectType of expired) {
                this.onEffectExpired(entity, effectType);
            }
        }
    }

    /**
     * Check for local player collecting power-ups
     * @private
     */
    checkPowerUpCollection() {
        const localPlayer = this.getLocalPlayer();
        if (!localPlayer) return;

        const playerPos = localPlayer.getComponent('position');
        const playerHitbox = localPlayer.getComponent('circleHitbox');
        if (!playerPos || !playerHitbox) return;

        // Check collision with power-ups
        for (const entity of this.game.entities) {
            const powerup = entity.getComponent('powerup');
            const powerupPos = entity.getComponent('position');

            if (!powerup || !powerupPos || powerup.isCollected) continue;

            // Check distance
            const dx = playerPos.x - powerupPos.x;
            const dy = playerPos.y - powerupPos.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            // Collection radius (power-up radius + player radius)
            const collectionRadius = 16 + (playerHitbox.radius || 8);

            if (distance < collectionRadius) {
                this.collectPowerUp(localPlayer, entity, powerup);
            }
        }
    }

    /**
     * Collect power-up
     * @private
     * @param {Entity} player - Player entity
     * @param {Entity} powerupEntity - Power-up entity
     * @param {PowerUpComponent} powerup - Power-up component
     */
    collectPowerUp(player, powerupEntity, powerup) {
        const networkPlayer = player.getComponent('networkPlayer');
        if (!networkPlayer) return;

        // Collect power-up
        const effect = powerup.collect(networkPlayer.playerId);
        if (!effect) return;

        // Apply effect to player
        this.applyEffect(player, effect);

        // Hide power-up sprite
        const sprite = powerupEntity.getComponent('sprite');
        if (sprite) {
            sprite.visible = false;
        }

        // Send collection event to server
        if (this.game.networkClient) {
            this.game.networkClient.send('powerup_collected', {
                powerupId: powerupEntity.uuid,
                playerId: networkPlayer.playerId,
                powerupType: powerup.type
            });
        }

        console.log(`[PowerUpSystem] ${networkPlayer.playerName} collected ${powerup.config.name}`);
    }

    /**
     * Apply power-up effect to player
     * @private
     * @param {Entity} player - Player entity
     * @param {Object} effect - Effect configuration
     */
    applyEffect(player, effect) {
        // Get or create ActivePowerUpComponent
        let activePowerup = player.getComponent('activePowerup');
        if (!activePowerup) {
            const { ActivePowerUpComponent } = require('../components/powerup_component.js');
            activePowerup = new ActivePowerUpComponent();
            player.addComponent('activePowerup', activePowerup);
        }

        // Apply effect based on type
        switch (effect.effect) {
            case 'heal':
                this.applyHeal(player, effect.value);
                break;

            case 'speed':
                activePowerup.addEffect('speed', effect.value, effect.duration);
                this.updatePlayerSpeed(player);
                break;

            case 'damage':
                activePowerup.addEffect('damage', effect.value, effect.duration);
                break;

            case 'invincible':
                activePowerup.addEffect('invincible', effect.value, effect.duration);
                break;
        }
    }

    /**
     * Apply heal effect
     * @private
     * @param {Entity} player - Player entity
     * @param {number} amount - Heal amount
     */
    applyHeal(player, amount) {
        const health = player.getComponent('health');
        if (!health) return;

        health.currentHealth = Math.min(
            health.currentHealth + amount,
            health.maxHealth
        );

        console.log(`[PowerUpSystem] Healed ${amount} HP (now ${health.currentHealth}/${health.maxHealth})`);
    }

    /**
     * Update player speed based on active effects
     * @private
     * @param {Entity} player - Player entity
     */
    updatePlayerSpeed(player) {
        const activePowerup = player.getComponent('activePowerup');
        const movement = player.getComponent('movement');

        if (!activePowerup || !movement) return;

        // Calculate speed multiplier
        let speedBoost = activePowerup.getEffect('speed');
        if (speedBoost) {
            // Apply speed boost (additive)
            movement.speed = movement.baseSpeed + speedBoost;
        } else {
            // Reset to base speed
            movement.speed = movement.baseSpeed || 200;
        }
    }

    /**
     * Get damage multiplier for player
     * @param {Entity} player - Player entity
     * @returns {number} - Damage multiplier
     */
    getDamageMultiplier(player) {
        const activePowerup = player.getComponent('activePowerup');
        if (!activePowerup) return 1;

        return activePowerup.getEffect('damage') || 1;
    }

    /**
     * Check if player is invincible
     * @param {Entity} player - Player entity
     * @returns {boolean}
     */
    isInvincible(player) {
        const activePowerup = player.getComponent('activePowerup');
        if (!activePowerup) return false;

        return activePowerup.hasEffect('invincible');
    }

    /**
     * Handle effect expiration
     * @private
     * @param {Entity} player - Player entity
     * @param {string} effectType - Effect type that expired
     */
    onEffectExpired(player, effectType) {
        console.log(`[PowerUpSystem] ${effectType} effect expired`);

        // Reset player stats
        if (effectType === 'speed') {
            this.updatePlayerSpeed(player);
        }

        // Visual feedback could be added here
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
     * Handle power-up collection from server
     * @param {Object} data - Collection data
     */
    handlePowerUpCollected(data) {
        // Find power-up entity
        for (const entity of this.game.entities) {
            if (entity.uuid === data.powerupId) {
                const powerup = entity.getComponent('powerup');
                if (powerup) {
                    powerup.collect(data.playerId);

                    // Hide sprite
                    const sprite = entity.getComponent('sprite');
                    if (sprite) {
                        sprite.visible = false;
                    }
                }
                break;
            }
        }

        console.log(`[PowerUpSystem] Player ${data.playerId} collected ${data.powerupType}`);
    }

    /**
     * Handle power-up respawn from server
     * @param {Object} data - Respawn data
     */
    handlePowerUpRespawn(data) {
        // Find power-up entity
        for (const entity of this.game.entities) {
            if (entity.uuid === data.powerupId) {
                const powerup = entity.getComponent('powerup');
                if (powerup) {
                    powerup.respawn();

                    // Show sprite
                    const sprite = entity.getComponent('sprite');
                    if (sprite) {
                        sprite.visible = true;
                    }
                }
                break;
            }
        }

        console.log(`[PowerUpSystem] Power-up ${data.powerupId} respawned`);
    }
}
