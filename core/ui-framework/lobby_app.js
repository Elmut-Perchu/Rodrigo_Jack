/**
 * lobby_app.js - Framework-based VS Lobby Application
 *
 * Reactive lobby UI using mini-framework
 * Replaces vanilla DOM manipulation with declarative components
 */

import { createApp, h } from './ui-framework.js';
import { createWebSocketBridge } from './websocket-state-bridge.js';
import { PlayerListComponent } from './components/lobby/PlayerListComponent.js';
import { ChatBoxComponent } from './components/lobby/ChatBoxComponent.js';
import { RoomInfoComponent } from './components/lobby/RoomInfoComponent.js';
import { getPlayerName } from '../vs_prefs.js';

/**
 * Initialize lobby application
 */
export async function initializeLobby() {
  // Where we came from (set by vs_menu.html / vs_room_browser.html)
  const isHost = sessionStorage.getItem('isHost') === 'true';
  const playerName = getPlayerName() || 'Player';
  const roomCode = isHost ? generateRoomCode() : sessionStorage.getItem('roomCode');

  // Clear only what belonged to this one trip through the menu. The nickname
  // is deliberately left alone: it used to be deleted here, which is why the
  // player was asked for it again on the very next screen.
  sessionStorage.removeItem('roomCode');
  sessionStorage.removeItem('isHost');

  // Validate room code for non-hosts
  if (!isHost && !roomCode) {
    alert('No room code provided. Redirecting to the room browser...');
    window.location.href = 'vs_room_browser.html';
    return;
  }

  // Create initial state
  const initialState = {
    // Room info
    roomCode: roomCode,
    currentPlayerId: null,
    currentPlayerName: playerName,
    hostId: null,
    isHost: isHost,
    isReady: false,
    connected: false,

    // Players
    players: [],
    minPlayers: 2,

    // Lobby setup: which difficulty the next added opponent gets, and how
    // the room is divided up.
    botLevelChoice: 'soldier',
    teamMode: 'ffa',

    // Chat
    chatMessages: [
      {
        type: 'system',
        text: 'Welcome to VS Mode!',
        timestamp: Date.now()
      },
      {
        type: 'system',
        text: 'Share the room code with friends to invite them.',
        timestamp: Date.now()
      }
    ],

    // Timer
    countdownRemaining: 0,
    timerText: 'Waiting for players... (2 minimum required)'
  };

  // Create WebSocket bridge placeholder
  let bridge = null;

  // Create framework app
  const app = createApp({
    state: initialState,
    render(state) {
      return h('div', { className: 'lobby-container' },
        // Header
        h('div', { className: 'lobby-header' },
          h('h1', {}, '⚔️ VS MODE LOBBY ⚔️')
        ),

        // Room info component
        RoomInfoComponent(state, bridge?.actions || {}),

        // Main content grid
        h('div', { className: 'lobby-content' },
          // Players section
          PlayerListComponent(state, bridge?.actions || {}),

          // Chat section
          ChatBoxComponent(state, bridge?.actions || {})
        ),

        // Lobby controls (already in RoomInfoComponent, but keeping separate footer)
        h('div', { className: 'lobby-footer' })
      );
    }
  });

  // Create WebSocket bridge after app
  bridge = createWebSocketBridge(app.state);

  // Mount app to DOM
  app.mount('body');

  // Connect to WebSocket server
  try {
    console.log('[LobbyApp] Connecting to server...');
    await bridge.connect(roomCode, playerName);
    console.log('[LobbyApp] Connected successfully');
  } catch (error) {
    console.error('[LobbyApp] Connection failed:', error);
    alert('Failed to connect to server. Please refresh and try again.');
  }

  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    bridge.disconnect();
  });
}

/**
 * Generate random 4-character room code
 */
function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Auto-initialize on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeLobby);
} else {
  initializeLobby();
}
