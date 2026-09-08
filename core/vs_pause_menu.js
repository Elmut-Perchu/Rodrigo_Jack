// core/vs_pause_menu.js - Stopping, and everything you might want while stopped
import { getVolume, setVolume } from './vs_prefs.js';

/**
 * The in-match menu: pause, volume, rematch, leave.
 *
 * Built here rather than in the page so the arena keeps one owner for its
 * overlays and the markup does not grow a fourth screen. It borrows the
 * game-over screen's look on purpose - a player should not have to work out
 * that two panels from the same game belong to the same game.
 *
 * The one thing it will not do is lie about pausing. Against the computer,
 * time genuinely stops: nothing else is running, so nothing is lost by
 * waiting. Online it cannot - the other fighters are on their own machines and
 * the match goes on without you - so the panel opens over a match that is
 * still being fought, and says so. Freezing only this client would leave the
 * player standing still while being shot at, which is worse than not pausing
 * at all.
 */
export class VSPauseMenu {
    /**
     * @param {object} game       the running GameVSSimple
     * @param {object} actions    { onRestart, onQuit } - navigation belongs to
     *                            the page, which knows where it came from
     */
    constructor(game, actions = {}) {
        this.game = game;
        this.actions = actions;
        this.isOpen = false;

        // A bot match has a local arbiter standing in for the server, and
        // nobody else waiting on this client.
        this.canFreeze = !!game.arbiter;

        this.injectStyles();
        this.build();

        this.onKeyDown = (event) => {
            const key = (event.key || '').toLowerCase();
            if (key !== 'escape' && key !== 'p') return;
            if (isTyping(event.target)) return;

            // Never over the top of the end-of-match screen: the match is
            // finished, and its own buttons are the way out.
            if (this.matchIsOver()) return;

            event.preventDefault();
            this.toggle();
        };
        document.addEventListener('keydown', this.onKeyDown);
    }

    matchIsOver() {
        const screen = document.getElementById('game-over-screen');
        return !!screen && getComputedStyle(screen).display !== 'none';
    }

    toggle() {
        this.isOpen ? this.close() : this.open();
    }

    open() {
        if (this.isOpen) return;
        this.isOpen = true;

        this.slider.value = String(Math.round(getVolume() * 100));
        this.paintVolume();

        if (this.canFreeze) {
            this.game.isPaused = true;
            // Keys held at the moment of pausing would still be held on
            // resume, sending the fighter off in a direction nobody asked for.
            const input = this.game.localPlayer?.getComponent('input');
            if (input?.keys) input.keys.clear();
            if (input) input.jumpHeld = false;
        }

        this.root.style.display = 'flex';
    }

    close() {
        if (!this.isOpen) return;
        this.isOpen = false;
        this.root.style.display = 'none';
        this.game.isPaused = false;
    }

    dispose() {
        document.removeEventListener('keydown', this.onKeyDown);
        this.root.remove();
    }

    // === Building it ===

    build() {
        this.root = document.createElement('div');
        this.root.className = 'vs-pause-screen';
        this.root.id = 'vs-pause-screen';

        const panel = document.createElement('div');
        panel.className = 'vs-pause-panel';

        const title = document.createElement('div');
        title.className = 'vs-pause-title';
        title.textContent = this.canFreeze ? 'PAUSED' : 'OPTIONS';
        panel.appendChild(title);

        if (!this.canFreeze) {
            const note = document.createElement('div');
            note.className = 'vs-pause-note';
            note.textContent = 'The match keeps running - the other players are still fighting.';
            panel.appendChild(note);
        }

        panel.appendChild(this.buildVolume());
        panel.appendChild(this.buildButtons());

        const hint = document.createElement('div');
        hint.className = 'vs-pause-hint';
        hint.textContent = 'Esc or P to close';
        panel.appendChild(hint);

        this.root.appendChild(panel);
        document.body.appendChild(this.root);

        // Clicking the darkened area behind the panel closes it too.
        this.root.addEventListener('click', (event) => {
            if (event.target === this.root) this.close();
        });
    }

    buildVolume() {
        const row = document.createElement('div');
        row.className = 'vs-pause-volume';

        const label = document.createElement('label');
        label.className = 'vs-pause-label';
        label.textContent = 'Volume';
        label.setAttribute('for', 'vs-pause-volume-slider');
        row.appendChild(label);

        this.slider = document.createElement('input');
        this.slider.type = 'range';
        this.slider.id = 'vs-pause-volume-slider';
        this.slider.min = '0';
        this.slider.max = '100';
        this.slider.step = '1';
        this.slider.value = String(Math.round(getVolume() * 100));
        row.appendChild(this.slider);

        this.readout = document.createElement('span');
        this.readout.className = 'vs-pause-readout';
        row.appendChild(this.readout);

        // Live, so the slider is something you hear rather than something you
        // set and then go and test.
        this.slider.addEventListener('input', () => {
            setVolume(Number(this.slider.value) / 100);
            this.paintVolume();
        });

        this.paintVolume();
        return row;
    }

    paintVolume() {
        this.readout.textContent = `${this.slider.value}%`;
    }

    buildButtons() {
        const row = document.createElement('div');
        row.className = 'vs-pause-buttons';

        row.appendChild(this.button('Resume', 'resume', () => this.close()));

        if (this.actions.onRestart) {
            const label = this.canFreeze ? 'Restart' : 'Back to Lobby';
            row.appendChild(this.button(label, 'restart', () => {
                this.close();
                this.actions.onRestart();
            }));
        }

        if (this.actions.onQuit) {
            row.appendChild(this.button('Main Menu', 'quit', () => {
                this.close();
                this.actions.onQuit();
            }));
        }

        return row;
    }

    button(text, variant, onClick) {
        const button = document.createElement('button');
        button.className = `vs-pause-btn vs-pause-${variant}`;
        button.textContent = text;
        button.addEventListener('click', onClick);
        return button;
    }

    injectStyles() {
        if (document.getElementById('vs-pause-styles')) return;

        const style = document.createElement('style');
        style.id = 'vs-pause-styles';
        style.textContent = `
        .vs-pause-screen {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.85);
            display: none;
            justify-content: center;
            align-items: flex-start;
            /* The body cannot scroll - it holds a fixed-size arena - so an
               overlay taller than the window has to scroll on its own. */
            overflow-y: auto;
            z-index: 2500;
        }
        .vs-pause-panel {
            margin: auto 0;
            background-color: #2c3e50;
            border: 4px solid #ecf0f1;
            border-radius: 10px;
            padding: 32px 40px;
            text-align: center;
            font-family: 'Press Start 2P', sans-serif;
            max-width: 90vw;
        }
        .vs-pause-title {
            font-size: 24px;
            color: #f39c12;
            margin-bottom: 18px;
        }
        .vs-pause-note {
            font-size: 9px;
            line-height: 1.7;
            color: #e67e22;
            margin-bottom: 20px;
            max-width: 320px;
        }
        .vs-pause-volume {
            display: flex;
            align-items: center;
            gap: 12px;
            justify-content: center;
            margin-bottom: 26px;
        }
        .vs-pause-label {
            font-size: 10px;
            color: #ecf0f1;
        }
        .vs-pause-volume input[type="range"] {
            width: 160px;
            accent-color: #3498db;
            cursor: pointer;
        }
        .vs-pause-readout {
            font-size: 10px;
            color: #95a5a6;
            min-width: 42px;
            text-align: right;
        }
        .vs-pause-buttons {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
        .vs-pause-btn {
            padding: 14px 26px;
            border: none;
            border-radius: 5px;
            font-family: 'Press Start 2P', sans-serif;
            font-size: 11px;
            color: white;
            cursor: pointer;
            transition: background-color 0.2s;
        }
        .vs-pause-resume { background-color: #27ae60; }
        .vs-pause-resume:hover { background-color: #1e8449; }
        .vs-pause-restart { background-color: #3498db; }
        .vs-pause-restart:hover { background-color: #2980b9; }
        .vs-pause-quit { background-color: #95a5a6; }
        .vs-pause-quit:hover { background-color: #7f8c8d; }
        .vs-pause-hint {
            margin-top: 20px;
            font-size: 8px;
            color: #7f8c8d;
        }`;
        document.head.appendChild(style);
    }
}

/** Never steal keys from the chat box or a nickname field. */
function isTyping(target) {
    if (!target || !target.tagName) return false;
    const tag = target.tagName.toLowerCase();
    return tag === 'input' || tag === 'textarea' || target.isContentEditable === true;
}
