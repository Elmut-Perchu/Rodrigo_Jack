// core/components/interpolation_component.js - Interpolation Component for Network Sync
import { Component } from './component.js';
import { wrapValue, shortestDelta } from '../../constants/vs_wrap_constants.js';

export class Interpolation extends Component {
    constructor() {
        super();
        this.buffer = []; // State buffer for interpolation

        // How far behind the newest state the fighter is drawn.
        //
        // This is the whole budget for the network being uneven. States leave
        // the server every 50ms but do not arrive every 50ms, and any gap
        // longer than this budget leaves nothing left to interpolate towards:
        // the fighter freezes on the newest sample until the next one lands
        // and then catches up in one step. At 100ms a single late packet did
        // it, which on a free-tier server across an ocean is most of them.
        // 150ms buys two.
        this.bufferDelay = 150;

        // Deep enough that the sample being interpolated FROM is never the
        // one pushed out of the far end: 24 states is 1.2s of history against
        // a 150ms delay.
        this.maxBufferSize = 24;

        // Where to draw a fighter with nothing in the buffer yet - straight
        // after a respawn, say. Without it an empty buffer means "no answer",
        // and VSMovement leaves the body at whatever it last did.
        this.held = null;

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
        const timestamp = state.timestamp || Date.now();

        // getInterpolatedPosition scans the buffer expecting it to run in
        // time order. A state stamped no later than the one already at the
        // end would break that scan, and it has nothing new to say anyway.
        const newest = this.buffer[this.buffer.length - 1];
        if (newest && timestamp <= newest.timestamp) return;

        this.buffer.push({
            x: state.x,
            y: state.y,
            vx: state.vx || 0,
            vy: state.vy || 0,
            timestamp
        });

        // Keep buffer from growing too large
        if (this.buffer.length > this.maxBufferSize) {
            this.buffer.shift();
        }
    }

    /**
     * Drops the history and pins the fighter somewhere known - a respawn, or
     * any other moment the server moves a body rather than it moving itself.
     *
     * The old states have to go: they describe a journey that no longer
     * happened, and interpolating out of them drags the fighter back across
     * the arena from wherever they died.
     */
    reset(x, y) {
        this.buffer.length = 0;
        this.held = { x, y };
    }

    getInterpolatedPosition() {
        if (this.buffer.length === 0) {
            return this.held ? { x: this.held.x, y: this.held.y } : null;
        }
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
