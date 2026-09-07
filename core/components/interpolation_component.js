// core/components/interpolation_component.js - Interpolation Component for Network Sync
import { Component } from './component.js';
import { wrapValue, shortestDelta } from '../../constants/vs_wrap_constants.js';

export class Interpolation extends Component {
    constructor() {
        super();
        this.buffer = []; // State buffer for interpolation
        this.bufferDelay = 100; // ms delay for smooth interpolation
        this.maxBufferSize = 10;

        // Arena size, when the map's edges are passages rather than walls.
        // Left at zero the interpolation is an ordinary straight line, which
        // is what every non-wrapping map wants.
        //
        // A fighter crossing a passage sends two positions a whole arena
        // apart. Interpolating between them literally would drag them back
        // across the entire map at enormous speed - the one thing viewers of
        // a wrap must never see. Measuring the gap the short way instead
        // walks them out of one side and in through the other, which is both
        // correct and smooth.
        this.wrapWidth = 0;
        this.wrapHeight = 0;
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
            x: this.blend(before.x, after.x, clampedAlpha, this.wrapWidth),
            y: this.blend(before.y, after.y, clampedAlpha, this.wrapHeight)
        };
    }

    /** One axis, taking the short way round when that axis wraps. */
    blend(from, to, alpha, span) {
        if (!(span > 0)) return from + (to - from) * alpha;
        return wrapValue(from + shortestDelta(to - from, span) * alpha, span);
    }
}
