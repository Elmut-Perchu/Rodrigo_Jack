/**
 * LobbyManager - VS Mode Lobby UI Controller
 * Manages lobby UI, WebSocket communication, and player state
 *
 * Phase 3 Days 11-13
 */

import { WebSocketClient } from '../network/websocket_client.js';

export class LobbyManager {
    constructor() {
        this.wsClient = new WebSocketClient();
        this.roomCode = null;
        this.playerId = null;
        this.playerName = null;
        this.isHost = false;
        this.players = new Map(); // playerId -> player data
        this.isReady = false;

        // UI Elements
        this.ui = {
            roomCode: null,
            playerCount: null,
            playerSlots: [],
            chatMessages: null,
            chatInput: null,
            chatSend: null,
            readyButton: null,
            startButton: null,
            backButton: null,
            lobbyInfo: null,
            timerDisplay: null
        };

        // Timer state
        this.waitTimer = null;
        this.countdownTimer = null;
        this.countdownRemaining = 0;
    }

    /**
     * Initialize lobby manager with UI elements
     */
    async initialize() {
        console.log('[LobbyManager] Initializing...');

        // Get UI elements
        this.ui.roomCode = document.getElementById('room-code');
        this.ui.playerCount = document.querySelector('.players-section h2');
        this.ui.playerSlots = Array.from(document.querySelectorAll('.player-slot'));
        this.ui.chatMessages = document.getElementById('chat-messages');
        this.ui.chatInput = document.getElementById('chat-input');
        this.ui.chatSend = document.getElementById('chat-send');
        this.ui.readyButton = document.getElementById('btn-ready');
        this.ui.startButton = document.getElementById('btn-start');
        this.ui.backButton = document.getElementById('btn-back');
        this.ui.lobbyInfo = document.querySelector('.lobby-info');

        // Setup event listeners
        this.setupEventListeners();

        // Generate or get room code
        this.roomCode = this.generateRoomCode();
        this.ui.roomCode.textContent = this.roomCode;

        // Get player name (from prompt for now)
        this.playerName = prompt('Enter your name (max 12 chars):', 'Player') || 'Player';
        this.playerName = this.playerName.substring(0, 12);

        // Connect to WebSocket
        await this.connect();
    }

    /**
     * Setup UI event listeners
     */
    setupEventListeners() {
        // Back button
        this.ui.backButton.addEventListener('click', () => {
            this.disconnect();
            window.location.href = '../index.html';
        });

        // Ready button
        this.ui.readyButton.addEventListener('click', () => {
            this.toggleReady();
        });

        // Start button (host only)
        this.ui.startButton.addEventListener('click', () => {
            if (this.isHost) {
                this.startGame();
            }
        });

        // Chat send
        this.ui.chatSend.addEventListener('click', () => {
            this.sendChatMessage();
        });

        this.ui.chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendChatMessage();
            }
        });
    }

    /**
     * Connect to WebSocket server
     */
    async connect() {
        try {
            console.log('[LobbyManager] Connecting to server...');

            // Setup message handlers
            this.wsClient.on('lobby_joined', (data) => this.handleLobbyJoined(data));
            this.wsClient.on('room_state', (data) => this.handleRoomState(data));
            this.wsClient.on('player_joined', (data) => this.handlePlayerJoined(data));
            this.wsClient.on('player_left', (data) => this.handlePlayerLeft(data));
            this.wsClient.on('player_ready', (data) => this.handlePlayerReady(data));
            this.wsClient.on('chat_message', (data) => this.handleChatMessage(data));
            this.wsClient.on('wait_timer_started', (data) => this.handleWaitTimerStarted(data));
            this.wsClient.on('countdown_started', (data) => this.handleCountdownStarted(data));
            this.wsClient.on('countdown_tick', (data) => this.handleCountdownTick(data));
            this.wsClient.on('countdown_cancelled', (data) => this.handleCountdownCancelled(data));
            this.wsClient.on('game_starting', (data) => this.handleGameStarting(data));
            this.wsClient.on('error', (data) => this.handleError(data));

            // Connect
            await this.wsClient.connect(this.roomCode, this.playerName);
            console.log('[LobbyManager] Connected successfully');

        } catch (error) {
            console.error('[LobbyManager] Connection failed:', error);
            alert('Failed to connect to server. Please try again.');
        }
    }

    /**
     * Disconnect from server
     */
    disconnect() {
        this.wsClient.disconnect();
    }

    /**
     * Toggle ready status
     */
    toggleReady() {
        this.isReady = !this.isReady;

        this.wsClient.send('lobby_ready', {
            isReady: this.isReady
        });

        this.ui.readyButton.textContent = this.isReady ? 'Not Ready' : 'Ready';
        this.ui.readyButton.style.backgroundColor = this.isReady ? '#e67e22' : '#2ecc71';
    }

    /**
     * Start game (host only)
     */
    startGame() {
        if (!this.isHost) {
            console.warn('[LobbyManager] Only host can start game');
            return;
        }

        // Game will auto-start via countdown, this is manual override
        console.log('[LobbyManager] Manual game start requested');
    }

    /**
     * Send chat message
     */
    sendChatMessage() {
        const message = this.ui.chatInput.value.trim();
        if (message) {
            this.wsClient.send('chat_message', { message });
            this.ui.chatInput.value = '';
        }
    }

    /**
     * Handle lobby_joined message
     */
    handleLobbyJoined(data) {
        console.log('[LobbyManager] Lobby joined:', data);
        this.playerId = data.playerId;
        this.isHost = data.isHost;

        if (this.isHost) {
            this.ui.startButton.disabled = false;
        }
    }

    /**
     * Handle room_state message
     */
    handleRoomState(data) {
        console.log('[LobbyManager] Room state:', data);

        // Update players
        this.players.clear();
        data.players.forEach(player => {
            this.players.set(player.playerId, player);
        });

        this.updatePlayerSlots();
        this.updatePlayerCount(data.playerCount, data.maxPlayers);
    }

    /**
     * Handle player_joined message
     */
    handlePlayerJoined(data) {
        console.log('[LobbyManager] Player joined:', data);

        this.players.set(data.playerId, {
            playerId: data.playerId,
            playerName: data.playerName,
            isHost: data.isHost,
            isReady: false
        });

        this.updatePlayerSlots();
        this.updatePlayerCount(data.playerCount, 4);
    }

    /**
     * Handle player_left message
     */
    handlePlayerLeft(data) {
        console.log('[LobbyManager] Player left:', data);

        this.players.delete(data.playerId);
        this.updatePlayerSlots();
        this.updatePlayerCount(data.playerCount, 4);
    }

    /**
     * Handle player_ready message
     */
    handlePlayerReady(data) {
        console.log('[LobbyManager] Player ready:', data);

        const player = this.players.get(data.playerId);
        if (player) {
            player.isReady = data.isReady;
            this.updatePlayerSlots();
        }
    }

    /**
     * Handle chat_message
     */
    handleChatMessage(data) {
        const isSystem = data.isSystem || data.playerId === 'system';
        const messageDiv = document.createElement('div');
        messageDiv.className = 'chat-message';

        if (isSystem) {
            messageDiv.innerHTML = `<span class="system">${data.message}</span>`;
        } else {
            const playerClass = data.playerId === this.playerId ? 'you' : 'username';
            messageDiv.innerHTML = `<span class="${playerClass}">${data.playerName}:</span> ${data.message}`;
        }

        this.ui.chatMessages.appendChild(messageDiv);
        this.ui.chatMessages.scrollTop = this.ui.chatMessages.scrollHeight;
    }

    /**
     * Handle wait_timer_started
     */
    handleWaitTimerStarted(data) {
        console.log('[LobbyManager] Wait timer started:', data.duration);
        this.ui.lobbyInfo.textContent = `Waiting for players... (${data.duration}s)`;
    }

    /**
     * Handle countdown_started
     */
    handleCountdownStarted(data) {
        console.log('[LobbyManager] Countdown started:', data.remaining);
        this.countdownRemaining = data.remaining;
        this.ui.lobbyInfo.textContent = `Game starting in ${this.countdownRemaining}s...`;
    }

    /**
     * Handle countdown_tick
     */
    handleCountdownTick(data) {
        this.countdownRemaining = data.remaining;
        this.ui.lobbyInfo.textContent = `Game starting in ${this.countdownRemaining}s...`;
    }

    /**
     * Handle countdown_cancelled
     */
    handleCountdownCancelled(data) {
        console.log('[LobbyManager] Countdown cancelled');
        this.ui.lobbyInfo.textContent = 'Waiting for all players to be ready...';
    }

    /**
     * Handle game_starting
     */
    handleGameStarting(data) {
        console.log('[LobbyManager] Game starting!');
        this.ui.lobbyInfo.textContent = 'Starting game...';

        // Redirect to game page after 2 seconds
        setTimeout(() => {
            window.location.href = 'vs_game.html?room=' + this.roomCode;
        }, 2000);
    }

    /**
     * Handle error message
     */
    handleError(data) {
        console.error('[LobbyManager] Error:', data.message);
        alert('Error: ' + data.message);
    }

    /**
     * Update player slots in UI
     */
    updatePlayerSlots() {
        const playerArray = Array.from(this.players.values());

        this.ui.playerSlots.forEach((slot, index) => {
            if (index < playerArray.length) {
                const player = playerArray[index];
                const isYou = player.playerId === this.playerId;

                slot.className = 'player-slot occupied';
                if (player.isHost) {
                    slot.classList.add('host');
                }

                const nameText = isYou ? `${player.playerName} (You)` : player.playerName;
                const hostIcon = player.isHost ? '🏆 ' : '';
                const readyText = player.isReady ? 'Ready' : 'Not Ready';

                slot.innerHTML = `
                    <div class="player-name">${hostIcon}${nameText}</div>
                    <div class="player-status">${readyText}</div>
                `;
            } else {
                slot.className = 'player-slot';
                slot.innerHTML = '<div class="player-status">Waiting for player...</div>';
            }
        });
    }

    /**
     * Update player count
     */
    updatePlayerCount(count, max) {
        this.ui.playerCount.textContent = `Players (${count}/${max})`;
    }

    /**
     * Generate random room code
     */
    generateRoomCode() {
        return Math.random().toString(36).substring(2, 6).toUpperCase();
    }
}
