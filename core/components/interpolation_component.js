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

/**
 * The gap the buffer always has to span: the server broadcasts every 50ms
 * (TICK_INTERVAL, server/game_loop.go), so two states are never closer than
 * that and a buffer shallower than one of them has nothing to interpolate
 * between.
 */
const PACKET_INTERVAL = 50;

/**
 * The floor and the ceiling on how far behind an opponent is drawn.
 *
 * The floor is exactly one broadcast: the clock always needs a state ahead of
 * where it is drawing to interpolate toward, and below one broadcast apart
 * there is no guarantee of one, so the fighter stutters. The sweep below says
 * 40ms survives a clean link, but that is measuring uniform jitter - real
 * links arrive in bursts, and the extra 10ms is what covers the difference. The ceiling is where the cure has become the disease - past a
 * quarter second the delay hurts more than the jitter it is hiding, and a
 * connection needing more than that is not going to be rescued by waiting.
 */
const MIN_DELAY = 50;
const MAX_DELAY = 250;

/**
 * How much of the observed lateness has to be held as buffer.
 *
 * Not one-for-one, and that is the whole finding. The playout clock below
 * already absorbs unevenness by running up to 15% fast or slow, so the buffer
 * is only asked to cover what the slew cannot. Sweeping fixed depths against
 * known jitter says what is actually needed:
 *
 *     gigue    0ms -> 40ms      gigue   80ms ->  60ms
 *     gigue   30ms -> 50ms      gigue  150ms -> 100ms
 *
 * which is a slope near 0.4, not the 1.0 the naive reading of "cover the
 * jitter" suggests. Half is that slope with room to spare, and it keeps the
 * worst case at roughly the 120ms this used to charge everyone - so no
 * connection ends up worse off than before, and good ones end up far better.
 */
const JITTER_MARGIN = 0.5;

/**
 * How much of the recent peak survives each state received - about twenty a
 * second, so a delay bought by one bad patch is handed back over roughly ten
 * seconds of calm.
 */
const PEAK_DECAY = 0.995;

/**
 * How fast the delay walks toward what the connection is asking for.
 *
 * Deliberately lopsided. Being too shallow costs a visible stutter, and the
 * moment that is discovered is the moment it is already happening, so growth
 * is quick. Being too deep costs nothing but latency, which can be given back
 * at leisure - and giving it back slowly stops the delay oscillating around a
 * connection that is merely bumpy.
 */
const GROW_RATE = 0.25;
const SHRINK_RATE = 0.02;

export class Interpolation extends Component {
    constructor() {
        super();
        this.buffer = []; // State buffer for interpolation

        // How far behind the newest state the fighter is drawn - the budget
        // for the network being uneven. States leave the server every 50ms
        // but do not arrive every 50ms.
        //
        // This used to be a flat 120ms for everyone, which is the wrong shape
        // of answer: it is a guess at the worst connection anybody might have,
        // charged to everybody all the time. On a good link it was roughly
        // twice what was needed, and since it sits in series with the send
        // interval, the server tick and two network crossings, it was the
        // single largest term in what a player actually sees.
        //
        // It is now measured. See require(): the delay tracks the lateness
        // this connection is really producing, so a phone on a clean network
        // settles near the floor and one on a bad one still gets what it
        // needs.
        this.bufferDelay = 120;

        // What the connection has recently demanded - a peak that decays, so
        // it is sized to the worst of the last few seconds rather than to the
        // average (which is always survivable) or to the worst ever (which
        // would mean one bad moment taxing the rest of the match).
        this.neededDelay = 120;

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

        // How late this state is against the best trip this connection has
        // managed. Nothing here has to establish that best trip: the timestamp
        // arrives already converted by game_vs_simple.serverToLocal, whose
        // clock offset is itself the minimum of every trip seen. Subtracting
        // it therefore yields the excess directly, and a state that took the
        // fastest route available reads as exactly zero.
        //
        // Measured before the ordering check below rather than after, because
        // a state that turns up out of order is the loudest evidence of an
        // uneven link there is, and throwing it away would be discarding the
        // reading along with the state.
        this.require(PACKET_INTERVAL + Math.max(0, Date.now() - timestamp) * JITTER_MARGIN);

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
     * Records a delay this connection has just shown it needs, and walks the
     * one in use toward it.
     *
     * Called by every arriving state, reporting how late that state was. That
     * one reading is the whole input: it needs nothing on screen to have gone
     * wrong first, and it costs a subtraction.
     *
     * @param delay  the buffer depth that would have covered what just happened
     */
    require(delay) {
        // A peak that decays. An average would be sized to the trips that were
        // never a problem, and a plain maximum would let one bad second charge
        // the rest of the match.
        this.neededDelay = Math.max(delay, this.neededDelay * PEAK_DECAY);

        const target = Math.max(MIN_DELAY, Math.min(MAX_DELAY, this.neededDelay));
        const rate = target > this.bufferDelay ? GROW_RATE : SHRINK_RATE;
        this.bufferDelay += (target - this.bufferDelay) * rate;
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

        // Running dry is deliberately NOT reported to require().
        //
        // It looks like the ideal signal - the buffer proving in the act that
        // it was too shallow - and the first version did exactly that. It
        // compounds: the shortfall is measured against bufferDelay, so every
        // dry frame asks for a little more than the last one asked for, and a
        // two-second freeze walked the delay to the ceiling and left it there
        // for a quarter of a minute.
        //
        // It is also redundant. A state that is late says so on arrival, in
        // addState, with the same number and no feedback path - so the only
        // thing lost by staying silent here is the case where states stop
        // altogether, and no buffer of any depth was going to cover that.
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
