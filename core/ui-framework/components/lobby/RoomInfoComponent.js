/**
 * RoomInfoComponent.js - Room controls and info for VS lobby
 *
 * Features:
 * - Room code display
 * - Lobby status info
 * - Control buttons (Back, Ready, Start)
 * - Conditional button states based on lobby state
 */

import { h } from '../../ui-framework.js';

/**
 * Room code display component
 * @param {string} roomCode - 4-letter room code
 */
function RoomCodeDisplay(roomCode) {
  return h('div', { className: 'room-code' },
    'Room Code: ',
    h('span', { id: 'room-code' }, roomCode || 'XXXX')
  );
}

/**
 * Lobby info component
 * @param {Object} state - Lobby state
 */
function LobbyInfo(state) {
  const { players = [], minPlayers = 2, isHost = false } = state;
  const playerCount = players.length;
  const allReady = players.every(p => p.ready);

  let infoText;
  if (playerCount < minPlayers) {
    infoText = `Waiting for players... (${minPlayers} minimum required)`;
  } else if (!allReady) {
    infoText = 'Waiting for all players to be ready...';
  } else if (isHost) {
    infoText = 'All players ready! You can start the game.';
  } else {
    infoText = 'All players ready! Waiting for host to start...';
  }

  return h('div', { className: 'lobby-info' }, infoText);
}

/**
 * Control buttons component
 * @param {Object} state - Lobby state
 * @param {Object} actions - Actions object
 */
function ControlButtons(state, actions) {
  const {
    players = [],
    minPlayers = 2,
    isHost = false,
    isReady = false
  } = state;

  const playerCount = players.length;
  const allReady = players.every(p => p.ready);
  const canStart = isHost && playerCount >= minPlayers && allReady;

  return h('div', { className: 'lobby-buttons' },
    h('button', {
      className: 'btn btn-back',
      id: 'btn-back',
      onclick: actions.goBack
    }, 'Back to Menu'),
    h('button', {
      className: `btn btn-ready ${isReady ? 'btn-ready-active' : ''}`,
      id: 'btn-ready',
      onclick: actions.toggleReady
    }, isReady ? 'Not Ready' : 'Ready'),
    h('button', {
      className: 'btn btn-start',
      id: 'btn-start',
      disabled: !canStart,
      onclick: actions.startGame
    }, 'Start Game')
  );
}

/**
 * Big pixel-style "3, 2, 1..." once the countdown starts - mirrors the
 * arena's own countdown overlay (views/vs_game.html #countdown-overlay) so
 * the beat feels consistent from lobby to arena. websocket-state-bridge.js
 * already tracks countdownRemaining on every countdown_started/tick; this
 * was the only place actually reading it.
 */
function CountdownOverlay(state) {
  const { countdownRemaining = 0 } = state;
  if (!countdownRemaining) return null;

  return h('div', { className: 'lobby-countdown-overlay' },
    h('div', { className: 'lobby-countdown-number' }, String(countdownRemaining))
  );
}

/**
 * Room info component (combines all sub-components)
 * @param {Object} state - Framework state
 * @param {string} state.roomCode - Room code
 * @param {Array} state.players - Players array
 * @param {boolean} state.isHost - Is current player host?
 * @param {boolean} state.isReady - Is current player ready?
 * @param {Object} actions - Actions object
 * @returns {VNode} Virtual DOM node
 */
export function RoomInfoComponent(state, actions) {
  return h('div', {},
    RoomCodeDisplay(state.roomCode),
    h('div', { className: 'lobby-controls' },
      LobbyInfo(state),
      ControlButtons(state, actions)
    ),
    CountdownOverlay(state)
  );
}
