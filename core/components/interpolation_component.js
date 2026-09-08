// core/components/interpolation_component.js - Interpolation Component for Network Sync
import { Component } from './component.js';
import { wrapValue, shortestDelta } from '../../constants/vs_wrap_constants.js';

/**
 * How much older than a respawn a state may still be and be believed, in ms.
 *
 * It covers the one-way trip: a state stamped when the server sent it lands a
 * latency later, so a perfectly good one is always slightly "before" now. What
 * it has to refuse - a state describing where somebody died - is a whole
 * intermission old, and the players spend that reading the round score, so
 * there is a wide gap between the two and no need to cut it fine.
 */
const RESPAWN_GRACE = 250;

export class Interpolation extends Component {
    constructor() {
        super();
        this.buffer = []; // State buffer for interpolation

        // How far behind the newest state the fighter is drawn - the budget
        // for the network being uneven. States leave the server every 50ms
        // but do not arrive every 50ms.
        this.bufferDelay = 120;

        // A second of history. The playout clock below never samples the far
        // end of it unless the stream has stalled for that whole second.
        this.maxBufferSize = 20;

        // The playout clock: which instant of the buffered history is on
        // screen right now.
        //
        // Reading the buffer against wall-clock time directly is what caused
        // fighters to hop between two places. Wall time does not care whether
        // the states needed to answer it have arrived, so the answer kept
        // falling out of different branches - interpolated properly on one
        // frame, snapped onto the newest state on the next when nothing had
        // come in, snapped back on the one after. Each of those snaps is a
        // fighter jumping the distance they cover in the delay, and back.
        //
        // A clock of its own cannot do that. It advances with real time and
        // closes any gap by running slightly fast or slightly slow, so the
        // worst a bad connection can produce is a fighter who pauses and then
        // carries on - never one who is somewhere else and back.
        this.renderTime = 0;
        this.lastSampledAt = 0;

        // Where to draw a fighter with nothing in the buffer yet - straight
        // after a respawn, say. Without it an empty buffer means "no answer",
        // and VSMovement leaves the body at whatever it last did.
        this.held = null;

        // States stamped before this are refused. See reset().
        this.acceptFrom = 0;

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

        // Anything describing the fighter before the server last moved them by
        // hand is describing a body that is no longer there - see reset().
        // Ordering against the buffer cannot catch these, because the buffer is
        // empty at exactly the moment they arrive.
        if (timestamp < this.acceptFrom) return;

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
     *
     * Emptying the buffer is not enough by itself, which is the whole reason
     * for `movedAt`. A state that was already in flight when the server moved
     * the body arrives *after* this call, and an empty buffer has nothing to
     * judge it against - so the corpse's position becomes the only history
     * there is, and the fighter is drawn back where they died until a second's
     * worth of fresh states has pushed it out. Between the last moment of a
     * round and the spawn of the next one, that is exactly the fighter
     * appearing somewhere they are not.
     *
     * @param movedAt  when the server moved the body, on the same timeline the
     *                 states are stamped on (see game_vs_simple.js
     *                 serverToLocal). Left out, a fixed grace covers the
     *                 one-way trip instead, which is all an older server can
     *                 offer.
     */
    reset(x, y, movedAt) {
        this.buffer.length = 0;
        this.held = { x, y };
        // The clock belongs to the history it was reading. Kept across a
        // respawn it would carry the old timeline into the new one.
        this.renderTime = 0;
        this.lastSampledAt = 0;

        // A fresh state is stamped when the server sent it, so it is always a
        // little older than the moment it lands. The cutoff has to sit far
        // enough back to let those through, and everything it is meant to
        // refuse is a whole intermission old.
        this.acceptFrom = (movedAt || Date.now()) - RESPAWN_GRACE;
    }

    getInterpolatedPosition() {
        if (this.buffer.length === 0) {
            return this.held ? { x: this.held.x, y: this.held.y } : null;
        }

        const newest = this.buffer[this.buffer.length - 1];
        const oldest = this.buffer[0];
        const now = Date.now();

        if (!this.renderTime) {
            this.renderTime = newest.timestamp - this.bufferDelay;
            this.lastSampledAt = now;
        }

        // Capped, so a tab that was in the background does not come back and
        // run the clock through the whole history in a single frame.
        const elapsed = Math.max(0, Math.min(now - this.lastSampledAt, 250));
        this.lastSampledAt = now;

        // Where the clock ought to be, and the only way it is allowed to get
        // there: at most 15% off real time, which closes a tenth of a second
        // of lateness over about two thirds of a second. Moving it outright
        // would move the fighter outright, which is the fault this exists to
        // prevent.
        const drift = (newest.timestamp - this.bufferDelay) - this.renderTime;
        const rate = 1 + Math.max(-0.15, Math.min(0.15, drift / 600));
        this.renderTime += elapsed * rate;

        // Two things a slew cannot rescue. Past the newest state means
        // nothing has arrived for a while: hold there, because a fighter who
        // pauses is honest and one who is guessed forward has to be corrected
        // later. Off the back of the buffer means the stream stalled for
        // longer than the history is deep, and there is nothing left to be
        // smooth about.
        if (this.renderTime > newest.timestamp) this.renderTime = newest.timestamp;
        if (this.renderTime < oldest.timestamp) this.renderTime = oldest.timestamp;

        return this.sampleAt(this.renderTime);
    }

    /** The fighter's place at one instant of the buffered history. */
    sampleAt(time) {
        let before = this.buffer[0];
        let after = null;

        for (let i = 1; i < this.buffer.length; i++) {
            if (this.buffer[i].timestamp <= time) {
                before = this.buffer[i];
                continue;
            }
            after = this.buffer[i];
            break;
        }

        if (!after) return { x: before.x, y: before.y };

        const duration = after.timestamp - before.timestamp;
        if (duration <= 0) return { x: after.x, y: after.y };

        const alpha = Math.max(0, Math.min(1, (time - before.timestamp) / duration));

        return {
            x: this.blend(before.x, after.x, alpha, this.wrapWidth),
            y: this.blend(before.y, after.y, alpha, this.wrapHeight)
        };
    }

    /** One axis, taking the short way round when that axis wraps. */
    blend(from, to, alpha, span) {
        if (!(span > 0)) return from + (to - from) * alpha;
        return wrapValue(from + shortestDelta(to - from, span) * alpha, span);
    }
}
