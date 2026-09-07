// core/components/interpolation_component.js - Interpolation Component for Network Sync
import { Component } from './component.js';

export class Interpolation extends Component {
    constructor() {
        super();
        this.buffer = []; // State buffer for interpolation
        this.bufferDelay = 100; // ms delay for smooth interpolation
        this.maxBufferSize = 10;
    }

    addState(state) {
        this.buffer.push({
            x: state.x,
            y: state.y,
            vx: state.vx || 0,
            vy: state.vy || 0,
            timestamp: state.timestamp || Date.now()
        });

        // Keep buffer from growing too large
        if (this.buffer.length > this.maxBufferSize) {
            this.buffer.shift();
        }
    }

    getInterpolatedPosition() {
        if (this.buffer.length === 0) return null;
        if (this.buffer.length === 1) {
            return {
                x: this.buffer[0].x,
                y: this.buffer[0].y
            };
        }

        // Target time is now minus delay
        const targetTime = Date.now() - this.bufferDelay;

        // Find two states to interpolate between
        let before = null;
        let after = null;

        for (let i = 0; i < this.buffer.length; i++) {
            if (this.buffer[i].timestamp <= targetTime) {
                before = this.buffer[i];
            } else {
                after = this.buffer[i];
                break;
            }
        }

        // No future state, use latest
        if (!after) {
            const latest = this.buffer[this.buffer.length - 1];
            return { x: latest.x, y: latest.y };
        }

        // No past state, use earliest
        if (!before) {
            return { x: after.x, y: after.y };
        }

        // Interpolate between before and after
        const duration = after.timestamp - before.timestamp;
        if (duration <= 0) {
            return { x: after.x, y: after.y };
        }

        const alpha = (targetTime - before.timestamp) / duration;
        const clampedAlpha = Math.max(0, Math.min(1, alpha));

        return {
            x: before.x + (after.x - before.x) * clampedAlpha,
            y: before.y + (after.y - before.y) * clampedAlpha
        };
    }
}
