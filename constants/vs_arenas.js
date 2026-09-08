// constants/vs_arenas.js - Which battlefield, and how it is agreed on
//
// Every arena is the same 24x14 grid: the server validates positions against
// one set of bounds (server/constants.go) and the wrap passages are measured
// from the same figures, so the size is fixed and only the shape inside it
// varies. See tools/generate_arenas.py, which builds all but the first.

export const ARENAS = [
    { id: 'pvp_arena_compact', name: 'Compact' },
    { id: 'pvp_arena_towers', name: 'Towers' },
    { id: 'pvp_arena_steps', name: 'Steps' },
    { id: 'pvp_arena_bridges', name: 'Bridges' },
    { id: 'pvp_arena_pit', name: 'Pit' }
];

export const DEFAULT_ARENA = ARENAS[0].id;

export function isArena(id) {
    return ARENAS.some(arena => arena.id === id);
}

/**
 * The arena for this match.
 *
 * Online, every client has to land on the same one, and the server says
 * nothing about maps. Deriving it from the room code solves that without a
 * protocol change: everyone in room BEAK computes BEAK's arena and they all
 * get the same answer, while a different room gets a different fight.
 *
 * A match against the computer has no room and nobody to agree with, so it
 * simply draws one at random - which is what makes having several of them
 * worth anything.
 *
 * @param {string} requested  an explicit choice (?map=), which always wins
 * @param {string} roomCode   the room, when there is one
 */
export function pickArena(requested, roomCode) {
    if (requested && isArena(requested)) return requested;

    if (roomCode) {
        let hash = 0;
        for (let i = 0; i < roomCode.length; i++) {
            hash = (hash * 31 + roomCode.charCodeAt(i)) >>> 0;
        }
        return ARENAS[hash % ARENAS.length].id;
    }

    return ARENAS[Math.floor(Math.random() * ARENAS.length)].id;
}
