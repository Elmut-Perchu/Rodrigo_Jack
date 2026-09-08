// core/systems_vs/vs_fighter_hud_system.js - What you need to see without looking away
import { System } from '../systems/system.js';
import { arrowIcon, reticleIcon, ARROW_ASPECT } from '../vs_pixel_icons.js';

// The fighter's sprite frame, and where the body sits inside it.
const FRAME = 110;
const BODY_X = 55;
const BODY_Y = 79;

// How far out along the aim the sight sits: clear of the fighter's own body,
// close enough to read as belonging to them.
const SIGHT_RADIUS = 84;
const SIGHT_SIZE = 18;

// Upright arrows, so height is what you notice and width is what you spend.
// Seven of these plus their gaps come to 61px inside a 110px frame - the row
// stays narrower than the fighter carrying it.
const PIP_HEIGHT = 10;
const PIP_WIDTH = Math.round(PIP_HEIGHT * ARROW_ASPECT);
const PIP_GAP = 2;

// The sight has to be found instantly in the middle of a brawl, so it is the
// one thing in the arena wearing a colour the artwork never uses: everything
// else is stone, leather and the four fighters' own liveries. Red for an empty
// quiver, because that reads as "no" before it is even identified as a sight.
const SIGHT_COLOUR = '#ffd21e';
const SIGHT_EMPTY_COLOUR = '#ff3b30';

/**
 * The two things a bow needs, drawn on the fighter rather than in a corner.
 *
 * Arrows left, as arrows: a count in the corner of the screen is a number you
 * have to look away to read, and looking away while aiming is exactly the
 * wrong moment. A short row of them above your own head is read without
 * moving your eyes off the fight.
 *
 * And a sight, because the arena can now be aimed in eight directions. Until
 * this there was nothing on screen that said which of them was armed - the
 * only feedback was the shot itself, after it was too late to change.
 *
 * These live in their own layer rather than inside the fighter's div, because
 * that div is mirrored with scaleX(-1) whenever they face left: as children
 * the arrows would point backwards and the sight would appear on the wrong
 * side of the body.
 */
export class VSFighterHud extends System {
    constructor(game) {
        super(game);

        // Presentation: once per drawn frame, like the rest of the rendering.
        this.fixedStep = false;
        this.game = game;

        this.layer = null;
        this.marks = new Map(); // entity uuid -> { root, pips, sight, shown }

        this.pipIcon = arrowIcon('#f0d8a8');
        this.sightIcon = reticleIcon(SIGHT_COLOUR);
        this.sightEmptyIcon = reticleIcon(SIGHT_EMPTY_COLOUR);

        this.injectStyles();
    }

    update() {
        const local = this.game.localPlayer;
        if (!local) return;

        // Only your own: an opponent's ammunition is not yours to read, and
        // four fighters wearing their own sights would bury the arena.
        this.paint(local);
    }

    removeEntity(entity) {
        super.removeEntity(entity);
        const mark = this.marks.get(entity.uuid);
        if (mark) {
            mark.root.remove();
            this.marks.delete(entity.uuid);
        }
    }

    paint(entity) {
        const position = entity.getComponent('position');
        const property = entity.getComponent('property');
        if (!position) return;

        const mark = this.ensure(entity);
        if (!mark) return;

        // Nothing to aim with, and nothing to count, once you are down.
        const alive = !property || property.isAlive !== false;
        if (!alive) {
            mark.root.style.display = 'none';
            return;
        }
        mark.root.style.display = 'block';

        mark.root.style.left = `${position.x}px`;
        mark.root.style.top = `${position.y}px`;

        this.paintQuiver(entity, mark);
        this.paintSight(entity, mark);
    }

    ensure(entity) {
        let mark = this.marks.get(entity.uuid);
        if (mark) return mark;

        if (!this.layer) {
            this.layer = document.querySelector('.game-world');
            if (!this.layer) return null;
        }

        const root = document.createElement('div');
        root.className = 'fighter-marks';

        const pips = document.createElement('div');
        pips.className = 'quiver-pips';
        root.appendChild(pips);

        const sight = document.createElement('div');
        sight.className = 'aim-sight';
        sight.style.backgroundImage = this.sightIcon;
        root.appendChild(sight);

        this.layer.appendChild(root);

        mark = { root, pips, sight, shown: -1, empty: null };
        this.marks.set(entity.uuid, mark);
        return mark;
    }

    /**
     * One little arrow per arrow you are carrying.
     *
     * Rebuilt only when the number changes: this runs every frame for the
     * length of a match, and rewriting seven nodes each time to say the same
     * thing is work for nothing.
     */
    paintQuiver(entity, mark) {
        const bow = entity.getComponent('bow_state');
        const count = bow ? Math.max(0, bow.currentArrows) : 0;
        if (count === mark.shown) return;

        mark.shown = count;
        mark.pips.innerHTML = '';

        for (let i = 0; i < count; i++) {
            const pip = document.createElement('div');
            pip.className = 'quiver-pip';
            pip.style.backgroundImage = this.pipIcon;
            mark.pips.appendChild(pip);
        }
    }

    /**
     * Puts the sight where the next shot would go.
     *
     * It turns red on an empty quiver rather than disappearing: knowing you
     * are aiming at nothing is worth more than a tidy screen, and a sight that
     * vanishes reads as a bug rather than as being out of arrows.
     */
    paintSight(entity, mark) {
        const input = entity.getComponent('input');
        if (!input || !input.aim) return;

        let { x, y } = input.aim;
        const length = Math.hypot(x, y);
        if (length > 0) { x /= length; y /= length; }
        else { x = input.facing || 1; y = 0; }

        mark.sight.style.left = `${BODY_X + x * SIGHT_RADIUS - SIGHT_SIZE / 2}px`;
        mark.sight.style.top = `${BODY_Y + y * SIGHT_RADIUS - SIGHT_SIZE / 2}px`;

        const bow = entity.getComponent('bow_state');
        const empty = !bow || bow.currentArrows <= 0;
        if (empty !== mark.empty) {
            mark.empty = empty;
            mark.sight.style.backgroundImage = empty ? this.sightEmptyIcon : this.sightIcon;
        }

        // Drawing the bow tightens the sight, so the moment the shot is armed
        // is something you see rather than something you count.
        const drawing = !!bow && bow.state === 'charging';
        mark.sight.classList.toggle('drawing', drawing);
    }

    injectStyles() {
        if (document.getElementById('vs-fighter-marks-styles')) return;

        const style = document.createElement('style');
        style.id = 'vs-fighter-marks-styles';
        style.textContent = `
        .fighter-marks {
            position: absolute;
            width: ${FRAME}px;
            height: ${FRAME}px;
            pointer-events: none;
            z-index: 600;
        }
        .quiver-pips {
            position: absolute;
            top: 14px;
            left: 0;
            width: 100%;
            display: flex;
            justify-content: center;
            gap: ${PIP_GAP}px;
        }
        .quiver-pip {
            width: ${PIP_WIDTH}px;
            height: ${PIP_HEIGHT}px;
            background-size: 100% 100%;
            background-repeat: no-repeat;
            filter: drop-shadow(0 1px 0 rgba(0, 0, 0, 0.65));
        }
        .aim-sight {
            position: absolute;
            width: ${SIGHT_SIZE}px;
            height: ${SIGHT_SIZE}px;
            background-size: 100% 100%;
            background-repeat: no-repeat;
            opacity: 0.85;
            transition: opacity 0.12s linear, transform 0.12s ease-out;
            /* Outlined on all four sides rather than given a drop shadow: the
               sight passes over pale stone and dark sky alike, and a shadow
               underneath only holds it up against one of them. */
            filter: drop-shadow(1px 0 0 rgba(0, 0, 0, 0.9))
                    drop-shadow(-1px 0 0 rgba(0, 0, 0, 0.9))
                    drop-shadow(0 1px 0 rgba(0, 0, 0, 0.9))
                    drop-shadow(0 -1px 0 rgba(0, 0, 0, 0.9));
        }
        .aim-sight.drawing {
            opacity: 1;
            transform: scale(1.25);
        }`;
        document.head.appendChild(style);
    }
}
