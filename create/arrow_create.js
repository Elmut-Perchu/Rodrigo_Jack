// create/arrow_create.js
import { Entity } from '../core/entities/entity.js';
import { Position } from '../core/components/position_component.js';
import { Velocity } from '../core/components/velocity_component.js';
import { Visual } from '../core/components/visual_component.js';
import { Property } from '../core/components/property_component.js';
import { Arrow } from '../core/components/arrow_component.js';
import { Animation } from '../core/components/animation_component.js';
import { ARROW_CONSTANTS } from '../constants/arrow_constants.js';

/**
 * Crée une entité flèche
 * @param {number} x - Position x de spawn
 * @param {number} y - Position y de spawn
 * @param {Object} direction - Direction normalisée {x, y} (-1 ou 1 pour x, 0 pour y en MVP)
 * @param {string} ownerUUID - UUID du player qui tire
 * @param {number} [speed] - Vitesse de lancement (défaut: ARROW_SPEED).
 *        VS mode varie la vitesse selon le temps de bande; Adventure garde
 *        la valeur par défaut et n'est pas affecté.
 * @param {number} [maxRange] - Distance parcourue avant que la flèche ne
 *        retombe. Infinity = portée illimitée (comportement Adventure).
 */
export function createArrow(x, y, direction, ownerUUID, speed, maxRange) {
    const arrow = new Entity();

    // Position
    arrow.addComponent('position', new Position(x, y));

    // Velocity (direction × vitesse)
    const launchSpeed = speed || ARROW_CONSTANTS.ARROW_SPEED;
    const velocity = new Velocity();
    velocity.vx = direction.x * launchSpeed;
    velocity.vy = direction.y * launchSpeed;
    arrow.addComponent('velocity', velocity);

    // Visual
    const visual = new Visual(
        null, // pas de bgColor
        ARROW_CONSTANTS.ARROW_DISPLAY_HEIGHT,
        ARROW_CONSTANTS.ARROW_DISPLAY_WIDTH
    );
    arrow.addComponent('visual', visual);

    // Property (pas solide, pas movable, pas player, pas ennemi)
    const property = new Property(
        false, // solid
        0,     // speed
        false, // movable
        0,     // jumpPower
        false  // isPlayer
    );
    property.isArrow = true; // Flag custom pour identifier les flèches
    arrow.addComponent('property', property);

    // Arrow component (état spécifique)
    const arrowComp = new Arrow();
    arrowComp.ownerUUID = ownerUUID;
    arrowComp.direction = { ...direction };
    arrowComp.speed = launchSpeed;
    // A missing range arrives as 0 or undefined; both mean "unlimited", the
    // Adventure behaviour. Taking 0 literally made such an arrow drop the
    // instant it was fired.
    if (maxRange) arrowComp.maxRange = maxRange;
    arrow.addComponent('arrow', arrowComp);

    // Animation component pour gérer sprite flying + impact
    const animation = new ArrowAnimation();
    arrow.addComponent('animation', animation);

    return arrow;
}

/**
 * Animation component personnalisée pour les flèches
 */
class ArrowAnimation extends Animation {
    constructor() {
        super();
        this.sequences = {
            // Flying: frame 0 de la ligne 0 (statique)
            flying: {
                frames: [0],
                speed: 1,
            },
            // Impact tile: frames 0→1 de Arrow_impact_pack.png puis freeze sur 1
            impact_tile: {
                frames: [0, 1],
                speed: ARROW_CONSTANTS.FPS_IMPACT,
            },
            // Impact enemy: frames 0-4
            impact_enemy: {
                frames: [0, 1, 2, 3, 4],
                speed: ARROW_CONSTANTS.FPS_IMPACT,
            },
        };

        // Set default state BEFORE init
        this.currentState = 'flying';

        // Init avec spritesheet flying (changera dynamiquement)
        this.init(
            ARROW_CONSTANTS.ARROW_SPRITE_SHEET,
            ARROW_CONSTANTS.ARROW_FRAME_WIDTH,
            ARROW_CONSTANTS.ARROW_FRAME_HEIGHT,
            ARROW_CONSTANTS.ARROW_COLUMNS,
            ARROW_CONSTANTS.ARROW_ROWS
        );
    }

    /**
     * Switch vers impact spritesheet
     */
    switchToImpactSprite() {
        console.log('🎯 [ArrowAnimation] switchToImpactSprite called');
        console.log('  - OLD spriteSheet.src:', this.spriteSheet.src);
        console.log('  - OLD initialized:', this.initialized);

        // Créer nouvelle image pour l'impact
        this.spriteSheet = new Image();
        this.spriteSheet.src = ARROW_CONSTANTS.IMPACT_SPRITE_SHEET;
        this.frameWidth = ARROW_CONSTANTS.IMPACT_FRAME_WIDTH;
        this.frameHeight = ARROW_CONSTANTS.IMPACT_FRAME_HEIGHT;
        this.columns = ARROW_CONSTANTS.IMPACT_COLUMNS;
        this.rows = ARROW_CONSTANTS.IMPACT_ROWS;

        // Forcer réinitialisation pour que AnimationSystem recharge le sprite
        this.initialized = false;
        this.currentFrame = 0;

        console.log('  - NEW spriteSheet.src:', this.spriteSheet.src);
        console.log('  - NEW initialized:', this.initialized);
        console.log('  - NEW dimensions:', this.frameWidth, 'x', this.frameHeight);
    }
}
