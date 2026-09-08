// tests/interpolation_playout.test.mjs
//
// Run with: node --test tests/
//
// The reported fault was fighters "teleporting and coming back, jumping
// between two points". Reading the state buffer against wall-clock time
// directly does exactly that whenever the network is uneven: the answer falls
// out of a different branch from one frame to the next - interpolated, then
// snapped onto the newest state because nothing had arrived, then snapped
// back - and each snap is worth the distance covered in the buffer delay.
//
// These tests drive the component the way a match does, with an arrival
// pattern deliberately worse than a real connection, and assert the one
// property that matters: what is drawn moves smoothly, or pauses. It never
// jumps.

import test from 'node:test';
import assert from 'node:assert/strict';

import { Interpolation } from '../core/components/interpolation_component.js';

const SPEED = 450;        // px/s, the fighters' running speed
const TICK_MS = 50;       // the server's 20Hz broadcast
const FRAME_MS = 1000 / 60;

/** Date.now() under our control, so a test is not at the mercy of real time. */
function withClock(run) {
    const real = Date.now;
    let now = 1_700_000_000_000;
    Date.now = () => now;
    try {
        return run({
            now: () => now,
            advance: (ms) => { now += ms; }
        });
    } finally {
        Date.now = real;
    }
}

/**
 * Plays a fighter running in a straight line for `seconds`, with states
 * arriving on the pattern given, and returns every position drawn.
 *
 * @param arrivalJitter  ms added to when each state is handed over, as a
 *                       function of the tick number. This is the whole point:
 *                       states are *sent* every 50ms and *arrive* whenever.
 */
function play(seconds, arrivalJitter) {
    return withClock(({ now, advance }) => {
        const interpolation = new Interpolation();
        const drawn = [];

        const start = now();
        let nextTick = 0;
        let elapsed = 0;

        while (elapsed < seconds * 1000) {
            // Hand over every state whose arrival time has passed.
            for (;;) {
                const sentAt = start + nextTick * TICK_MS;
                const arrivesAt = sentAt + arrivalJitter(nextTick);
                if (arrivesAt > now()) break;

                interpolation.addState({
                    // Stamped on the server's timeline, as the game does.
                    timestamp: sentAt,
                    x: (nextTick * TICK_MS / 1000) * SPEED,
                    y: 300
                });
                nextTick++;
            }

            const placed = interpolation.getInterpolatedPosition();
            if (placed) drawn.push(placed.x);

            advance(FRAME_MS);
            elapsed += FRAME_MS;
        }

        return drawn;
    });
}

/** The largest single-frame move, in pixels. */
function biggestStep(positions) {
    let worst = 0;
    for (let i = 1; i < positions.length; i++) {
        worst = Math.max(worst, Math.abs(positions[i] - positions[i - 1]));
    }
    return worst;
}

// A frame of running is 7.5px. Anything beyond a few frames' worth in one
// frame is a jump the eye reads as a teleport.
const FRAME_TRAVEL = (FRAME_MS / 1000) * SPEED;
const JUMP = FRAME_TRAVEL * 3;

test('a clean 20Hz stream is drawn smoothly', () => {
    const drawn = play(4, () => 0);
    assert.ok(drawn.length > 100, 'the fighter should have been drawn every frame');
    assert.ok(biggestStep(drawn) < JUMP,
        `biggest single-frame move ${biggestStep(drawn).toFixed(1)}px, expected under ${JUMP.toFixed(1)}px`);
});

test('states arriving in bursts do not make the fighter jump', () => {
    // Every other state held back and delivered with its neighbour: two
    // states 50ms apart landing in the same millisecond.
    const drawn = play(4, (tick) => (tick % 2 === 0 ? TICK_MS : 0));
    assert.ok(biggestStep(drawn) < JUMP,
        `biggest single-frame move ${biggestStep(drawn).toFixed(1)}px, expected under ${JUMP.toFixed(1)}px`);
});

test('a stream that keeps stalling produces pauses, never jumps', () => {
    // One state in five arrives 300ms late - far beyond the buffer delay, so
    // the playout clock genuinely runs out of history to read.
    const drawn = play(6, (tick) => (tick % 5 === 0 ? 300 : 0));
    assert.ok(biggestStep(drawn) < JUMP,
        `biggest single-frame move ${biggestStep(drawn).toFixed(1)}px, expected under ${JUMP.toFixed(1)}px`);
});

test('the fighter keeps up: playout tracks the stream rather than falling behind', () => {
    const drawn = play(6, () => 0);
    const travelled = drawn[drawn.length - 1] - drawn[0];
    // Six seconds at 450px/s is 2700px. Allow the buffer delay's worth of lag
    // at each end, but nothing like a clock that has stopped keeping up.
    assert.ok(travelled > 2400,
        `drawn travel ${travelled.toFixed(0)}px over 6s, expected the fighter to keep pace`);
});

test('a respawn pins the fighter on its spawn instead of gliding out of stale history', () => {
    withClock(({ advance }) => {
        const interpolation = new Interpolation();
        interpolation.addState({ timestamp: Date.now(), x: 1400, y: 700 });
        advance(200);
        interpolation.getInterpolatedPosition();

        interpolation.reset(128, 128);

        const placed = interpolation.getInterpolatedPosition();
        assert.deepEqual(placed, { x: 128, y: 128 });
    });
});

test('a state describing where a fighter died cannot follow them to their spawn', () => {
    // The reported fault: between the last moment of a round and the spawn of
    // the next one, a fighter shows up somewhere they are not.
    //
    // Emptying the buffer on respawn is not enough on its own. A state that
    // was already on its way when the server moved the body arrives *after*
    // the reset, and an empty buffer has nothing to compare it against - so
    // the corpse's position becomes the only history there is, and that is
    // what gets drawn. The fighter appears back where they died, and stays
    // there until enough fresh states have arrived to push it out.
    withClock(({ advance }) => {
        const interpolation = new Interpolation();

        const death = Date.now();
        interpolation.addState({ timestamp: death, x: 1400, y: 700 });
        advance(200);
        interpolation.getInterpolatedPosition();

        // The round ends, the players read the score, the server respawns
        // everyone. reset() is told when that happened.
        advance(8000);
        const respawnedAt = Date.now();
        interpolation.reset(128, 128, respawnedAt);

        // ...and now the straggler lands, describing the corpse.
        interpolation.addState({ timestamp: death + 20, x: 1400, y: 700 });

        advance(16);
        const placed = interpolation.getInterpolatedPosition();
        assert.deepEqual(placed, { x: 128, y: 128 },
            'a state from before the respawn must not decide where the fighter is drawn');
    });
});

test('fresh states are still accepted after a respawn', () => {
    // The guard above must not swallow the states that matter: one-way latency
    // means a perfectly good state is stamped slightly before it arrives.
    withClock(({ advance }) => {
        const interpolation = new Interpolation();

        const respawnedAt = Date.now();
        interpolation.reset(128, 128, respawnedAt);

        advance(400);
        interpolation.addState({ timestamp: respawnedAt + 50, x: 200, y: 128 });
        interpolation.addState({ timestamp: respawnedAt + 100, x: 300, y: 128 });

        advance(200);
        const placed = interpolation.getInterpolatedPosition();
        assert.ok(placed.x > 128,
            `the fighter should have moved off its spawn, drawn at ${placed.x}`);
    });
});
