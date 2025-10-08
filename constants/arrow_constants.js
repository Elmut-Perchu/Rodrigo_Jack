// constants/arrow_constants.js
export const ARROW_CONSTANTS = {
    // Gameplay
    STARTING_ARROWS: 3,
    MAX_ARROWS: 7,
    CHARGE_TIME: 1000, // ms (1 seconde minimum)

    // Physics
    ARROW_SPEED: 400, // pixels/sec (facilement modifiable)

    // Hitbox (très fin pour précision)
    ARROW_HITBOX_WIDTH: 40,  // Longueur flèche
    ARROW_HITBOX_HEIGHT: 6,  // Très fin (pointe)

    // Animation Impact
    IMPACT_DURATION: 1000, // ms (facilement modifiable)
    IMPACT_TILE_FRAMES: 2, // Frames 0→1 de Arrow_impact_pack.png puis freeze sur 1
    IMPACT_ENEMY_FRAMES: 5, // Frames 0-4
    FPS_IMPACT: 5, // frames/sec pour animation impact

    // Sprites - ARROWS (Arrows_pack.png: 3072×4096)
    ARROW_SPRITE_SHEET: './assets/sprites/Arrows_pack.png',
    ARROW_FRAME_WIDTH: 1024, // 3072 / 3 colonnes
    ARROW_FRAME_HEIGHT: 1024, // 4096 / 4 lignes
    ARROW_COLUMNS: 3,
    ARROW_ROWS: 4,
    ARROW_ROW_BROWN: 0, // Première ligne (brown arrows)
    ARROW_FRAME_FLYING: 0, // Colonne 0 = frame vol

    // Sprites - IMPACT (Arrow_impact_pack.png: 5120×5120)
    IMPACT_SPRITE_SHEET: './assets/sprites/Arrow_impact_pack.png',
    IMPACT_FRAME_WIDTH: 1024, // 5120 / 5 colonnes
    IMPACT_FRAME_HEIGHT: 1280, // 5120 / 4 lignes
    IMPACT_COLUMNS: 5,
    IMPACT_ROWS: 4,
    IMPACT_ROW_BROWN: 0, // Première ligne

    // Display size (taille intermédiaire)
    ARROW_DISPLAY_WIDTH: 100,  // Taille intermédiaire visible
    ARROW_DISPLAY_HEIGHT: 120,

    // Player modifiers pendant charge
    CHARGE_SPEED_MULTIPLIER: 0.5, // 50% vitesse pendant charge

    // Pickup
    PICKUP_RADIUS: 30, // Distance auto-pickup (pixels)

    // Spawn offset (distance devant player)
    SPAWN_OFFSET_X: 60, // pixels devant le player
    SPAWN_OFFSET_Y: 30, // ajustement vertical (centre de la flèche)
};
