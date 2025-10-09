/**
 * NetworkPlayer Component
 * Identifies and tracks networked players in VS mode
 *
 * Used by:
 * - game_vs.js: To mark local vs remote players
 * - NetworkSyncSystem: To sync player states
 * - NicknameRenderSystem: To display player names
 */

/**
 * Create a network player component
 * @param {string} playerId - Unique player ID from server
 * @param {string} playerName - Display name
 * @param {boolean} isLocal - True if this is the local controllable player
 * @param {number} playerIndex - Player index (0-3) for spawn/color
 * @returns {Object} Network player component data
 */
export function createNetworkPlayerComponent(playerId, playerName, isLocal, playerIndex) {
    return {
        // Unique identifier from server
        playerId: playerId,

        // Display name
        playerName: playerName,

        // Is this the local player (controllable)?
        isLocal: isLocal,

        // Player index for spawn points and colors (0-3)
        playerIndex: playerIndex,

        // Network state tracking
        lastSyncTime: Date.now(),
        latency: 0,

        // Combat state (will be updated by CombatSyncSystem)
        kills: 0,
        deaths: 0,
        isAlive: true
    };
}
