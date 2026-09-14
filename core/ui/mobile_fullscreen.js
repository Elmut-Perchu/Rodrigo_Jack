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

    const support = fullscreenSupport();

    // Opened from the home screen: the manifest already gave the game the whole
    // screen in landscape. Nothing to claim, and nothing to explain.
    if (support === 'installed') return;

    // An iPhone in Safari. There is no fullscreen to request here, so promising
    // one with a hint about a long press would be a lie the player then spends
    // a while disproving. Say the true thing instead, once, and stop.
    if (support === 'homescreen') {
        showHomescreenCard();
        return;
    }

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

/**
 * Whether the game is already running as an installed app.
 *
 * `navigator.standalone` is Safari's own flag for a page opened from the home
 * screen; the media query is the standard equivalent, which Chrome answers.
 * Either way there are no bars to remove and nothing here has anything to do.
 */
export function isStandalone() {
    if (window.navigator.standalone) return true;
    return !!(window.matchMedia
        && window.matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches);
}

/**
 * What this device can actually offer, which is not the same everywhere.
 *
 *   'installed'  - already opened from the home screen; nothing to ask for.
 *   'api'        - Fullscreen API present. Android, desktop, iPad since iOS 12.
 *   'homescreen' - no API at all. This is the iPhone, where Safari exposes
 *                  fullscreen for video and for nothing else, and where the
 *                  only way to lose the bars is to add the game to the home
 *                  screen - which the manifest then opens in landscape with
 *                  no browser chrome.
 *
 * The distinction is the whole point of this rewrite. The old code returned a
 * quiet false on an iPhone and told the player nothing, so the long press
 * appeared broken rather than unavailable - which is exactly what "on ne sait
 * pas comment faire" was describing.
 */
export function fullscreenSupport() {
    if (isStandalone()) return 'installed';
    const element = document.documentElement;
    if (element.requestFullscreen || element.webkitRequestFullscreen) return 'api';
    return 'homescreen';
}

/**
 * Turns the phone sideways and keeps it there, where that is allowed.
 *
 * A platformer wants landscape, and a rotation mid-jump is a lost platform.
 * The lock only works from inside fullscreen, which is why it is called after
 * entering rather than on its own, and it simply does not exist on iOS. A
 * refusal is an answer, not a fault: the game plays either way round.
 */
function lockLandscape() {
    const orientation = window.screen && window.screen.orientation;
    if (!orientation || typeof orientation.lock !== 'function') return;
    try {
        const result = orientation.lock('landscape');
        if (result && result.catch) result.catch(() => {});
    } catch (error) {
        /* declined */
    }
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

    return settle(() => request.call(element, { navigationUI: 'hide' }))
        .then(ok => {
            if (ok) lockLandscape();
            return ok;
        });
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
 * What to do on an iPhone, said plainly and only once.
 *
 * A toast is wrong for this: it is three steps long, it involves leaving the
 * page, and it disappears before it can be followed. So it is a small panel
 * that waits to be dismissed, and it remembers having been dismissed - nobody
 * needs telling twice, and a nag over a game is worse than bars around it.
 */
function showHomescreenCard() {
    const KEY = 'rj_homescreen_hint';
    try {
        if (localStorage.getItem(KEY)) return;
    } catch (error) {
        /* private browsing: show it, once per session, rather than never */
    }

    const card = document.createElement('div');
    card.className = 'rj-homescreen-card';
    card.innerHTML = `
        <strong>Plein écran</strong>
        <p>Safari sur iPhone ne permet pas le plein écran depuis une page.
        Pour jouer sans les barres :</p>
        <ol><li>Bouton Partager</li><li>« Sur l'écran d'accueil »</li>
        <li>Ouvrir le jeu depuis l'icône</li></ol>
        <button type="button">Compris</button>`;

    const style = document.createElement('style');
    style.textContent = `
    .rj-homescreen-card {
        position: fixed; left: 50%; top: 50%;
        transform: translate(-50%, -50%);
        z-index: 6000; max-width: 300px;
        padding: 16px 18px; border-radius: 10px;
        background: rgba(10, 12, 18, 0.96);
        border: 2px solid #3498db; color: #ecf0f1;
        font-family: 'Press Start 2P', sans-serif; font-size: 8px; line-height: 1.8;
    }
    .rj-homescreen-card strong { display: block; margin-bottom: 10px; font-size: 10px; color: #3498db; }
    .rj-homescreen-card p { margin: 0 0 10px; }
    .rj-homescreen-card ol { margin: 0 0 14px; padding-left: 16px; }
    .rj-homescreen-card li { margin-bottom: 5px; }
    .rj-homescreen-card button {
        display: block; width: 100%; padding: 9px;
        background: #3498db; border: none; border-radius: 5px;
        color: #fff; font-family: inherit; font-size: 8px; cursor: pointer;
    }`;

    card.querySelector('button').addEventListener('click', () => {
        card.remove();
        style.remove();
        try { localStorage.setItem(KEY, '1'); } catch (error) { /* nothing to do */ }
    });

    document.head.appendChild(style);
    document.body.appendChild(card);
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
