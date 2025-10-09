/**
 * GameVS - VS Mode Extension of Base Game
 * Extends game.js for multiplayer battle arena functionality
 *
 * Phase 3 Days 16-17 - CRITICAL FIX: WebSocket connection + player entities
 */

import { Game } from './game.js';
import { WebSocketClient } from './core/network/websocket_client.js';
import { createNetworkPlayerComponent } from './core/components/network_player.js';

export class GameVS extends Game {
    constructor(container) {
        // Pass 'vs' mode to parent constructor to prevent Adventure menu creation
        super(container, 'vs');

        // VS Mode specific properties (mode already set in parent)
        // this.mode = 'vs'; // Already set by super()
        this.roomCode = null;
        this.playerName = null;
        this.players = new Map(); // Map of player entities by playerId
        this.localPlayerId = null;
        this.isHost = false;

        // Network properties
        this.networkClient = null;
        this.lastNetworkUpdate = 0;
        this.networkUpdateRate = 50; // 20 updates per second
        this.pendingRoomState = null; // Store room_state if it arrives before lobby_joined

        // Match properties
        this.matchStarted = false;
        this.matchTimer = 0;
        this.matchDuration = 180000; // 3 minutes
        this.playersAlive = 0;

        // Initialization flags
        this.playersReady = false;

        console.log('[GameVS] VS Mode game instance created');
        console.log('[GameVS] Mode:', this.mode);
    }

    /**
     * Initialize VS mode game
     * @param {string} roomCode - Room identifier
     * @param {boolean} isHost - Whether this player is the host
     */
    async initializeVSMode(roomCode, isHost = false) {
        try {
            this.roomCode = roomCode;
            this.isHost = isHost;

            console.log(`[GameVS] Initializing VS mode - Room: ${roomCode}, Host: ${isHost}`);

            // Get player name from sessionStorage
            this.playerName = sessionStorage.getItem('vsPlayerName') || 'Player';
            sessionStorage.removeItem('vsPlayerName');

            console.log(`[GameVS] Player name: ${this.playerName}`);

            // Disable Adventure-specific features
            console.log('[GameVS] Step 1: Disabling adventure features');
            this.disableAdventureFeatures();

            // Load VS battle map FIRST (before WebSocket)
            console.log('[GameVS] Step 2: Loading VS map');
            await this.loadVSMap();

            // Connect to WebSocket server (CRITICAL!)
            console.log('[GameVS] Step 3: Connecting to server');
            await this.connectToServer();

            // Add VS-specific systems (NetworkSyncSystem needs networkClient)
            console.log('[GameVS] Step 4: Adding VS systems');
            await this.addVSSystems();

            // Wait for all players to be created
            console.log('[GameVS] Step 5: Waiting for players');
            await this.waitForPlayers();

            // Unpause game to start rendering and gameplay
            this.paused = false;
            console.log('[GameVS] Game unpaused - match started!');
        } catch (error) {
            console.error('[GameVS] CRITICAL ERROR in initializeVSMode:', error);
            console.error('[GameVS] Error name:', error?.name);
            console.error('[GameVS] Error message:', error?.message);
            console.error('[GameVS] Error stack:', error?.stack);
            throw error;
        }
    }

    /**
     * Add VS-specific systems
     */
    async addVSSystems() {
        console.log('[GameVS] Adding VS-specific systems...');

        // Import and add NetworkSyncSystem
        const { NetworkSyncSystem } = await import('./core/systems_vs/network_sync_system.js');
        this.addSystem(new NetworkSyncSystem(this));

        // Import and add CombatSyncSystem
        const { CombatSyncSystem } = await import('./core/systems_vs/combat_sync_system.js');
        this.addSystem(new CombatSyncSystem(this));

        // Import and add InterpolationSystem (for smooth remote player movement)
        const { InterpolationSystem } = await import('./core/systems_vs/interpolation_system.js');
        this.addSystem(new InterpolationSystem(this));

        // Import and add NicknameRenderSystem (for player name display)
        const { NicknameRenderSystem } = await import('./core/systems_vs/nickname_render_system.js');
        this.addSystem(new NicknameRenderSystem(this));

        // Import and add PowerUpSystem (for power-up collection and effects)
        const { PowerUpSystem } = await import('./core/systems_vs/powerup_system.js');
        this.addSystem(new PowerUpSystem(this));

        console.log('[GameVS] VS systems added');
    }

    /**
     * Disable Adventure mode features
     */
    disableAdventureFeatures() {
        console.log('[GameVS] Disabling Adventure features...');

        // Disable cutscenes
        const cutsceneSystem = Array.from(this.systems).find(
            s => s.constructor.name === 'CutsceneSystem'
        );
        if (cutsceneSystem) {
            this.systems.delete(cutsceneSystem);
            console.log('[GameVS] Cutscene system disabled');
        }

        // Disable collectible/portal systems (players can't progress levels)
        const collectibleSystem = Array.from(this.systems).find(
            s => s.constructor.name === 'Collectible'
        );
        if (collectibleSystem) {
            this.systems.delete(collectibleSystem);
            console.log('[GameVS] Collectible system disabled');
        }

        // Disable score system (VS has own scoring)
        const scoreSystem = Array.from(this.systems).find(
            s => s.constructor.name === 'ScoreSystem'
        );
        if (scoreSystem) {
            this.systems.delete(scoreSystem);
            console.log('[GameVS] Score system disabled');
        }

        // Disable audio system (to avoid path errors in VS mode)
        const audioSystem = Array.from(this.systems).find(
            s => s.constructor.name === 'AudioSystem'
        );
        if (audioSystem) {
            this.systems.delete(audioSystem);
            console.log('[GameVS] Audio system disabled');
        }

        // Disable camera following - configure static camera
        const cameraSystem = Array.from(this.systems).find(
            s => s.constructor.name === 'Camera'
        );
        if (cameraSystem) {
            // Disable camera following in VS mode (we want static view of arena)
            cameraSystem.following = null;
            console.log('[GameVS] Camera following disabled - static arena view');
        }

        // Clear level state (not needed in VS)
        this.levelState = null;
        this.globalStats = null;

        console.log('[GameVS] Adventure features disabled');
    }

    /**
     * Connect to WebSocket server (CRITICAL!)
     */
    async connectToServer() {
        console.log('[GameVS] Connecting to WebSocket server...');

        try {
            // Create WebSocket client
            this.networkClient = new WebSocketClient();

            // Setup message handlers BEFORE connecting
            this.setupNetworkHandlers();

            // Connect to server
            await this.networkClient.connect(this.roomCode, this.playerName);

            console.log('[GameVS] Connected to server successfully');

        } catch (error) {
            console.error('[GameVS] Failed to connect to server:', error);
            throw error;
        }
    }

    /**
     * Setup network message handlers
     */
    setupNetworkHandlers() {
        console.log('[GameVS] Setting up network handlers...');

        // Lobby joined - store player ID and process pending room state
        this.networkClient.on('lobby_joined', (data) => {
            console.log('[GameVS] Lobby joined:', data);
            this.localPlayerId = data.playerId;
            this.isHost = data.isHost;

            // If room_state arrived before lobby_joined, process it now
            if (this.pendingRoomState) {
                console.log('[GameVS] Processing pending room state');
                this.handleRoomState(this.pendingRoomState);
                this.pendingRoomState = null;
            }
        });

        // Room state - create all players (wait for localPlayerId first)
        this.networkClient.on('room_state', (data) => {
            console.log('[GameVS] Room state received:', data);

            // Wait for lobby_joined to set localPlayerId
            if (!this.localPlayerId) {
                console.log('[GameVS] Waiting for lobby_joined before processing room_state');
                this.pendingRoomState = data;
                return;
            }

            this.handleRoomState(data);
        });

        // Player joined - create new player
        this.networkClient.on('player_joined', (data) => {
            console.log('[GameVS] Player joined:', data);
            this.handlePlayerJoined(data);
        });

        // Player left - remove player
        this.networkClient.on('player_left', (data) => {
            console.log('[GameVS] Player left:', data);
            this.handlePlayerLeft(data);
        });

        // Match start - begin game
        this.networkClient.on('match_start', (data) => {
            console.log('[GameVS] Match started!');
            this.handleMatchStart(data);
        });

        console.log('[GameVS] Network handlers registered');
    }

    /**
     * Handle room state - create all players
     */
    async handleRoomState(data) {
        console.log('[GameVS] Creating players from room state...');

        if (!data.players || data.players.length === 0) {
            console.warn('[GameVS] No players in room state');
            this.playersReady = true;
            return;
        }

        // Create all players
        for (let i = 0; i < data.players.length; i++) {
            const playerData = data.players[i];

            if (playerData.playerId === this.localPlayerId) {
                // Create local player (controllable)
                await this.createLocalPlayer(playerData, i);
            } else {
                // Create remote player (network synced)
                await this.createRemotePlayer(playerData, i);
            }
        }

        this.playersReady = true;
        console.log(`[GameVS] All players created (${data.players.length})`);
    }

    /**
     * Handle player joined - create new player entity
     */
    async handlePlayerJoined(data) {
        // Skip if it's the local player (already created)
        if (data.playerId === this.localPlayerId) return;

        console.log('[GameVS] Creating new remote player:', data.playerName);

        // Find player index based on current player count
        const playerIndex = this.players.size;

        await this.createRemotePlayer({
            playerId: data.playerId,
            playerName: data.playerName,
            isHost: data.isHost || false,
            isReady: false
        }, playerIndex);
    }

    /**
     * Handle player left - remove player entity
     */
    handlePlayerLeft(data) {
        const entity = this.players.get(data.playerId);
        if (entity) {
            console.log('[GameVS] Removing player entity:', data.playerId);
            this.removeEntity(entity);
            this.players.delete(data.playerId);
            this.playersAlive--;
        }
    }

    /**
     * Handle match start
     */
    handleMatchStart(data) {
        console.log('[GameVS] Match starting!');
        this.matchStarted = true;
        this.paused = false;
        this.matchTimer = 0;
        this.playersAlive = this.players.size;
    }

    /**
     * Create local player (controllable)
     */
    async createLocalPlayer(playerData, playerIndex) {
        console.log('[GameVS] Creating local player:', playerData.playerName);

        try {
            // Import player factory
            const { createPlayer } = await import('./create/player_create.js');

            // Get spawn point
            const spawn = this.getSpawnPoint(playerIndex);
            console.log('[GameVS] Local player spawn:', spawn);

            // Create player entity
            const player = createPlayer(spawn.x, spawn.y);

            // Add network player component using factory
            player.addComponent('networkPlayer',
                createNetworkPlayerComponent(
                    playerData.playerId,
                    playerData.playerName,
                    true, // isLocal
                    playerIndex
                )
            );

            // Add to game entities (so systems process it)
            this.addEntity(player);
            this.players.set(playerData.playerId, player);

            console.log('[GameVS] Local player created successfully');

        } catch (error) {
            console.error('[GameVS] Failed to create local player:', error);
            throw error;
        }
    }

    /**
     * Create remote player (network synced)
     */
    async createRemotePlayer(playerData, playerIndex) {
        console.log('[GameVS] Creating remote player:', playerData.playerName);

        try {
            // Get spawn point
            const spawn = this.getSpawnPoint(playerIndex);
            console.log('[GameVS] Remote player spawn:', spawn);

            // Import player factory
            const { createPlayer } = await import('./create/player_create.js');

            // Create player entity (without input component for remote players)
            const player = createPlayer(spawn.x, spawn.y);

            // Remove input component (remote players aren't controllable locally)
            const inputComponent = player.getComponent('input');
            if (inputComponent) {
                // FIX: Use proper component deletion
                if (player.removeComponent) {
                    player.removeComponent('input');
                } else {
                    player.components.delete('input');
                }
            }

            // Add network player component using factory
            player.addComponent('networkPlayer',
                createNetworkPlayerComponent(
                    playerData.playerId,
                    playerData.playerName,
                    false, // isLocal = false for remote
                    playerIndex
                )
            );

            // Add to game entities (so systems process it)
            this.addEntity(player);
            this.players.set(playerData.playerId, player);

            console.log('[GameVS] Remote player created successfully');

        } catch (error) {
            console.error('[GameVS] Failed to create remote player:', error);
            throw error;
        }
    }

    /**
     * Get spawn point for player index
     */
    getSpawnPoint(playerIndex) {
        // Default spawn points (corners of arena)
        const defaultSpawns = [
            { x: 100, y: 100 },    // Top-left
            { x: 700, y: 100 },    // Top-right
            { x: 100, y: 500 },    // Bottom-left
            { x: 700, y: 500 }     // Bottom-right
        ];

        // TODO: Find spawn points from map entities (entities with 'spawn' component)
        // For now, use default positions

        return defaultSpawns[playerIndex] || defaultSpawns[0];
    }

    /**
     * Wait for all players to be created
     */
    waitForPlayers() {
        return new Promise((resolve) => {
            console.log('[GameVS] Waiting for players...');

            const checkInterval = setInterval(() => {
                if (this.playersReady) {
                    clearInterval(checkInterval);
                    console.log('[GameVS] All players ready');
                    resolve();
                }
            }, 100);

            // Timeout after 10 seconds
            setTimeout(() => {
                clearInterval(checkInterval);
                console.warn('[GameVS] waitForPlayers() timed out');
                resolve();
            }, 10000);
        });
    }

    /**
     * Load VS battle map
     */
    async loadVSMap() {
        console.log('[GameVS] Loading VS battle map...');

        try {
            // Import MapLoader
            const { MapLoader } = await import('./core/map_loader.js');
            const mapLoader = new MapLoader(this);

            // Load pvp_arena1.json (use absolute path from root)
            await mapLoader.loadMap('../assets/maps/pvp_arena1.json');

            console.log('[GameVS] VS battle map loaded successfully');

            // Setup match state
            this.paused = false;
            this.matchStarted = false; // Will be set to true by server signal
            this.playersAlive = 0; // Will be updated when players spawn

        } catch (error) {
            console.error('[GameVS] Failed to load VS map:', error);
            throw error;
        }
    }

    /**
     * Override update to include network sync
     * @param {number} deltaTime - Time since last frame
     */
    update(deltaTime) {
        // Call base game update
        super.update(deltaTime);

        // VS mode specific updates
        if (this.matchStarted) {
            this.updateMatchTimer(deltaTime);
            this.updateNetworkSync(deltaTime);
        }
    }

    /**
     * Update match timer
     * @private
     */
    updateMatchTimer(deltaTime) {
        this.matchTimer += deltaTime;

        // Check for match end
        if (this.matchTimer >= this.matchDuration) {
            this.endMatch('time_limit');
        }

        // Check for last player standing
        if (this.playersAlive <= 1) {
            this.endMatch('last_standing');
        }
    }

    /**
     * Update network synchronization (placeholder)
     * @private
     */
    updateNetworkSync(deltaTime) {
        this.lastNetworkUpdate += deltaTime;

        if (this.lastNetworkUpdate >= this.networkUpdateRate) {
            // Placeholder: Will send position/state updates in Phase 3
            this.lastNetworkUpdate = 0;
        }
    }

    /**
     * Start match
     */
    startMatch() {
        this.matchStarted = true;
        this.matchTimer = 0;
        this.playersAlive = this.players.size;

        console.log(`[GameVS] Match started - ${this.playersAlive} players`);

        // Placeholder: Will sync start with all clients in Phase 2
    }

    /**
     * End match
     * @param {string} reason - Match end reason ('time_limit' or 'last_standing')
     */
    endMatch(reason) {
        this.matchStarted = false;

        console.log(`[GameVS] Match ended - Reason: ${reason}`);

        // Placeholder: Will display results and return to lobby in Phase 4
    }

    /**
     * Add remote player to game
     * @param {string} playerId - Player UUID
     * @param {Object} playerData - Player initial data
     */
    addRemotePlayer(playerId, playerData) {
        console.log(`[GameVS] Adding remote player: ${playerId}`, playerData);

        // Placeholder: Will create remote player entity in Phase 3
        // this.players.set(playerId, remotePlayerEntity);
    }

    /**
     * Remove remote player from game
     * @param {string} playerId - Player UUID
     */
    removeRemotePlayer(playerId) {
        const player = this.players.get(playerId);
        if (player) {
            console.log(`[GameVS] Removing remote player: ${playerId}`);

            // Remove entity from game
            this.removeEntity(player);
            this.players.delete(playerId);

            this.playersAlive--;
        }
    }

    /**
     * Update remote player state from network
     * @param {string} playerId - Player UUID
     * @param {Object} state - Player state data
     */
    updateRemotePlayer(playerId, state) {
        const player = this.players.get(playerId);
        if (player) {
            // Placeholder: Will implement state interpolation in Phase 3
            console.log(`[GameVS] Updating remote player: ${playerId}`, state);
        }
    }

    /**
     * Get local player state for network broadcast
     * @returns {Object} - Local player state
     */
    getLocalPlayerState() {
        // Placeholder: Will return position, velocity, health, etc. in Phase 3
        return {
            playerId: this.localPlayerId,
            timestamp: Date.now()
        };
    }

    /**
     * Override restart to prevent accidental game restart in VS mode
     */
    restart() {
        console.warn('[GameVS] restart() disabled in VS mode - use endMatch() instead');
    }

    /**
     * Override resetCurrentLevel to prevent level reset in VS mode
     */
    resetCurrentLevel() {
        console.warn('[GameVS] resetCurrentLevel() disabled in VS mode - matches are single arena');
    }

    /**
     * Cleanup VS mode resources
     */
    cleanup() {
        console.log('[GameVS] Cleaning up VS mode resources');

        // Disconnect network
        if (this.networkClient) {
            this.networkClient.disconnect();
        }

        // Clear players
        this.players.clear();

        // Call base cleanup if it exists
        if (super.cleanup) {
            super.cleanup();
        }
    }
}
