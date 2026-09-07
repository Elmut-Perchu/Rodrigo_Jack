// create/spectre_create.js - The wraith a full gauge buys
import { Entity } from '../core/entities/entity.js';
import { Position } from '../core/components/position_component.js';
import { Velocity } from '../core/components/velocity_component.js';
import { Visual } from '../core/components/visual_component.js';
import { Property } from '../core/components/property_component.js';
import { Animation } from '../core/components/animation_component.js';
import { Component } from '../core/components/component.js';
import { VS_SPECTRE } from '../constants/vs_spectre_constants.js';

const BASE_PATH = (typeof window !== 'undefined' && window.location.pathname.includes('/views/'))
    ? '../'
    : './';

/** State of one spirit in flight. */
export class Spectre extends Component {
    constructor(spectreId, ownerId, targetId) {
        super();
        this.spectreId = spectreId;
        this.ownerId = ownerId;
        this.targetId = targetId;
        this.bornAt = performance.now();
        this.spent = false; // Struck home, or ran out of time
    }
}

/**
 * Builds a spectre.
 *
 * Every client creates one from the same spawn message and homes it on the
 * same quarry, so it moves in step everywhere without its position being
 * streamed - the same arrangement arrows use. Only the caster's client rules
 * on whether it connected.
 */
export function createSpectre({ spectreId, ownerId, targetId, x, y, dirX = 1, glow }) {
    const entity = new Entity();

    entity.addComponent('position', new Position(x, y));

    const velocity = new Velocity();
    velocity.vx = dirX * VS_SPECTRE.SPEED;
    velocity.vy = 0;
    entity.addComponent('velocity', velocity);

    entity.addComponent('visual', new Visual(null, VS_SPECTRE.DISPLAY_SIZE, VS_SPECTRE.DISPLAY_SIZE));

    // Gravity and tile collision are deliberately absent: a spirit drifts
    // through the arena rather than walking it, which is also what stops a
    // spectre being trapped in a corner by the level geometry.
    const property = new Property(false, 0, false, 0, false);
    property.isSpectre = true;
    property.applyGravity = false;
    entity.addComponent('property', property);

    entity.addComponent('spectre', new Spectre(spectreId, ownerId, targetId));
    entity.addComponent('animation', new SpectreAnimation());

    // Tinted with its caster's colour, so in a four-way brawl you can see
    // whose spirit is coming for you.
    if (glow) {
        entity.getComponent('visual').div.style.filter =
            `drop-shadow(0 0 10px ${glow}) drop-shadow(0 0 20px ${glow})`;
    }

    return entity;
}

/** The hovering wraith from the satiro sheet. */
class SpectreAnimation extends Animation {
    constructor() {
        super();
        this.sequences = {
            fly: {
                frames: [30, 31, 32, 33, 34, 35],
                speed: 12
            }
        };
        this.currentState = 'fly';
        this.init(`${BASE_PATH}assets/sprites/satiro.png`, 32, 32, 10, 8);
    }
}
