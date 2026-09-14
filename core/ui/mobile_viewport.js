// core/ui/mobile_viewport.js - Stopping the browser from playing with the game
import { IS_TOUCH } from '../mobile.js';

/**
 * Takes the browser's own touch gestures out of the way.
 *
 * A phone browser reserves several gestures for itself - pinch to zoom, double
 * tap to zoom, long press for a context menu, drag past the edge to refresh -
 * and every one of them is also something a player does on purpose. A pinch is
 * two thumbs on the controls. A double tap is two quick jumps. A long press is
 * how this game gives the screen back. Left alone, the browser wins all four
 * arguments and the game loses the round.
 *
 * **The viewport meta tag does not do this job.** Both pages carry
 * `user-scalable=no, maximum-scale=1.0`, which reads like the answer and is
 * the most repeated advice on the subject. Safari has ignored both on iOS
 * since iOS 10: Apple decided a page may not take zoom away from a reader, and
 * no meta tag overrides that. The tag still earns its place on Android, but on
 * an iPhone it is decoration, and a game relying on it is not protected at all.
 *
 * What does work is asking per element, which is what `touch-action` is for,
 * plus WebKit's own gesture events for the pinch it does not cover.
 *
 * ## What is deliberately NOT done here
 *
 * The usual recipe ends with `touchmove` being cancelled whenever more than
 * one finger is down. That is exactly wrong for this game. Two fingers down is
 * the normal way to play it - a thumb steering the stick while the other
 * throws a sword - and cancelling those events risks the pointer stream the
 * controls are built on. `touch-action` already tells the browser to keep its
 * hands off those elements, which is the same protection without touching the
 * events the game needs.
 */

// A second tap this soon after the first, near enough to it, is the browser's
// double-tap-to-zoom rather than two deliberate presses. touch-action handles
// this wherever it is honoured; the check below is what covers the browsers
// where it is not.
const DOUBLE_TAP_MS = 320;
const DOUBLE_TAP_PX = 32;

let installed = false;

export function lockViewport() {
    if (installed || !IS_TOUCH) return;
    installed = true;

    injectStyles();
    blockPinch();
    blockDoubleTapZoom();
}

/**
 * The declarative half, and the half that does most of the work.
 *
 * `touch-action: manipulation` on the page keeps scrolling and panning - the
 * lobby has a chat to scroll, the game-over screen has a list - while dropping
 * double-tap zoom and the legacy 300ms wait that came with it. The surfaces
 * that are played on get `none` instead: nothing there is ever a scroll.
 */
function injectStyles() {
    if (document.getElementById('mobile-viewport-lock')) return;

    const style = document.createElement('style');
    style.id = 'mobile-viewport-lock';
    style.textContent = `
    html, body {
        touch-action: manipulation;
        /* Stops the page rubber-banding and, on Chrome, stops a downward drag
           at the top of the screen from reloading the game mid-match. */
        overscroll-behavior: none;
    }
    body {
        /* A long press is this game's fullscreen toggle. Without these two an
           iPhone answers it with a text-selection loupe and a copy/share
           menu - the gesture appears broken, which is precisely the complaint
           that started this. */
        -webkit-touch-callout: none;
        -webkit-user-select: none;
        user-select: none;
        /* The grey flash iOS paints over whatever was tapped. Fine on a link,
           wrong on a sprite. */
        -webkit-tap-highlight-color: transparent;
    }
    .container, .game-world, .vs-game-wrapper, .tc-root {
        touch-action: none;
    }
    /* Anything that genuinely scrolls has to say so, since the surfaces above
       have just been told not to. */
    .chat-messages, .leaderboard, .scoreboard, .options-panel {
        touch-action: pan-y;
    }`;
    document.head.appendChild(style);
}

/**
 * Pinch, on WebKit.
 *
 * Safari reports a two-finger pinch through its own non-standard `gesture*`
 * events, and cancelling `gesturestart` is what actually refuses the zoom on
 * an iPhone - the one browser where the viewport meta tag is ignored and
 * `touch-action` arrived late. They do not exist on Chrome, where
 * `touch-action: none` above has already settled it, so nothing here fires.
 *
 * `gesturechange` and `gestureend` are cancelled too: a gesture already under
 * way when this installs would otherwise finish its zoom.
 */
function blockPinch() {
    const refuse = event => event.preventDefault();
    for (const name of ['gesturestart', 'gesturechange', 'gestureend']) {
        document.addEventListener(name, refuse, { passive: false });
    }
}

/**
 * Double tap, where touch-action is not honoured.
 *
 * Only the second tap of a pair is cancelled, and only when it lands close to
 * the first and soon after it. Cancelling on that narrow a condition matters:
 * `touchend` is what produces the click, and refusing them all would silence
 * every button on the page.
 */
function blockDoubleTapZoom() {
    let lastAt = 0;
    let lastX = 0;
    let lastY = 0;

    document.addEventListener('touchend', event => {
        const touch = event.changedTouches[0];
        if (!touch) return;

        const now = performance.now();
        const quick = now - lastAt < DOUBLE_TAP_MS;
        const near = Math.hypot(touch.clientX - lastX, touch.clientY - lastY) < DOUBLE_TAP_PX;

        if (quick && near && event.cancelable) event.preventDefault();

        lastAt = now;
        lastX = touch.clientX;
        lastY = touch.clientY;
    }, { passive: false });
}
