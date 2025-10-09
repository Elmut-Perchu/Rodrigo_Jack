/**
 * InterpolationSystem - Smooth remote player movement
 * Handles interpolation, extrapolation, and prediction error correction
 *
 * Phase 4 Days 23-24
 */

import { System } from '../system.js';

export class InterpolationSystem extends System {
    constructor(game) {
        super(game);

        this.interpolationSpeed = 0.3; // Smooth interpolation factor
        this.extrapolationThreshold = 100; // Extrapolate if lag > 100ms
        this.maxExtrapolationTime = 300; // Max extrapolation time (300ms)

        console.log('[InterpolationSystem] Initialized');
    }

    update(deltaTime) {
        if (!this.game.mode || this.game.mode !== 'vs') return;

        // Process all remote players
        for (const entity of this.game.entities) {
            const networkPlayer = entity.getComponent('networkPlayer');
            if (!networkPlayer || networkPlayer.isLocal) continue;

            this.interpolateEntity(entity, deltaTime);
            this.applyPredictionCorrection(entity, deltaTime);
        }
    }

    /**
     * Interpolate entity position
     * @private
     * @param {Entity} entity - Remote player entity
     * @param {number} deltaTime - Time since last frame
     */
    interpolateEntity(entity, deltaTime) {
        const interpolation = entity.getComponent('interpolation');
        const position = entity.getComponent('position');
        const networkPlayer = entity.getComponent('networkPlayer');

        if (!interpolation || !position || !networkPlayer) return;
        if (!interpolation.enabled) return;

        // Calculate time since last network update
        const timeSinceUpdate = Date.now() - networkPlayer.lastUpdateTime;

        // Decide between interpolation and extrapolation
        if (timeSinceUpdate > this.extrapolationThreshold) {
            // Lag detected - use extrapolation
            this.extrapolatePosition(entity, timeSinceUpdate);
        } else {
            // Normal conditions - use interpolation
            this.interpolatePosition(entity, deltaTime);
        }
    }

    /**
     * Interpolate position smoothly
     * @private
     * @param {Entity} entity - Remote player entity
     * @param {number} deltaTime - Time since last frame
     */
    interpolatePosition(entity, deltaTime) {
        const interpolation = entity.getComponent('interpolation');
        const position = entity.getComponent('position');

        if (!interpolation || !position) return;

        // Increment interpolation alpha
        interpolation.alpha += this.interpolationSpeed * (deltaTime / 16.67); // Normalize to 60fps
        interpolation.alpha = Math.min(interpolation.alpha, 1);

        // Lerp between previous and target position
        position.x = this.lerp(
            interpolation.previousX,
            interpolation.targetX,
            interpolation.alpha
        );

        position.y = this.lerp(
            interpolation.previousY,
            interpolation.targetY,
            interpolation.alpha
        );
    }

    /**
     * Extrapolate position based on velocity (lag compensation)
     * @private
     * @param {Entity} entity - Remote player entity
     * @param {number} timeSinceUpdate - Milliseconds since last update
     */
    extrapolatePosition(entity, timeSinceUpdate) {
        const interpolation = entity.getComponent('interpolation');
        const position = entity.getComponent('position');
        const velocity = entity.getComponent('velocity');
        const prediction = entity.getComponent('prediction');

        if (!interpolation || !position || !velocity || !prediction) return;

        // Limit extrapolation time
        const extrapolationTime = Math.min(timeSinceUpdate, this.maxExtrapolationTime);

        // Extrapolate based on velocity
        const extrapolatedX = interpolation.targetX + (velocity.vx * extrapolationTime / 1000);
        const extrapolatedY = interpolation.targetY + (velocity.vy * extrapolationTime / 1000);

        // Store predicted position for error correction
        prediction.predictedX = extrapolatedX;
        prediction.predictedY = extrapolatedY;

        // Apply extrapolated position
        position.x = extrapolatedX;
        position.y = extrapolatedY;

        console.log(`[InterpolationSystem] Extrapolating ${entity.getComponent('networkPlayer').playerName} (lag: ${timeSinceUpdate}ms)`);
    }

    /**
     * Apply prediction error correction (smooth snap)
     * @private
     * @param {Entity} entity - Remote player entity
     * @param {number} deltaTime - Time since last frame
     */
    applyPredictionCorrection(entity, deltaTime) {
        const prediction = entity.getComponent('prediction');
        const position = entity.getComponent('position');
        const interpolation = entity.getComponent('interpolation');

        if (!prediction || !position || !interpolation) return;

        // Calculate prediction error
        prediction.errorX = interpolation.targetX - prediction.predictedX;
        prediction.errorY = interpolation.targetY - prediction.predictedY;

        const errorMagnitude = Math.sqrt(
            prediction.errorX * prediction.errorX +
            prediction.errorY * prediction.errorY
        );

        // Only correct if error is significant (> 5px)
        if (errorMagnitude > 5) {
            // Smooth error correction
            const correctionAmount = prediction.correctionSpeed * (deltaTime / 16.67);

            position.x += prediction.errorX * correctionAmount;
            position.y += prediction.errorY * correctionAmount;

            // Update predicted position
            prediction.predictedX = position.x;
            prediction.predictedY = position.y;

            if (errorMagnitude > 20) {
                console.log(`[InterpolationSystem] Correcting prediction error: ${errorMagnitude.toFixed(1)}px`);
            }
        }
    }

    /**
     * Linear interpolation
     * @private
     * @param {number} start - Start value
     * @param {number} end - End value
     * @param {number} alpha - Interpolation factor (0-1)
     * @returns {number} - Interpolated value
     */
    lerp(start, end, alpha) {
        return start + (end - start) * alpha;
    }

    /**
     * Reset interpolation for entity
     * @param {Entity} entity - Remote player entity
     */
    resetInterpolation(entity) {
        const interpolation = entity.getComponent('interpolation');
        const position = entity.getComponent('position');

        if (!interpolation || !position) return;

        interpolation.previousX = position.x;
        interpolation.previousY = position.y;
        interpolation.targetX = position.x;
        interpolation.targetY = position.y;
        interpolation.alpha = 0;
    }

    /**
     * Set interpolation speed
     * @param {number} speed - Interpolation speed (0-1)
     */
    setInterpolationSpeed(speed) {
        this.interpolationSpeed = Math.max(0.1, Math.min(1, speed));
        console.log(`[InterpolationSystem] Interpolation speed set to ${this.interpolationSpeed}`);
    }

    /**
     * Get interpolation stats
     * @returns {Object}
     */
    getInterpolationStats() {
        let remotePlayerCount = 0;
        let extrapolatingCount = 0;

        for (const entity of this.game.entities) {
            const networkPlayer = entity.getComponent('networkPlayer');
            if (!networkPlayer || networkPlayer.isLocal) continue;

            remotePlayerCount++;

            const timeSinceUpdate = Date.now() - networkPlayer.lastUpdateTime;
            if (timeSinceUpdate > this.extrapolationThreshold) {
                extrapolatingCount++;
            }
        }

        return {
            remotePlayerCount,
            extrapolatingCount,
            interpolationSpeed: this.interpolationSpeed
        };
    }
}
