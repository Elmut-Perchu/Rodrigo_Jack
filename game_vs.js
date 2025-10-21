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

        // Initialization timestamp for detailed logging
        this.initStartTime = performance.now();

        this.logWithTimestamp('[GameVS] VS Mode game instance created');
        this.logWithTimestamp(`[GameVS] Mode: ${this.mode}`);
    }

    /**
     * Log with timestamp (milliseconds since init)
     * @param {string} message - Log message
     * @private
     */
    logWithTimestamp(message) {
        const elapsed = (performance.now() - this.initStartTime).toFixed(1);
        console.log(`[${elapsed}ms] ${message}`);
    }

    /**
     * Update loading step UI
     * @param {string} stepId - Step ID (init, adventure, map, server, systems, players)
     * @param {string} status - Status ('pending', 'in_progress', 'completed', 'error')
     * @private
     */
    updateLoadingStep(stepId, status) {
        const iconId = `icon-${stepId}`;
        const iconElement = document.getElementById(iconId);

        if (!iconElement) return;

        switch (status) {
            case 'in_progress':
                iconElement.textContent = '🔄';
                break;
            case 'completed':
                iconElement.textContent = '✅';
                break;
            case 'error':
                iconElement.textContent = '❌';
                break;
            default:
                iconElement.textContent = '⏳';
        }
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

            this.logWithTimestamp(`[GameVS] Initializing VS mode - Room: ${roomCode}, Host: ${isHost}`);
            this.updateLoadingStep('init', 'completed');

            // Get player name from sessionStorage
            this.playerName = sessionStorage.getItem('vsPlayerName') || 'Player';
            sessionStorage.removeItem('vsPlayerName');

            this.logWithTimestamp(`[GameVS] Player name: ${this.playerName}`);

            // Disable Adventure-specific features
            this.logWithTimestamp('[GameVS] Step 1: Disabling adventure features');
            this.updateLoadingStep('adventure', 'in_progress');
            this.disableAdventureFeatures();
            this.updateLoadingStep('adventure', 'completed');
            this.logWithTimestamp('[GameVS] Adventure features disabled');

            // Load VS battle map FIRST (before WebSocket)
            this.logWithTimestamp('[GameVS] Step 2: Loading VS map');
            this.updateLoadingStep('map', 'in_progress');
            await this.loadVSMap();
            this.updateLoadingStep('map', 'completed');
            this.logWithTimestamp('[GameVS] VS map loaded');

            // CRITICAL FIX: Create WebSocket client BEFORE adding systems
            // This ensures networkClient exists when systems register handlers
            this.logWithTimestamp('[GameVS] Step 3: Creating WebSocket client');
            const { WebSocketClient } = await import('./core/network/websocket_client.js');
            this.networkClient = new WebSocketClient();
            this.logWithTimestamp('[GameVS] WebSocket client created');

            // Add VS systems (handlers will be registered when systems are added)
            this.logWithTimestamp('[GameVS] Step 4: Adding VS systems');
            this.updateLoadingStep('systems', 'in_progress');
            await this.addVSSystems();
            this.updateLoadingStep('systems', 'completed');
            this.logWithTimestamp('[GameVS] VS systems added');

            // Connect to WebSocket server AFTER systems are ready
            this.logWithTimestamp('[GameVS] Step 5: Connecting to server');
            this.updateLoadingStep('server', 'in_progress');
            await this.connectToServer();
            this.updateLoadingStep('server', 'completed');
            this.logWithTimestamp('[GameVS] Server connected');

            // Wait for all players to be created
            this.logWithTimestamp('[GameVS] Step 6: Waiting for players');
            this.updateLoadingStep('players', 'in_progress');
            await this.waitForPlayers();
            this.updateLoadingStep('players', 'completed');
            this.logWithTimestamp('[GameVS] Players ready');

            // Unpause game to start rendering and gameplay
            this.paused = false;
            this.logWithTimestamp('[GameVS] Game unpaused - match started!');
        } catch (error) {
            console.error('[GameVS] CRITICAL ERROR in initializeVSMode:', error);
            console.error('[GameVS] Error name:', error?.name);
            console.error('[GameVS] Error message:', error?.message);
            console.error('[GameVS] Error stack:', error?.stack);

            // Mark all steps as error
            ['adventure', 'map', 'server', 'systems', 'players'].forEach(step => {
                const element = document.getElementById(`icon-${step}`);
                if (element && element.textContent !== '✅') {
                    this.updateLoadingStep(step, 'error');
                }
            });

            throw error;
        }
    }

    /**
     * Add VS-specific systems
     */
    async addVSSystems() {
        console.log('[GameVS] Adding VS-specific systems...');

        // Import and add NetworkSyncSystem (save reference for later)
        const { NetworkSyncSystem } = await import('./core/systems_vs/network_sync_system.js');
        this.networkSyncSystem = new NetworkSyncSystem(this);
        this.addSystem(this.networkSyncSystem);

        // Import and add CombatSyncSystem
        const { CombatSyncSystem } = await import('./core/systems_vs/combat_sync_system.js');
        this.addSystem(new CombatSyncSystem(this));

        // NOTE: InterpolationSystem removed - NetworkSyncSystem has built-in interpolation
        // The NetworkSyncSystem handles interpolation in updateRemotePlayers() and interpolateRemotePlayer()

        // Import and add NicknameRenderSystem (for player name display)
        const { NicknameRenderSystem } = await import('./core/systems_vs/nickname_render_system.js');
        this.addSystem(new NicknameRenderSystem(this));

        // Import and add PowerUpSystem (for power-up collection and effects)
        const { PowerUpSystem } = await import('./core/systems_vs/powerup_system.js');
        this.addSystem(new PowerUpSystem(this));

        console.log('[GameVS] VS systems added (handlers will be registered after WebSocket connection)');
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

        // CRITICAL: Disable enemy AI (remote players are NOT enemies!)
        const enemyBehaviorSystem = Array.from(this.systems).find(
            s => s.constructor.name === 'EnemyBehavior'
        );
        if (enemyBehaviorSystem) {
            this.systems.delete(enemyBehaviorSystem);
            console.log('[GameVS] Enemy behavior system disabled');
        }

        // Disable bow/arrow systems (VS has different combat)
        const bowSystems = ['BowInputSystem', 'BowChargeSystem', 'ArrowSpawnSystem',
                           'ArrowPhysicsSystem', 'ArrowCollisionSystem', 'ArrowImpactSystem',
                           'ArrowPickupSystem'];
        bowSystems.forEach(systemName => {
            const system = Array.from(this.systems).find(s => s.constructor.name === systemName);
            if (system) {
                this.systems.delete(system);
                console.log(`[GameVS] ${systemName} disabled`);
            }
        });

        // Disable Adventure combat system (replaced by CombatSyncSystem)
        const combatSystem = Array.from(this.systems).find(
            s => s.constructor.name === 'Combat'
        );
        if (combatSystem) {
            this.systems.delete(combatSystem);
            console.log('[GameVS] Combat system disabled (using CombatSyncSystem)');
        }

        // Disable damage/health systems (server-authoritative in VS mode)
        const damageSystem = Array.from(this.systems).find(
            s => s.constructor.name === 'Damage'
        );
        if (damageSystem) {
            this.systems.delete(damageSystem);
            console.log('[GameVS] Damage system disabled (server-authoritative)');
        }

        const healthSystem = Array.from(this.systems).find(
            s => s.constructor.name === 'Health'
        );
        if (healthSystem) {
            this.systems.delete(healthSystem);
            console.log('[GameVS] Health system disabled (server-authoritative)');
        }

        // CRITICAL FIX: Completely remove Camera system in VS mode
        // In VS, we want a static centered view of the entire arena
        const cameraSystem = Array.from(this.systems).find(
            s => s.constructor.name === 'Camera'
        );
        if (cameraSystem) {
            // Remove camera system from update loop
            this.systems.delete(cameraSystem);

            // Reset game-world transform (no camera offset)
            const gameWorld = document.querySelector('.game-world');
            if (gameWorld) {
                gameWorld.style.transform = 'none';
                gameWorld.style.left = '0';
                gameWorld.style.top = '0';
                console.log('[GameVS] Game-world transform reset to static view');
            }

            console.log('[GameVS] Camera system completely removed - static arena view');
        }

        // Remove camera component from all entities (prevent camera following)
        let cameraComponentsRemoved = 0;
        for (const entity of this.entities) {
            if (entity.getComponent('camera')) {
                entity.removeComponent('camera');
                cameraComponentsRemoved++;
            }
        }
        if (cameraComponentsRemoved > 0) {
            console.log(`[GameVS] Removed ${cameraComponentsRemoved} camera component(s) from entities`);
        }

        // Clear level state (not needed in VS)
        this.levelState = null;
        this.globalStats = null;

        console.log('[GameVS] Adventure features disabled');
    }

    /**
     * Connect to WebSocket server (CRITICAL!)
     * Note: networkClient is created in initializeVSMode() BEFORE this is called
     * This ensures systems can register handlers during addVSSystems()
     */
    async connectToServer() {
        console.log('[GameVS] Connecting to WebSocket server...');

        try {
            // networkClient already created in initializeVSMode()
            if (!this.networkClient) {
                throw new Error('NetworkClient not initialized');
            }

            // Setup GameVS-specific message handlers BEFORE connecting
            this.setupNetworkHandlers();

            // Connect to server
            await this.networkClient.connect(this.roomCode, this.playerName);

            console.log('[GameVS] Connected to server successfully');

            // CRITICAL: Register NetworkSyncSystem handlers NOW (after networkClient exists and is connected)
            if (this.networkSyncSystem) {
                console.log('[GameVS] Registering NetworkSyncSystem handlers...');
                this.networkSyncSystem.registerHandlers();
            } else {
                console.error('[GameVS] NetworkSyncSystem not found!');
            }

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
            console.log('👤 [GameVS] player_joined event received:', data);
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

            // Skip if player already exists (prevent duplicates)
            if (this.players.has(playerData.playerId)) {
                console.log(`[GameVS] Player ${playerData.playerId} already exists, skipping`);
                continue;
            }

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

        // Skip if player already exists (prevent duplicates)
        if (this.players.has(data.playerId)) {
            console.log(`[GameVS] Player ${data.playerId} already exists, skipping`);
            return;
        }

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
            // Import local player factory
            const { createLocalPlayer } = await import('./create/remote_player_create.js');

            // Get spawn point
            const spawn = this.getSpawnPoint(playerIndex);
            console.log('[GameVS] Local player spawn:', spawn);

            // Create local player entity (with input component)
            const player = createLocalPlayer({
                playerId: playerData.playerId,
                playerName: playerData.playerName,
                x: spawn.x,
                y: spawn.y,
                facingRight: true,
                health: 100,
                isAlive: true
            }, playerIndex);

            // Add to game entities (so systems process it)
            this.addEntity(player);
            this.players.set(playerData.playerId, player);

            console.log('[GameVS] Local player created successfully');

            // CRITICAL: Send player_ready to server so match can start
            this.networkClient.send('player_ready', {
                playerId: this.localPlayerId,
                ready: true
            });
            console.log('[GameVS] Sent player_ready to server');

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

            // Import remote player factory
            const { createRemotePlayer } = await import('./create/remote_player_create.js');

            // Create remote player entity (WITHOUT input component)
            const player = createRemotePlayer({
                playerId: playerData.playerId,
                playerName: playerData.playerName,
                x: spawn.x,
                y: spawn.y,
                facingRight: true,
                health: 100,
                isAlive: true
            }, playerIndex);

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
     * Map: pvp_arena_compact.json (24x14 tiles, 64px each = 1536x896)
     * Spawn points positioned for visibility in static camera view
     */
    getSpawnPoint(playerIndex) {
        // Spawn points positioned in visible corners of arena
        // Map dimensions: 1536x896 pixels
        // Spawn points at 20% and 80% of dimensions for good spacing
        const defaultSpawns = [
            { x: 300, y: 200 },    // Top-left (20% from edges)
            { x: 1200, y: 200 },   // Top-right (80% horizontal)
            { x: 300, y: 650 },    // Bottom-left (75% vertical)
            { x: 1200, y: 650 }    // Bottom-right
        ];

        // TODO: Find spawn points from map entities (entities with 'spawn' component)
        // For now, use calculated positions based on map size

        const spawn = defaultSpawns[playerIndex] || defaultSpawns[0];
        console.log(`[GameVS] Player ${playerIndex} spawn point: (${spawn.x}, ${spawn.y})`);

        return spawn;
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

            // Load pvp_arena_compact.json - optimized 24x14 map for screen size
            await mapLoader.loadMap('../assets/maps/pvp_arena_compact.json');

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
