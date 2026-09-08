/**
 * websocket-state-bridge.js - Bridge between WebSocket and Framework State
 *
 * Connects WebSocket events to reactive framework state
 * Provides actions that send WebSocket messages
 * Enables fully reactive lobby UI
 */

import { WebSocketClient } from '../network/websocket_client.js';
import { withWakeUp } from '../ui/wake_overlay.js';

/**
 * Create WebSocket state bridge
 * @param {Object} frameworkState - Reactive framework state
 * @returns {Object} - { wsClient, actions, connect, disconnect }
 */
export function createWebSocketBridge(frameworkState) {
  const wsClient = new WebSocketClient();

  /**
   * Initialize WebSocket message handlers
   * Maps WebSocket events → framework state updates
   */
  function setupMessageHandlers() {
    // Lobby joined - Initial connection confirmation
    wsClient.on('lobby_joined', (data) => {
      frameworkState.currentPlayerId = data.playerId;
      frameworkState.isHost = data.isHost;

      // Add system message
      frameworkState.chatMessages.push({
        type: 'system',
        text: 'Connected to lobby!',
        timestamp: Date.now()
      });
    });

    // Room state - Full state update
    wsClient.on('room_state', (data) => {
      frameworkState.players = data.players.map(p => ({
        id: p.playerId,
        name: p.playerName,
        ready: p.isReady,
        isHost: p.isHost,
        // A slot filled by the computer, and which side it fights for.
        isBot: !!p.isBot,
        botLevel: p.botLevel || null,
        team: p.team || 0
      }));
      frameworkState.hostId = data.players.find(p => p.isHost)?.playerId || null;
      frameworkState.teamMode = data.teamMode || 'ffa';
    });

    // Player joined
    wsClient.on('player_joined', (data) => {
      const existingPlayer = frameworkState.players.find(p => p.id === data.playerId);
      if (!existingPlayer) {
        frameworkState.players.push({
          id: data.playerId,
          name: data.playerName,
          // A machine never keeps anyone waiting.
          ready: !!data.isBot,
          isHost: data.isHost,
          isBot: !!data.isBot,
          botLevel: data.botLevel || null,
          team: 0
        });

        // System message
        frameworkState.chatMessages.push({
          type: 'system',
          text: `${data.playerName} joined the lobby`,
          timestamp: Date.now()
        });
      }
    });

    // Player left
    wsClient.on('player_left', (data) => {
      const index = frameworkState.players.findIndex(p => p.id === data.playerId);
      if (index !== -1) {
        const playerName = frameworkState.players[index].name;
        frameworkState.players.splice(index, 1);

        // System message
        frameworkState.chatMessages.push({
          type: 'system',
          text: `${playerName} left the lobby`,
          timestamp: Date.now()
        });
      }
    });

    // Player ready status changed
    wsClient.on('player_ready', (data) => {
      const player = frameworkState.players.find(p => p.id === data.playerId);
      if (player) {
        player.ready = data.isReady;

        // Force state update (needed for reactive Proxy to detect change)
        frameworkState.players = [...frameworkState.players];
      }
    });

    // Chat message received
    wsClient.on('chat_message', (data) => {
      const isSystem = data.isSystem || data.playerId === 'system';

      frameworkState.chatMessages.push({
        type: isSystem ? 'system' : 'user',
        username: data.playerName,
        text: data.message,
        timestamp: Date.now()
      });

      // Auto-scroll chat to bottom after render
      setTimeout(() => {
        const chatEl = document.getElementById('chat-messages');
        if (chatEl) chatEl.scrollTop = chatEl.scrollHeight;
      }, 50);
    });

    // Timer events
    wsClient.on('wait_timer_started', (data) => {
      frameworkState.timerText = `Waiting for players... (${data.duration}s)`;
    });

    wsClient.on('countdown_started', (data) => {
      frameworkState.countdownRemaining = data.remaining;
      frameworkState.timerText = `Game starting in ${data.remaining}s...`;
    });

    wsClient.on('countdown_tick', (data) => {
      frameworkState.countdownRemaining = data.remaining;
      frameworkState.timerText = `Game starting in ${data.remaining}s...`;
    });

    wsClient.on('countdown_cancelled', () => {
      frameworkState.countdownRemaining = 0;
      frameworkState.timerText = 'Waiting for all players to be ready...';
    });

    // Game starting - just update UI, don't navigate yet
    wsClient.on('game_starting', (data) => {
      frameworkState.timerText = 'Starting game...';
      console.log('[WebSocketBridge] Game starting, waiting for match_start...');
    });

    // Match start - NOW navigate to game (server is ready with IsGameActive = true)
    wsClient.on('match_start', (data) => {
      console.log('[WebSocketBridge] Match started! Preparing to navigate...');

      // Store player info for game
      sessionStorage.setItem('vsPlayerName', frameworkState.currentPlayerName);
      sessionStorage.setItem('vsPlayerId', frameworkState.currentPlayerId);
      sessionStorage.setItem('vsRoomCode', frameworkState.roomCode);

      // CRITICAL FIX: Send game_ready BEFORE navigating!
      // This tells server we're about to load game client
      // Server will wait for us to reconnect
      console.log('📨 [WebSocketBridge] Sending game_ready before navigation...');
      wsClient.send('game_ready', {
        playerId: frameworkState.currentPlayerId
      });

      // Small delay to ensure message is sent before disconnecting
      setTimeout(() => {
        console.log('[WebSocketBridge] Navigating to game...');
        window.location.href = `vs_game.html?room=${frameworkState.roomCode}`;
      }, 100); // 100ms delay
    });

    // Error handling
    wsClient.on('error', (data) => {
      console.error('[WebSocketBridge] Error:', data.message);
      alert('Error: ' + data.message);
    });

    // Mark handlers ready
    wsClient.markHandlersReady();
  }

  /**
   * Actions - Functions that send WebSocket messages
   */
  const actions = {
    /**
     * Send chat message
     */
    sendChatMessage(text) {
      if (text && text.trim()) {
        wsClient.send('chat_message', { message: text.trim() });
      }
    },

    /**
     * Toggle ready status
     */
    toggleReady() {
      frameworkState.isReady = !frameworkState.isReady;
      wsClient.send('lobby_ready', { isReady: frameworkState.isReady });
    },

    /**
     * Start game (host only)
     */
    startGame() {
      if (frameworkState.isHost) {
        wsClient.send('start_game', {});
      }
    },

    /**
     * Fill a free slot with a computer opponent (host only).
     */
    addBot(level) {
      if (!frameworkState.isHost) return;
      wsClient.send('lobby_add_bot', { level: level || frameworkState.botLevelChoice || 'soldier' });
    },

    /** Take a computer opponent back out (host only). */
    removeBot(playerId) {
      if (!frameworkState.isHost) return;
      wsClient.send('lobby_remove_bot', { playerId });
    },

    /** Pick which difficulty the next added opponent will be. */
    chooseBotLevel(level) {
      frameworkState.botLevelChoice = level;
    },

    /** Choose the team layout: ffa, 2v2 or 3v1 (host only). */
    setTeams(mode) {
      if (!frameworkState.isHost) return;
      wsClient.send('lobby_set_teams', { mode });
    },

    /**
     * Put one fighter on a side (host only).
     *
     * The free-form alternative to the presets: clicking a slot swaps it
     * between the two sides, which covers splits the presets do not.
     */
    setPlayerTeam(playerId, team) {
      if (!frameworkState.isHost) return;
      wsClient.send('lobby_set_player_team', { playerId, team });
    },

    /**
     * Go back to menu
     */
    goBack() {
      wsClient.disconnect();
      window.location.href = 'vs_room_browser.html';
    }
  };

  /**
   * Connect to WebSocket server
   */
  async function connect(roomCode, playerName) {
    frameworkState.roomCode = roomCode;
    frameworkState.currentPlayerName = playerName;

    // Setup handlers before connecting
    setupMessageHandlers();

    // Connect. Wrapped in withWakeUp because Render's free tier puts the
    // server to sleep after 15 min idle - the first attempt after that can
    // take up to ~50s to come back.
    try {
      await withWakeUp(() => wsClient.connect(roomCode, playerName));
      frameworkState.connected = true;
      return { success: true };
    } catch (error) {
      console.error('[WebSocketBridge] Connection failed:', error);
      frameworkState.connected = false;
      throw error;
    }
  }

  /**
   * Disconnect from server
   */
  function disconnect() {
    wsClient.disconnect();
    frameworkState.connected = false;
  }

  return {
    wsClient,
    actions,
    connect,
    disconnect
  };
}
