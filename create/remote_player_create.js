/**
 * Remote Player Entity Factory
 * Creates remote player entities with network components
 *
 * Phase 4 Days 23-24
 */

import { Entity } from '../core/entities/entity.js';
import { CircleHitbox } from '../core/components/circle_hitbox_component.js';
import { Visual } from '../core/components/visual_component.js';
import { PlayerAnimation } from '../core/components/animation_component.js';
import { Input } from '../core/components/input_component.js'; // NEW IMPORT for keyboard controls

/**
 * Player color palette (P1=red, P2=blue, P3=green, P4=yellow)
 */
const PLAYER_COLORS = [
    { primary: '#FF4444', secondary: '#CC0000', name: 'Red' },    // P1
    { primary: '#4444FF', secondary: '#0000CC', name: 'Blue' },   // P2
    { primary: '#44FF44', secondary: '#00CC00', name: 'Green' },  // P3
    { primary: '#FFFF44', secondary: '#CCCC00', name: 'Yellow' }  // P4
];

/**
 * Map network animation names to PlayerAnimation state names
 */
const ANIMATION_MAP = {
    'idle': 'idle',
    'walk': 'run',      // Network uses 'walk', PlayerAnimation uses 'run'
    'jump': 'jump',
    'attack': 'attack1',
    'shoot': 'arrowShoot',
    'cast': 'magicAttack',
    'death': 'death'
};

/**
 * Create remote player entity
 * @param {Object} playerData - Player data from server
 * @param {number} playerIndex - Player index (0-3) for color assignment
 * @returns {Entity}
 */
export function createRemotePlayer(playerData, playerIndex = 0) {
    const entity = new Entity();

    // Network component
    entity.addComponent('networkPlayer', {
        playerId: playerData.playerId,
        playerName: playerData.playerName || 'Player',
        playerIndex: playerIndex,
        isLocal: false,
        lastUpdateTime: Date.now()
    });

    // Position component
    entity.addComponent('position', {
        x: playerData.x || 0,
        y: playerData.y || 0
    });

    // Velocity component
    entity.addComponent('velocity', {
        vx: playerData.vx || 0,
        vy: playerData.vy || 0
    });

    // Visual component (required for rendering)
    const color = PLAYER_COLORS[playerIndex % PLAYER_COLORS.length];
    entity.addComponent('visual', new Visual(null, 110, 110));

    // Animation component - FIXED: Use PlayerAnimation class
    const animationComponent = new PlayerAnimation();
    entity.addComponent('animation', animationComponent);

    // Set initial animation state
    const networkAnim = playerData.animation || 'idle';
    const mappedAnim = ANIMATION_MAP[networkAnim] || 'idle';
    animationComponent.setState(mappedAnim);
    animationComponent.isFlipped = playerData.facingRight === false;

    // Health component
    entity.addComponent('health', {
        maxHealth: 100,
        currentHealth: playerData.health || 100
    });

    // Property component (for collision, etc.)
    entity.addComponent('property', {
        type: 'remote_player',
        team: playerIndex,
        isAlive: playerData.isAlive !== undefined ? playerData.isAlive : true,
        movable: true,
        speed: 450,
        solid: false,
        jumpStrength: 425,
        applyGravity: true,
        isOnGround: false,
        isCollided: false,
        collidingWith: new Set()
    });

    // Circle hitbox component
    entity.addComponent('circle_hitbox', new CircleHitbox(
        0,   // offsetX
        24,  // offsetY
        26,  // collisionRadius
        60,  // meleeRadius
        300  // rangedRadius
    ));

    // Nickname component (for UI rendering)
    entity.addComponent('nickname', {
        text: playerData.playerName || 'Player',
        color: color.primary,
        offsetY: -20, // Above sprite
        fontSize: 10,
        visible: true
    });

    // Interpolation component for smooth movement
    entity.addComponent('interpolation', {
        previousX: playerData.x || 0,
        previousY: playerData.y || 0,
        targetX: playerData.x || 0,
        targetY: playerData.y || 0,
        alpha: 0, // Interpolation progress (0-1)
        enabled: true
    });

    // Prediction component for lag compensation
    entity.addComponent('prediction', {
        predictedX: playerData.x || 0,
        predictedY: playerData.y || 0,
        errorX: 0,
        errorY: 0,
        correctionSpeed: 0.1 // Smooth error correction
    });

    console.log(`[RemotePlayer] Created ${playerData.playerName} (${color.name}, index: ${playerIndex})`);

    return entity;
}

/**
 * Update remote player state from network data
 * @param {Entity} entity - Remote player entity
 * @param {Object} stateData - State data from server
 */
export function updateRemotePlayerState(entity, stateData) {
    const networkPlayer = entity.getComponent('networkPlayer');
    if (!networkPlayer || networkPlayer.isLocal) return;

    // Update position target for interpolation
    const interpolation = entity.getComponent('interpolation');
    if (interpolation) {
        interpolation.previousX = interpolation.targetX;
        interpolation.previousY = interpolation.targetY;
        interpolation.targetX = stateData.x;
        interpolation.targetY = stateData.y;
        interpolation.alpha = 0; // Reset interpolation
    }

    // Update velocity
    const velocity = entity.getComponent('velocity');
    if (velocity) {
        velocity.vx = stateData.vx || 0;
        velocity.vy = stateData.vy || 0;
    }

    // Update animation - FIXED: Map network animation to PlayerAnimation state
    const animation = entity.getComponent('animation');
    if (animation && stateData.animation) {
        const mappedAnim = ANIMATION_MAP[stateData.animation] || stateData.animation;
        if (animation.currentState !== mappedAnim) {
            animation.setState(mappedAnim);
        }
    }

    // Update facing direction
    if (animation && stateData.facingRight !== undefined) {
        animation.isFlipped = !stateData.facingRight;
    }

    // Update health
    const health = entity.getComponent('health');
    if (health && stateData.health !== undefined) {
        health.currentHealth = stateData.health;
    }

    // Update alive status
    const property = entity.getComponent('property');
    if (property && stateData.isAlive !== undefined) {
        property.isAlive = stateData.isAlive;
    }

    // Update last update time
    networkPlayer.lastUpdateTime = Date.now();
}

/**
 * Get player color by index
 * @param {number} index - Player index (0-3)
 * @returns {Object} - Color object
 */
export function getPlayerColor(index) {
    return PLAYER_COLORS[index % PLAYER_COLORS.length];
}

/**
 * Create local player entity (similar to remote but with input)
 * @param {Object} playerData - Player data
 * @param {number} playerIndex - Player index
 * @returns {Entity}
 */
export function createLocalPlayer(playerData, playerIndex = 0) {
    const entity = createRemotePlayer(playerData, playerIndex);

    // Mark as local
    const networkPlayer = entity.getComponent('networkPlayer');
    if (networkPlayer) {
        networkPlayer.isLocal = true;
    }

    // Add input component for local control - MUST use Input class for keyboard event listeners
    entity.addComponent('input', new Input());

    // Disable interpolation for local player (uses client-side prediction)
    const interpolation = entity.getComponent('interpolation');
    if (interpolation) {
        interpolation.enabled = false;
    }

    // CRITICAL: DO NOT add camera component in VS mode
    // Camera following is disabled in VS - we want static arena view
    // The camera component will be removed by game_vs.js:disableAdventureFeatures()

    console.log(`[LocalPlayer] Created local player ${playerData.playerName} (${getPlayerColor(playerIndex).name})`);

    return entity;
}
