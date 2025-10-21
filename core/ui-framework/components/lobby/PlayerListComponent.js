/**
 * PlayerListComponent.js - Reactive player list for VS lobby
 *
 * Displays 2-4 player slots with:
 * - Player names and ready status
 * - Host indicator
 * - Empty slots for waiting players
 * - Auto-updates via framework state
 */

import { h } from '../../ui-framework.js';

/**
 * Player slot component
 * @param {Object|null} player - Player data or null for empty slot
 * @param {number} slotIndex - Slot index (0-3)
 * @param {boolean} isHost - Is this player the host?
 * @param {string} currentPlayerId - Current user's player ID
 */
function PlayerSlot(player, slotIndex, isHost, currentPlayerId) {
  if (!player) {
    // Empty slot
    return h('div', { className: 'player-slot' },
      h('div', { className: 'player-status' }, 'Waiting for player...')
    );
  }

  // Occupied slot
  const classes = ['player-slot', 'occupied'];
  if (isHost) classes.push('host');

  const isCurrentPlayer = player.id === currentPlayerId;
  const playerName = isCurrentPlayer
    ? `🏆 ${player.name} (You)`
    : player.name;

  const statusText = isHost
    ? `Host - ${player.ready ? 'Ready' : 'Not Ready'}`
    : player.ready ? 'Ready' : 'Not Ready';

  return h('div', { className: classes.join(' ') },
    h('div', { className: 'player-name' }, playerName),
    h('div', { className: 'player-status' }, statusText)
  );
}

/**
 * Player list component
 * @param {Object} state - Framework state
 * @param {Array} state.players - Array of player objects
 * @param {string} state.hostId - Host player ID
 * @param {string} state.currentPlayerId - Current user's player ID
 * @returns {VNode} Virtual DOM node
 */
export function PlayerListComponent(state) {
  const { players = [], hostId = null, currentPlayerId = null } = state;

  // Ensure we have exactly 4 slots (max players for VS mode)
  const playerSlots = Array(4).fill(null);
  players.forEach((player, index) => {
    if (index < 4) {
      playerSlots[index] = player;
    }
  });

  return h('div', { className: 'players-section' },
    h('h2', {}, `Players (${players.length}/4)`),
    h('div', { className: 'players-grid' },
      ...playerSlots.map((player, index) =>
        PlayerSlot(player, index, player && player.id === hostId, currentPlayerId)
      )
    )
  );
}
