// core/systems_vs/vs_away_watch.js - Nobody plays while somebody is not looking

/**
 * Reports this client leaving the screen, and shows why a match has stopped.
 *
 * A backgrounded tab stops receiving requestAnimationFrame and has its timers
 * throttled to about one tick a minute. The whole game loop stops: no physics,
 * no input read, no state sent. What the server saw, until this existed, was a
 * player who had simply stopped moving - so it went on rebroadcasting their
 * last position, and the others went on fighting around a fighter who had
 * become a statue and could still be shot.
 *
 * That is the "décalage" players reported after locking a phone, turning it to
 * landscape, or reading a notification: not drift in the usual sense, but a
 * match that carried on without one of its players and then had to be
 * reconciled with a client that had missed all of it.
 *
 * So the client says when it goes and when it comes back, and the server holds
 * the match in between (server/away.go). The freeze itself reuses
 * GameVSSimple.isPaused, which already holds the clock still - resuming does
 * not hand the physics the length of the pause in one frame.
 */

/**
 * @param {object} game            GameVSSimple
 * @param {object} [options]
 * @param {boolean} [options.online]  false for a bot match, where there is no
 *        server to tell and the pause is purely local.
 */
export function watchAway(game, options = {}) {
    const online = options.online !== false;
    let away = false;

    const report = next => {
        if (next === away) return;
        away = next;

        if (!online) {
            // Against the computer there is nobody to wait for us: hold the
            // match here and let it go again on return. A bot match that kept
            // running while the screen was off would be a match already lost
            // by the time it was looked at again.
            game.isPaused = next;
            if (next) showCurtain(['Vous']);
            else hideCurtain();
            return;
        }

        // Sent while the tab is on its way out. The socket is still open at
        // this point - throttling affects timers, not an already-queued
        // frame - so this reaches the server even as the screen goes dark.
        game.send(next ? 'player_away' : 'player_back', {});
    };

    const onVisibility = () => report(document.hidden === true);

    document.addEventListener('visibilitychange', onVisibility);

    // Belt and braces for the cases visibilitychange is late or absent: a
    // phone locking, and a browser being switched away from without the tab
    // formally hiding. `pagehide` covers a real navigation, where the socket
    // closes anyway and the server falls back on its disconnect path.
    window.addEventListener('pagehide', () => report(true));
    window.addEventListener('pageshow', () => report(false));

    return () => {
        document.removeEventListener('visibilitychange', onVisibility);
    };
}

/**
 * Handles the server saying the match is held.
 *
 * Naming who is missing matters more than it looks. A match that simply stops
 * reads as a crash, and the first thing anyone does about a crash is reload -
 * which, here, would be the one action that actually loses the match.
 */
export function handleMatchPaused(game, data) {
    game.isPaused = true;
    showCurtain(data && data.awayNames && data.awayNames.length
        ? data.awayNames
        : ['Un joueur']);
}

export function handleMatchResumed(game, data) {
    game.isPaused = false;
    hideCurtain();

    if (data && data.abandoned) {
        flash('La partie reprend sans le joueur absent');
    }
}

let curtain = null;

function showCurtain(names) {
    if (!curtain) {
        curtain = document.createElement('div');
        curtain.className = 'vs-away-curtain';
        curtain.innerHTML = '<div class="vs-away-box">'
            + '<strong>EN PAUSE</strong>'
            + '<p class="vs-away-who"></p>'
            + '<p class="vs-away-note">La partie reprend des son retour</p>'
            + '</div>';
        injectStyles();
        document.body.appendChild(curtain);
    }

    const who = curtain.querySelector('.vs-away-who');
    who.textContent = names.length > 1
        ? `${names.join(', ')} ont quitte l'ecran`
        : `${names[0]} a quitte l'ecran`;

    curtain.style.display = 'flex';
}

function hideCurtain() {
    if (curtain) curtain.style.display = 'none';
}

/** A line that says itself and goes, for the case nobody came back. */
function flash(text) {
    const note = document.createElement('div');
    note.className = 'vs-away-flash';
    note.textContent = text;
    injectStyles();
    document.body.appendChild(note);
    setTimeout(() => note.remove(), 3200);
}

function injectStyles() {
    if (document.getElementById('vs-away-styles')) return;

    const style = document.createElement('style');
    style.id = 'vs-away-styles';
    style.textContent = `
    .vs-away-curtain {
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        display: flex; align-items: center; justify-content: center;
        /* Over the arena and the HUD, under the round banner - a round that
           was being announced when the pause began should still be legible. */
        z-index: 1800;
        background: rgba(0, 0, 0, 0.72);
        font-family: 'Press Start 2P', sans-serif;
        color: #ecf0f1;
        text-align: center;
    }
    .vs-away-box {
        padding: 22px 26px;
        border: 2px solid #f39c12;
        border-radius: 10px;
        background: rgba(10, 12, 18, 0.95);
        max-width: 78vw;
    }
    .vs-away-box strong {
        display: block; margin-bottom: 14px;
        font-size: 14px; color: #f39c12; letter-spacing: 2px;
    }
    .vs-away-who { margin: 0 0 10px; font-size: 9px; line-height: 1.8; }
    .vs-away-note { margin: 0; font-size: 7px; color: #95a5a6; }
    .vs-away-flash {
        position: fixed; top: 14px; left: 50%;
        transform: translateX(-50%);
        z-index: 1900; padding: 8px 14px; border-radius: 6px;
        background: rgba(0, 0, 0, 0.82); color: #ecf0f1;
        font-family: 'Press Start 2P', sans-serif; font-size: 8px;
    }`;
    document.head.appendChild(style);
}
