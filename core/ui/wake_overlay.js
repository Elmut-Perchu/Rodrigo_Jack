// core/ui/wake_overlay.js - "Server is waking up" overlay
//
// Render's free web services fall asleep after 15 minutes idle and take up
// to ~50s to wake on the next request. withWakeUp() retries a connection
// attempt until it succeeds, showing this overlay only once the first try
// has already failed - so a server that's already awake never flashes it.

let overlayEl = null;
let messageEl = null;
let timeEl = null;

function injectStyles() {
    if (document.getElementById('wake-overlay-styles')) return;
    const style = document.createElement('style');
    style.id = 'wake-overlay-styles';
    style.textContent = `
        #wake-overlay {
            position: fixed;
            inset: 0;
            background: rgba(10, 10, 20, 0.92);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            z-index: 99999;
            font-family: 'Press Start 2P', monospace, sans-serif;
            color: #fff;
            text-align: center;
            padding: 24px;
        }
        #wake-overlay .wake-spinner {
            width: 48px;
            height: 48px;
            border: 6px solid #333;
            border-top-color: #7dd3fc;
            border-radius: 50%;
            animation: wake-spin 0.9s linear infinite;
            margin-bottom: 20px;
        }
        #wake-overlay .wake-message {
            font-size: 12px;
            line-height: 1.8;
            max-width: 420px;
            white-space: pre-line;
        }
        #wake-overlay .wake-time {
            margin-top: 12px;
            font-size: 10px;
            color: #9ca3af;
        }
        @keyframes wake-spin {
            to { transform: rotate(360deg); }
        }
    `;
    document.head.appendChild(style);
}

export function showWakeOverlay(message) {
    injectStyles();
    if (!overlayEl) {
        overlayEl = document.createElement('div');
        overlayEl.id = 'wake-overlay';
        overlayEl.innerHTML = `
            <div class="wake-spinner"></div>
            <div class="wake-message"></div>
            <div class="wake-time"></div>
        `;
        document.body.appendChild(overlayEl);
        messageEl = overlayEl.querySelector('.wake-message');
        timeEl = overlayEl.querySelector('.wake-time');
    }
    messageEl.textContent = message;
    timeEl.textContent = '';
}

export function updateWakeOverlayTime(elapsedSeconds) {
    if (timeEl) timeEl.textContent = `${elapsedSeconds}s...`;
}

export function hideWakeOverlay() {
    if (overlayEl) {
        overlayEl.remove();
        overlayEl = null;
        messageEl = null;
        timeEl = null;
    }
}

const ATTEMPT_TIMEOUT = Symbol('wake-attempt-timeout');

/**
 * Retries `attempt` until it resolves, showing the wake-up overlay after the
 * first failure instead of surfacing it immediately as an error. Built for
 * Render's free tier: a failed (or merely slow - Render can queue the
 * request behind the boot instead of erroring) first attempt usually means
 * the server is asleep, not broken, so it's worth a minute of retries
 * before giving up.
 *
 * Each attempt is raced against `retryDelayMs`: a hanging request counts as
 * "still waking up" and `attempt` is called again, so the overlay always
 * appears quickly instead of leaving a blank screen for the whole cold
 * start. That means `attempt` can be invoked more than once concurrently -
 * fine for reconnect-style calls (WebSocketClient.connect, idempotent GETs),
 * but callers doing a non-idempotent write (e.g. POSTing a score) should
 * accept the small chance of a duplicate rather than use this wrapper for
 * anything where that would matter.
 */
export async function withWakeUp(attempt, {
    message = "Reveil du serveur en cours...\nCa peut prendre jusqu'a 50 secondes.",
    maxWaitMs = 75000,
    retryDelayMs = 3000
} = {}) {
    const start = Date.now();
    let shown = false;
    let lastError;

    while (Date.now() - start < maxWaitMs) {
        const timeout = new Promise(resolve => setTimeout(() => resolve(ATTEMPT_TIMEOUT), retryDelayMs));

        try {
            const result = await Promise.race([attempt(), timeout]);
            if (result === ATTEMPT_TIMEOUT) {
                throw new Error('Attempt timed out, still waking up');
            }
            if (shown) hideWakeOverlay();
            return result;
        } catch (err) {
            lastError = err;
            if (!shown) {
                showWakeOverlay(message);
                shown = true;
            }
            updateWakeOverlayTime(Math.round((Date.now() - start) / 1000));
        }
    }

    if (shown) hideWakeOverlay();
    throw lastError || new Error('Le serveur ne repond pas.');
}
