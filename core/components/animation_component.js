// core/components/animation_component.js
import { Component } from './component.js';
import { PARALYSIS_FRAMES, PARALYSIS_FPS } from '../../constants/vs_paralysis_constants.js';

export class Animation extends Component {
    constructor() {
        super();
        this.spriteSheet = null;
        this.frameWidth = null;
        this.frameHeight = null;
        this.columns = null;
        this.rows = null;
        this.currentFrame = 0;
        this.currentSequence = [];
        this.frameTimer = 0;
        this.isFlipped = false;
        this.sequences = {};
        this.currentState = 'idle';
        this.hurtTimer = 0;
        this.hurtDuration = 400;  // ms
        this.waitingForHurt = false;
    }

    init(path, width, height, columns, rows) {
        this.spriteSheet = new Image();
        this.spriteSheet.src = path;
        this.frameWidth = width;
        this.frameHeight = height;
        this.columns = columns;
        this.rows = rows;
        this.currentSequence = this.sequences[this.currentState].frames;
    }

    setState(state) {
        // Ne pas changer d'état si on est déjà mort
        if (this.currentState === 'death') return;

        if (this.currentState !== state && this.sequences[state]) {
            this.currentState = state;
            this.currentSequence = this.sequences[state].frames;
            this.currentFrame = 0;
            this.frameTimer = 0;
        }
    }

    /**
     * Leaves the death state.
     *
     * setState() refuses to: in Adventure mode a death is terminal, and
     * several systems rely on that. VS mode fights in rounds, so a fighter
     * respawns for the next one and has to clear the latch explicitly -
     * otherwise it stays pinned on its last death frame for the rest of the
     * match, sliding around the arena as a corpse.
     */
    revive(state = 'idle') {
        if (!this.sequences[state]) return;
        this.currentState = state;
        this.currentSequence = this.sequences[state].frames;
        this.currentFrame = 0;
        this.frameTimer = 0;
    }

    updateAnimation(deltaTime) {
        this.frameTimer += deltaTime;
        if (this.frameTimer >= 1 / this.sequences[this.currentState].speed) {
            this.frameTimer = 0;

            // Ne pas boucler l'animation de mort
            if (this.currentState === 'death' &&
                this.currentFrame >= this.currentSequence.length - 1) {
                return;
            }

            this.currentFrame = (this.currentFrame + 1) % this.currentSequence.length;
        }
    }

    getFramePosition(frameNumber) {
        return {
            x: frameNumber % this.columns,
            y: Math.floor(frameNumber / this.columns),
        };
    }
}

export class CoinAnimation extends Animation {
    constructor() {
        super();
        this.sequences = {
            idle: {
                frames: [0, 1, 2, 3],
                speed: 5,
            },
        };
        this.init('./assets/sprites/coin-sprite.png', 32, 32, 4, 1);
    }
};

export class EffectAnimation extends Animation {
    constructor() {
        super();
        this.sequences = {
            portal: {
                frames: [
                    ...Array.from({ length: 15 }, (_, i) => i + (10 * 11)), // Ligne 10
                ],
                speed: 15,
            },
        };
        this.init('./assets/sprites/Free-Smoke.png', 32, 32, 11, 15);
    }
}

export class PlayerAnimation extends Animation {
    /**
     * @param {string} [sheetPath] - Spritesheet to use instead of the default.
     *        VS mode passes one of the recoloured sheets so each fighter wears
     *        their own colours (see constants/vs_palette.js). Adventure passes
     *        nothing and keeps the original artwork.
     */
    constructor(sheetPath) {
        super();
        this.sequences = {
            idle: {
                frames: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
                speed: 15,
            },

            run: {
                frames: [13, 14, 15, 16, 17, 18, 19, 20],
                speed: 15,
            },
            attack1: {
                frames: [26, 27, 28, 29, 30, 31, 32, 33, 34, 35],
                speed: 15,
            },
            attack2: {
                frames: [39, 40, 41, 42, 43, 44, 45, 46, 47, 48],
                speed: 15,
            },
            attack3: {
                frames: [52, 53, 54, 55, 56, 57, 58, 59, 60, 61],
                speed: 15,
            },
            roulade: {
                frames: [156, 157, 158, 159, 160],
                speed: 15,
            },
            chockGround: {
                frames: [78, 79, 80, 81],
                speed: 15,
            },
            // Held by a spirit: the first three frames of the reeling row,
            // looped for as long as the hold lasts. Shares its opening with
            // chockGround because it is the same body losing control - what
            // differs is that this one never reaches the recovery.
            // See constants/vs_paralysis_constants.js.
            paralysed: {
                frames: PARALYSIS_FRAMES,
                speed: PARALYSIS_FPS,
            },
            chockDeath: {
                frames: [91, 92, 93, 94, 95, 96, 97],
                speed: 15,
            },
            climb: {
                frames: [104, 105, 106, 107],
                speed: 15,
            },
            arrowShoot: {
                frames: [117, 118, 119, 120, 121, 122, 123],
                speed: 15,
            },
            magicAttack: {
                frames: [130, 131, 132, 133, 134, 135],
                speed: 15,
            },
            goToBack: {
                frames: [143, 144, 145, 146, 147, 148, 149, 150],
                speed: 15,
            },
            jump: {
                frames: [65, 66, 67, 68, 68, 69, 70],
                speed: 10,
            },
            push: {
                frames: [169, 170, 171, 172, 173, 174, 175, 176],
                speed: 15,
            },
            death: {
                frames: [91, 92, 93, 94, 95, 96, 97, 182, 183, 184, 185, 186, 187, 188, 189, 190],
                speed: 15,
            },
            // ... autres séquences du player
        };
        // Detect if we're in views/ subdirectory
        const basePath = window.location.pathname.includes('/views/') ? '../' : './';
        const sheet = sheetPath || `${basePath}assets/sprites/Adventurer_Sprite_Sheet_v1.5.png`;
        // Every recoloured sheet is a palette swap of the original, so the
        // frame grid is identical and the sequences above stay valid.
        this.init(sheet, 72, 72, 13, 15);
    }
}

export class SatiroAnimation extends Animation {
    constructor() {
        super();
        this.sequences = {
            idle: {
                frames: [0, 1, 2, 3, 4, 5], // Première ligne pour l'animation 1
                speed: 15,
            },
            idle2: {
                frames: [10, 11, 11, 13, 14, 15, 16, 17], // Deuxième ligne pour la course
                speed: 15,
            },
            hurt1: {
                frames: [20, 21, 22, 23],
                speed: 15,
            },
            fly1: {
                frames: [30, 31, 32, 33, 34, 35],
                speed: 15,
            },
            fly2: {
                frames: [40, 41, 42, 43, 44, 45],
                speed: 15,
            },
            death: {
                frames: [50, 51, 52, 53, 54, 55, 56, 57, 58, 59],
                speed: 15,
            },
            magic: {
                frames: [60, 61, 66, 63],
                speed: 15,
            },
            hurt: {
                frames: [70, 71, 77, 73, 77, 75],
                speed: 15,
            },
            // ... autres séquences du satiro
        };
        this.init('./assets/sprites/satiro.png', 32, 32, 10, 8);
    }
}
