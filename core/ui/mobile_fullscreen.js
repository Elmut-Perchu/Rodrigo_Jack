// core/ui/mobile_fullscreen.js - Taking the screen back from the browser
import { IS_MOBILE } from '../mobile.js';

/**
 * Full screen on a phone, and a long press to change your mind.
 *
 * A mobile browser keeps an address bar across the top and, often, a toolbar
 * across the bottom. Together they can take a fifth of a landscape phone -
 * and they take it from the top and bottom edges, which is where the arena's
 * HUD sits and where a fighter jumps to. So the game asks for the whole
 * screen.
 *
 * It cannot simply take it: entering fullscreen requires a genuine user
 * gesture, so the first touch of the session is what actually does it. And it
 * must be givable back - a player needs the address bar to leave, to share the
 * room code, to reload - so a long press anywhere that is not a control
 * toggles it either way. Long press rather than a corner button because a
 * button would sit permanently over a game that has no room to spare, and
 * because there is nothing else a long press means here.
 *
 * The toggle is bound on pointer*up*, not on the timer that measures the hold.
 * Browsers only honour a fullscreen request while a gesture is still being
 * handled; a request fired from a setTimeout during the hold is refused
 * outright on some of them. Measuring the hold and acting when the thumb lifts
 * keeps us inside the gesture, and it also reads better - nothing happens
 * until you let go, so a press that turns out to be too long is not a
 * surprise.
 */

// How long a press has to last to count as deliberate, and how far the thumb
// may wander while it does. The distance matters more than it looks: a thumb
// resting on a screen never holds perfectly still, and a tolerance of a couple
// of pixels would make the gesture feel broken rather than strict.
const HOLD_MS = 600;
const DRIFT_PX = 16;

let installed = false;

// One showing per message. A Set rather than a flag because there are two
// things worth saying once - how to leave, and how to come back - and a single
// flag would let the first swallow the second.
const hintsShown = new Set();

/**
 * @param {object} [options]
 * @param {string} [options.hint]  the one-off line shown the first time,
 *        or '' for none.
 */
export function enableMobileFullscreen(options = {}) {
    if (installed || !IS_MOBILE) return;
    installed = true;

    const hint = options.hint === undefined
        ? 'Appui long : plein écran'
        : options.hint;

    let downAt = 0;
    let downX = 0;
    let downY = 0;
    let armed = false;
    let claimed = false;

    document.addEventListener('pointerdown', event => {
        // A thumb on the joystick or a button is playing, not gesturing: a
        // long jump must not also be a request to change the screen.
        armed = !isControl(event.target);
        downAt = performance.now();
        downX = event.clientX;
        downY = event.clientY;
    }, true);

    document.addEventListener('pointerup', event => {
        const wasArmed = armed;
        armed = false;

        const drifted = Math.hypot(event.clientX - downX, event.clientY - downY) > DRIFT_PX;
        const held = performance.now() - downAt >= HOLD_MS;

        if (wasArmed && !drifted && held) {
            toggleFullscreen();
            return;
        }

        // The first touch of the session claims the screen, whatever it
        // landed on - in Adventure that is the Start button, and waiting for
        // a tap on bare scenery would mean playing the first level with the
        // address bar still there.
        //
        // Once, and only once: after this the long press is the sole way the
        // screen changes hands, so a player who deliberately left fullscreen
        // is not dragged back into it by their next tap.
        if (!claimed) {
            claimed = true;
            if (!isFullscreen()) {
                requestFullscreen();
                if (hint) showHint(hint);
            }
        }
    }, true);

    // Leaving fullscreen by the system gesture (a swipe down, the back
    // button) is a decision like any other: nothing here fights it. All that
    // is offered is the way back.
    document.addEventListener('fullscreenchange', () => {
        if (!isFullscreen() && hint) showHint('Appui long : revenir en plein écran');
    });
}

function isControl(target) {
    return !!(target && target.closest
        && target.closest('.tc-root, button, input, select, textarea, a, .round-banner, .game-over-screen'));
}

export function isFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
}

export function requestFullscreen() {
    const element = document.documentElement;
    const request = element.requestFullscreen || element.webkitRequestFullscreen;

    // iPhone Safari has no fullscreen for anything but a video, so the only
    // way to lose its bars is to add the game to the home screen - which the
    // apple-mobile-web-app-capable meta tag in the pages makes work. Nothing
    // useful to do here beyond not throwing.
    if (!request) return Promise.resolve(false);

    return settle(() => request.call(element, { navigationUI: 'hide' }));
}

export function exitFullscreen() {
    const exit = document.exitFullscreen || document.webkitExitFullscreen;
    if (!exit) return Promise.resolve(false);
    return settle(() => exit.call(document));
}

/**
 * Runs a fullscreen call and always answers with a promise of a boolean.
 *
 * The standard methods return a promise; the webkit-prefixed ones return
 * nothing at all, so chaining .then() straight onto the call throws on exactly
 * the browsers the prefixed path exists for. And a request made outside a user
 * gesture is refused - sometimes by rejection, sometimes by throwing on the
 * spot - which is a "no", not a fault: the screen simply stays as it was.
 */
function settle(call) {
    try {
        return Promise.resolve(call()).then(() => true, () => false);
    } catch (error) {
        return Promise.resolve(false);
    }
}

export function toggleFullscreen() {
    return isFullscreen() ? exitFullscreen() : requestFullscreen();
}

/**
 * A line at the top of the screen, once.
 *
 * A gesture nobody is told about is a gesture nobody uses, and there is no
 * room on a phone for a permanent legend explaining it.
 */
function showHint(text) {
    if (hintsShown.has(text)) return;
    hintsShown.add(text);

    const toast = document.createElement('div');
    toast.textContent = text;
    toast.style.cssText = [
        'position:fixed', 'top:10px', 'left:50%', 'transform:translateX(-50%)',
        'z-index:5000', 'pointer-events:none',
        'padding:7px 12px', 'border-radius:6px',
        'background:rgba(0,0,0,0.78)', 'color:#ecf0f1',
        "font-family:'Press Start 2P',sans-serif", 'font-size:8px',
        'opacity:0', 'transition:opacity 0.3s ease'
    ].join(';');

    document.body.appendChild(toast);
    requestAnimationFrame(() => { toast.style.opacity = '1'; });

    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 400);
    }, 2600);
}
