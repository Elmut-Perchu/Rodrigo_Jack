/**
 * PowerUp Component - Power-up effects for VS mode
 * Handles temporary stat boosts with duration tracking
 *
 * Phase 5 Days 25-27
 */

import { Component } from './component.js';

/**
 * Power-up types and configurations
 */
export const POWERUP_TYPES = {
    health: {
        name: 'Health Pack',
        effect: 'heal',
        value: 50,
        duration: 0, // Instant
        color: '#FF4444',
        sprite: 'health_pack'
    },
    speed_boost: {
        name: 'Speed Boost',
        effect: 'speed',
        value: 100, // +100 speed
        duration: 10000, // 10 seconds
        color: '#44FF44',
        sprite: 'speed_boost'
    },
    damage_up: {
        name: 'Damage Up',
        effect: 'damage',
        value: 2, // 2x damage multiplier
        duration: 15000, // 15 seconds
        color: '#FF8844',
        sprite: 'damage_up'
    },
    invincibility: {
        name: 'Invincibility',
        effect: 'invincible',
        value: 1,
        duration: 5000, // 5 seconds
        color: '#FFFF44',
        sprite: 'invincibility'
    }
};

export class PowerUpComponent extends Component {
    constructor(type = 'health', respawnTime = 10000) {
        super();

        this.type = type;
        this.config = POWERUP_TYPES[type] || POWERUP_TYPES.health;

        // Collection state
        this.isCollected = false;
        this.collectedBy = null;
        this.collectedAt = 0;

        // Respawn settings
        this.respawnTime = respawnTime; // Time in ms before respawn
        this.canRespawn = true;

        // Visual settings
        this.color = this.config.color;
        this.sprite = this.config.sprite;
    }

    /**
     * Collect the power-up
     * @param {string} playerId - ID of player collecting
     * @returns {Object|null} - Power-up config if collected, null otherwise
     */
    collect(playerId) {
        if (this.isCollected) return null;

        this.isCollected = true;
        this.collectedBy = playerId;
        this.collectedAt = Date.now();

        console.log(`[PowerUp] ${this.config.name} collected by ${playerId}`);

        return {
            type: this.type,
            effect: this.config.effect,
            value: this.config.value,
            duration: this.config.duration
        };
    }

    /**
     * Check if power-up should respawn
     * @returns {boolean}
     */
    shouldRespawn() {
        if (!this.isCollected || !this.canRespawn) return false;

        const elapsed = Date.now() - this.collectedAt;
        return elapsed >= this.respawnTime;
    }

    /**
     * Respawn the power-up
     */
    respawn() {
        this.isCollected = false;
        this.collectedBy = null;
        this.collectedAt = 0;

        console.log(`[PowerUp] ${this.config.name} respawned`);
    }

    /**
     * Get time until respawn
     * @returns {number} - Milliseconds until respawn
     */
    getTimeUntilRespawn() {
        if (!this.isCollected) return 0;

        const elapsed = Date.now() - this.collectedAt;
        return Math.max(0, this.respawnTime - elapsed);
    }
}

/**
 * Active Power-up Effect Component
 * Attached to players who have active power-up effects
 */
export class ActivePowerUpComponent extends Component {
    constructor() {
        super();

        // Active effects
        this.effects = new Map(); // effectType -> {value, duration, startTime}
    }

    /**
     * Add effect to player
     * @param {string} effectType - Effect type (speed, damage, invincible, heal)
     * @param {number} value - Effect value
     * @param {number} duration - Effect duration in ms
     */
    addEffect(effectType, value, duration) {
        // Instant effects (like heal)
        if (duration === 0) {
            return { type: effectType, value, instant: true };
        }

        // Duration-based effects
        const effect = {
            value: value,
            duration: duration,
            startTime: Date.now()
        };

        this.effects.set(effectType, effect);

        console.log(`[ActivePowerUp] Added ${effectType} effect: ${value} for ${duration}ms`);

        return { type: effectType, value, instant: false };
    }

    /**
     * Remove expired effects
     */
    updateEffects() {
        const now = Date.now();
        const expired = [];

        for (const [effectType, effect] of this.effects.entries()) {
            const elapsed = now - effect.startTime;
            if (elapsed >= effect.duration) {
                expired.push(effectType);
            }
        }

        // Remove expired effects
        for (const effectType of expired) {
            this.effects.delete(effectType);
            console.log(`[ActivePowerUp] ${effectType} effect expired`);
        }

        return expired;
    }

    /**
     * Get active effect value
     * @param {string} effectType - Effect type
     * @returns {number|null} - Effect value or null
     */
    getEffect(effectType) {
        const effect = this.effects.get(effectType);
        return effect ? effect.value : null;
    }

    /**
     * Check if effect is active
     * @param {string} effectType - Effect type
     * @returns {boolean}
     */
    hasEffect(effectType) {
        return this.effects.has(effectType);
    }

    /**
     * Get time remaining for effect
     * @param {string} effectType - Effect type
     * @returns {number} - Milliseconds remaining
     */
    getTimeRemaining(effectType) {
        const effect = this.effects.get(effectType);
        if (!effect) return 0;

        const elapsed = Date.now() - effect.startTime;
        return Math.max(0, effect.duration - elapsed);
    }

    /**
     * Clear all effects
     */
    clearEffects() {
        this.effects.clear();
    }
}
