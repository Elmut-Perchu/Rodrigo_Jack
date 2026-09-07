// core/debug_log.js - Opt-in verbose tracing for the movement/input/collision path
//
// These traces were added while debugging VS mode synchronisation. They run on
// shared systems, so when left on they fire on every frame in Adventure mode
// too, flooding the console and costing real frame time.
//
// Turn tracing on from the browser console without editing files:
//     localStorage.setItem('rjDebug', '1'); location.reload();
// and off again with:
//     localStorage.removeItem('rjDebug'); location.reload();

function readFlag() {
    try {
        return localStorage.getItem('rjDebug') === '1';
    } catch (e) {
        return false; // Storage blocked (private mode)
    }
}

export const DEBUG_VERBOSE = readFlag();

/** Logs only when verbose tracing is enabled. */
export function dlog(...args) {
    if (DEBUG_VERBOSE) console.log(...args);
}
