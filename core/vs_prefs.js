// core/vs_prefs.js - What the player should not have to tell us twice
//
// The nickname used to live in sessionStorage under two different names
// (`playerNickname` and `vsPlayerName`), written by some screens and read by
// others, and gone the moment the tab closed. So the same person typed the
// same name into three separate boxes on one menu, and again the next day.
//
// One place, one key, and localStorage rather than sessionStorage: a name is
// an identity, not a detail of this particular visit. The session *id* stays
// in sessionStorage on purpose (core/network/websocket_client.js) - that one
// must differ per tab, or two tabs would claim the same seat.

const NAME_KEY = 'vs.playerName';
const VOLUME_KEY = 'vs.volume';

// Written by the older screens. Read once so nobody who already had a name
// loses it, and kept up to date so anything still reading them agrees.
const LEGACY_NAME_KEYS = ['vsPlayerName', 'playerNickname'];

export const NAME_MIN = 3;
export const NAME_MAX = 15;
export const DEFAULT_VOLUME = 0.45;

/** Storage throws outright in some privacy modes, so every access is guarded. */
function read(store, key) {
    try {
        return store.getItem(key);
    } catch {
        return null;
    }
}

function write(store, key, value) {
    try {
        store.setItem(key, value);
    } catch {
        // Nothing to do: preferences are a convenience, never a requirement.
    }
}

function remove(store, key) {
    try {
        store.removeItem(key);
    } catch {
        // As above.
    }
}

export function isValidName(name) {
    if (typeof name !== 'string') return false;
    const trimmed = name.trim();
    return trimmed.length >= NAME_MIN && trimmed.length <= NAME_MAX;
}

/**
 * The name this player goes by, or '' if they have never given one.
 *
 * Falls back to the old session keys the first time, so an upgrade mid-visit
 * does not make someone re-introduce themselves.
 */
export function getPlayerName() {
    const stored = read(localStorage, NAME_KEY);
    if (stored) return stored;

    for (const key of LEGACY_NAME_KEYS) {
        const legacy = read(sessionStorage, key);
        if (legacy) {
            setPlayerName(legacy);
            return legacy.trim();
        }
    }

    return '';
}

export function hasPlayerName() {
    return getPlayerName() !== '';
}

/** Records the name everywhere anything might look for it. */
export function setPlayerName(name) {
    if (!isValidName(name)) return false;

    const trimmed = name.trim();
    write(localStorage, NAME_KEY, trimmed);

    // Screens not yet moved over still read these.
    LEGACY_NAME_KEYS.forEach(key => write(sessionStorage, key, trimmed));

    return true;
}

export function forgetPlayerName() {
    remove(localStorage, NAME_KEY);
    LEGACY_NAME_KEYS.forEach(key => remove(sessionStorage, key));
}

// === Volume ===

const volumeListeners = new Set();

/** 0 to 1. Defaults to the level the arena was tuned at. */
export function getVolume() {
    const stored = read(localStorage, VOLUME_KEY);
    if (stored === null) return DEFAULT_VOLUME;

    const value = Number.parseFloat(stored);
    if (!Number.isFinite(value)) return DEFAULT_VOLUME;

    return Math.max(0, Math.min(1, value));
}

export function setVolume(value) {
    const clamped = Math.max(0, Math.min(1, Number(value) || 0));
    write(localStorage, VOLUME_KEY, String(clamped));
    volumeListeners.forEach(fn => fn(clamped));
    return clamped;
}

/**
 * Called whenever the volume changes, so a running match follows the slider
 * as it moves rather than on the next reload. Returns an unsubscribe.
 */
export function onVolumeChange(fn) {
    volumeListeners.add(fn);
    return () => volumeListeners.delete(fn);
}
