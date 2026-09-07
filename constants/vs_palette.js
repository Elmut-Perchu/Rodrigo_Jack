// constants/vs_palette.js - Fighter identity colours for the arena

/**
 * One colour scheme per slot, so four fighters wearing the same sprite are
 * told apart at a glance.
 *
 * The recolouring is baked into four spritesheets rather than applied at
 * runtime. The sheet uses a 25-colour palette, which means the two garment
 * families - the tunic (hue ~216) and the sash (hue ~343) - can be remapped
 * exactly, leaving skin, hair, leather and the steel of the blade untouched.
 * A CSS hue-rotate would have swung all of those together and turned the
 * fighter's face green along with his shirt.
 *
 * Each scheme pairs a tunic with a sash chosen to sit well beside it, and the
 * four tunics are spread far enough around the wheel that no two fighters
 * read alike in the middle of a brawl.
 *
 * The generator lives in tools/recolor_players.py; re-run it if the sheet or
 * these hues change.
 */

const BASE_PATH = (typeof window !== 'undefined' && window.location.pathname.includes('/views/'))
    ? '../'
    : './';

export const PLAYER_PALETTES = [
    {
        id: 'p1',
        name: 'Crimson',
        sheet: `${BASE_PATH}assets/sprites/players/adventurer_p1.png`,
        primary: '#c52d41',   // Tunic
        accent: '#e4b235',    // Sash
        glow: 'rgba(197, 45, 65, 0.55)'
    },
    {
        id: 'p2',
        name: 'Teal',
        sheet: `${BASE_PATH}assets/sprites/players/adventurer_p2.png`,
        primary: '#2db6c5',
        accent: '#c94d27',
        glow: 'rgba(45, 182, 197, 0.55)'
    },
    {
        id: 'p3',
        name: 'Violet',
        sheet: `${BASE_PATH}assets/sprites/players/adventurer_p3.png`,
        primary: '#7928c1',
        accent: '#29bd78',
        glow: 'rgba(121, 40, 193, 0.55)'
    },
    {
        id: 'p4',
        name: 'Moss',
        sheet: `${BASE_PATH}assets/sprites/players/adventurer_p4.png`,
        primary: '#449e24',
        accent: '#b12a80',
        glow: 'rgba(68, 158, 36, 0.55)'
    }
];

/** The scheme for a slot, wrapping round if there are somehow more than four. */
export function paletteFor(playerIndex = 0) {
    const count = PLAYER_PALETTES.length;
    const index = ((Math.round(playerIndex) % count) + count) % count;
    return PLAYER_PALETTES[index];
}
