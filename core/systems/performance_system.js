/**
 * PerformanceSystem - FPS monitoring and performance metrics
 * Tracks frame rate, entity count, and system performance
 *
 * Phase 5 Days 28-30
 */

import { System } from './system.js';

export class PerformanceSystem extends System {
    constructor(game) {
        super(game);

        // FPS tracking
        this.fps = 60;
        this.frameCount = 0;
        this.lastFpsUpdate = performance.now();
        this.fpsUpdateInterval = 1000; // Update FPS every second

        // Performance metrics
        this.frameTime = 0;
        this.maxFrameTime = 0;
        this.minFrameTime = Infinity;
        this.avgFrameTime = 0;

        // Frame time history (last 60 frames)
        this.frameTimeHistory = [];
        this.maxHistorySize = 60;

        // System timing
        this.systemTimes = new Map(); // systemName -> avgTime

        // UI elements
        this.fpsCounter = null;
        this.perfOverlay = null;
        this.showDetailedStats = false;

        // Create UI
        this.createUI();

        console.log('[PerformanceSystem] Initialized');
    }

    update(deltaTime) {
        const frameStart = performance.now();

        // Update frame count
        this.frameCount++;

        // Calculate FPS
        const now = performance.now();
        const elapsed = now - this.lastFpsUpdate;

        if (elapsed >= this.fpsUpdateInterval) {
            this.fps = Math.round((this.frameCount * 1000) / elapsed);
            this.frameCount = 0;
            this.lastFpsUpdate = now;

            // Update UI
            this.updateUI();
        }

        // Track frame time
        const frameEnd = performance.now();
        this.frameTime = frameEnd - frameStart;

        // Update frame time statistics
        this.updateFrameTimeStats(this.frameTime);
    }

    /**
     * Update frame time statistics
     * @private
     * @param {number} frameTime - Frame time in ms
     */
    updateFrameTimeStats(frameTime) {
        // Update min/max
        this.maxFrameTime = Math.max(this.maxFrameTime, frameTime);
        this.minFrameTime = Math.min(this.minFrameTime, frameTime);

        // Add to history
        this.frameTimeHistory.push(frameTime);
        if (this.frameTimeHistory.length > this.maxHistorySize) {
            this.frameTimeHistory.shift();
        }

        // Calculate average
        const sum = this.frameTimeHistory.reduce((a, b) => a + b, 0);
        this.avgFrameTime = sum / this.frameTimeHistory.length;
    }

    /**
     * Create performance UI
     * @private
     */
    createUI() {
        // Create FPS counter
        this.fpsCounter = document.createElement('div');
        this.fpsCounter.id = 'fps-counter';
        this.fpsCounter.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            background: rgba(0, 0, 0, 0.7);
            color: #00ff00;
            padding: 8px 12px;
            font-family: monospace;
            font-size: 14px;
            border-radius: 4px;
            z-index: 10000;
            cursor: pointer;
            user-select: none;
        `;
        this.fpsCounter.textContent = 'FPS: --';
        document.body.appendChild(this.fpsCounter);

        // Create detailed stats overlay (hidden by default)
        this.perfOverlay = document.createElement('div');
        this.perfOverlay.id = 'perf-overlay';
        this.perfOverlay.style.cssText = `
            position: fixed;
            top: 50px;
            right: 10px;
            background: rgba(0, 0, 0, 0.85);
            color: #00ff00;
            padding: 12px;
            font-family: monospace;
            font-size: 12px;
            border-radius: 4px;
            z-index: 10000;
            display: none;
            min-width: 250px;
        `;
        document.body.appendChild(this.perfOverlay);

        // Toggle detailed stats on click
        this.fpsCounter.addEventListener('click', () => {
            this.showDetailedStats = !this.showDetailedStats;
            this.perfOverlay.style.display = this.showDetailedStats ? 'block' : 'none';
        });

        console.log('[PerformanceSystem] UI created');
    }

    /**
     * Update performance UI
     * @private
     */
    updateUI() {
        if (!this.fpsCounter) return;

        // Update FPS counter
        const fpsColor = this.fps >= 55 ? '#00ff00' : this.fps >= 30 ? '#ffff00' : '#ff0000';
        this.fpsCounter.style.color = fpsColor;
        this.fpsCounter.textContent = `FPS: ${this.fps}`;

        // Update detailed stats
        if (this.showDetailedStats && this.perfOverlay) {
            this.updateDetailedStats();
        }
    }

    /**
     * Update detailed performance stats
     * @private
     */
    updateDetailedStats() {
        if (!this.perfOverlay) return;

        const stats = this.getPerformanceStats();

        let html = `
            <div style="margin-bottom: 8px; font-weight: bold; color: #ffffff;">Performance Stats</div>
            <div>FPS: ${stats.fps}</div>
            <div>Frame Time: ${stats.frameTime.toFixed(2)}ms</div>
            <div>Avg Frame Time: ${stats.avgFrameTime.toFixed(2)}ms</div>
            <div>Min/Max: ${stats.minFrameTime.toFixed(2)}/${stats.maxFrameTime.toFixed(2)}ms</div>
            <div style="margin-top: 8px; font-weight: bold; color: #ffffff;">Game Stats</div>
            <div>Entities: ${stats.entityCount}</div>
            <div>Systems: ${stats.systemCount}</div>
        `;

        // Add network stats if available
        if (stats.networkStats) {
            html += `
                <div style="margin-top: 8px; font-weight: bold; color: #ffffff;">Network</div>
                <div>Latency: ${stats.networkStats.latency}ms</div>
                <div>Remote Players: ${stats.networkStats.remotePlayerCount}</div>
            `;
        }

        // Add memory stats if available
        if (performance.memory) {
            const memMB = (performance.memory.usedJSHeapSize / 1048576).toFixed(1);
            const memLimitMB = (performance.memory.jsHeapSizeLimit / 1048576).toFixed(0);
            html += `
                <div style="margin-top: 8px; font-weight: bold; color: #ffffff;">Memory</div>
                <div>Used: ${memMB}MB / ${memLimitMB}MB</div>
            `;
        }

        this.perfOverlay.innerHTML = html;
    }

    /**
     * Get performance statistics
     * @returns {Object} - Performance stats
     */
    getPerformanceStats() {
        const stats = {
            fps: this.fps,
            frameTime: this.frameTime,
            avgFrameTime: this.avgFrameTime,
            minFrameTime: this.minFrameTime,
            maxFrameTime: this.maxFrameTime,
            entityCount: this.game.entities.size,
            systemCount: this.game.systems.size
        };

        // Add network stats if in VS mode
        if (this.game.mode === 'vs') {
            const networkSystem = this.getNetworkSyncSystem();
            if (networkSystem) {
                stats.networkStats = networkSystem.getNetworkStats();
            }
        }

        return stats;
    }

    /**
     * Get NetworkSyncSystem instance
     * @private
     * @returns {System|null}
     */
    getNetworkSyncSystem() {
        for (const system of this.game.systems) {
            if (system.constructor.name === 'NetworkSyncSystem') {
                return system;
            }
        }
        return null;
    }

    /**
     * Measure system execution time
     * @param {string} systemName - System name
     * @param {Function} fn - Function to measure
     * @returns {*} - Function result
     */
    measureSystem(systemName, fn) {
        const start = performance.now();
        const result = fn();
        const duration = performance.now() - start;

        // Update system timing
        const current = this.systemTimes.get(systemName) || 0;
        this.systemTimes.set(systemName, (current + duration) / 2); // Moving average

        return result;
    }

    /**
     * Reset performance statistics
     */
    resetStats() {
        this.maxFrameTime = 0;
        this.minFrameTime = Infinity;
        this.frameTimeHistory = [];
        this.systemTimes.clear();

        console.log('[PerformanceSystem] Stats reset');
    }

    /**
     * Toggle detailed stats display
     */
    toggleDetailedStats() {
        this.showDetailedStats = !this.showDetailedStats;
        if (this.perfOverlay) {
            this.perfOverlay.style.display = this.showDetailedStats ? 'block' : 'none';
        }
    }

    /**
     * Log performance report
     */
    logPerformanceReport() {
        const stats = this.getPerformanceStats();

        console.log('=== Performance Report ===');
        console.log(`FPS: ${stats.fps}`);
        console.log(`Frame Time: ${stats.frameTime.toFixed(2)}ms (avg: ${stats.avgFrameTime.toFixed(2)}ms)`);
        console.log(`Min/Max Frame Time: ${stats.minFrameTime.toFixed(2)}ms / ${stats.maxFrameTime.toFixed(2)}ms`);
        console.log(`Entities: ${stats.entityCount}`);
        console.log(`Systems: ${stats.systemCount}`);

        if (stats.networkStats) {
            console.log(`Latency: ${stats.networkStats.latency}ms`);
            console.log(`Remote Players: ${stats.networkStats.remotePlayerCount}`);
        }

        if (this.systemTimes.size > 0) {
            console.log('=== System Timing ===');
            for (const [system, time] of this.systemTimes.entries()) {
                console.log(`${system}: ${time.toFixed(3)}ms`);
            }
        }

        console.log('========================');
    }

    /**
     * Cleanup UI on destroy
     */
    destroy() {
        if (this.fpsCounter) {
            this.fpsCounter.remove();
        }
        if (this.perfOverlay) {
            this.perfOverlay.remove();
        }
    }
}
