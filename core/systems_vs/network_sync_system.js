/**
 * NetworkSyncSystem - Real-time player synchronization
 * Handles position/velocity sync with client-side prediction and server reconciliation
 *
 * Phase 4 Days 18-20
 */

import { System } from '../systems/system.js';

export class NetworkSyncSystem extends System {
    constructor(game) {
        super(game);

        this.updateRate = 60; // 60fps sync
        this.updateInterval = 1000 / this.updateRate;
        this.lastUpdate = 0;

        // Client-side prediction
        this.predictionEnabled = true;
        this.reconciliationThreshold = 50; // 50px error threshold for snap correction

        // Remote player interpolation
        this.interpolationDelay = 100; // 100ms delay for smooth interpolation
        this.stateBuffer = new Map(); // playerId -> [state history]

        // Network stats
        this.lastPingTime = 0;
        this.pingInterval = 1000; // Ping every second
        this.latency = 0;

        // Buffer cleanup
        this.lastBufferCleanup = 0;
        this.bufferCleanupInterval = 5000; // Cleanup every 5 seconds
        this.staleBufferThreshold = 30000; // 30 seconds without updates = stale

        // Handlers will be registered in setGame() after game reference is set
        this.handlersRegistered = false;

        console.log('[NetworkSyncSystem] Initialized');
    }

    /**
     * Override setGame to register handlers after game is set
     * @param {Game} game - Game instance
     */
    setGame(game) {
        console.log('🚀 [NetworkSyncSystem] setGame called!');
        super.setGame(game);

        // DON'T register handlers here - they will be registered after WebSocket connection
        // See game_vs.js connectToServer() which calls registerHandlers() explicitly
        console.log('⏳ [NetworkSyncSystem] Waiting for WebSocket connection to register handlers...');
    }

    /**
     * Register WebSocket message handlers
     * @private
     */
    registerHandlers() {
        if (!this.game.networkClient) {
            console.warn('❌ [NetworkSyncSystem] registerHandlers called but networkClient does not exist yet!');
            return;
        }

        console.log('✅ [NetworkSyncSystem] networkClient exists, registering handlers...');

        // Game state sync
        this.game.networkClient.on('game_state_sync', (data) => {
            this.handleGameStateSync(data);
        });

        // Pong for latency measurement
        this.game.networkClient.on('pong', (data) => {
            this.handlePong(data);
        });

        // Combat events (delegated to CombatSyncSystem)
        this.game.networkClient.on('player_attack', (data) => {
            const combatSystem = this.getCombatSystem();
            if (combatSystem) combatSystem.handlePlayerAttack(data);
        });

        this.game.networkClient.on('player_hit', (data) => {
            const combatSystem = this.getCombatSystem();
            if (combatSystem) combatSystem.handlePlayerHit(data);
        });

        this.game.networkClient.on('player_death', (data) => {
            const combatSystem = this.getCombatSystem();
            if (combatSystem) combatSystem.handlePlayerDeath(data);
        });

        this.game.networkClient.on('match_end', (data) => {
            const combatSystem = this.getCombatSystem();
            if (combatSystem) combatSystem.handleMatchEnd(data);
        });

        this.game.networkClient.on('player_respawn', (data) => {
            const combatSystem = this.getCombatSystem();
            if (combatSystem) combatSystem.handlePlayerRespawn(data);
        });

        console.log('[NetworkSyncSystem] Message handlers registered');

        // Mark as registered to prevent duplicate registration
        this.handlersRegistered = true;

        // Mark handlers as ready to process queued messages
        this.game.networkClient.markHandlersReady();
        console.log('✅ [NetworkSyncSystem] Handlers ready, queued messages will be processed');
    }

    /**
     * Get CombatSyncSystem instance
     * @private
     * @returns {CombatSyncSystem|null}
     */
    getCombatSystem() {
        for (const system of this.game.systems) {
            if (system.constructor.name === 'CombatSyncSystem') {
                return system;
            }
        }
        return null;
    }

    update(deltaTime) {
        // DEBUG: Log every 60 frames (1 second at 60fps)
        this.debugFrameCount = (this.debugFrameCount || 0) + 1;
        if (this.debugFrameCount % 60 === 0) {
            console.log('[NetworkSync] Update called - mode:', this.game.mode, 'connected:', this.game.networkClient?.connected);
        }

        if (!this.game.mode || this.game.mode !== 'vs') {
            console.warn('[NetworkSync] Skipping - mode:', this.game.mode);
            return;
        }
        if (!this.game.networkClient || !this.game.networkClient.connected) {
            console.warn('[NetworkSync] Skipping - client:', !!this.game.networkClient, 'connected:', this.game.networkClient?.connected);
            return;
        }

        this.lastUpdate += deltaTime;

        // Send local player state at update rate
        if (this.lastUpdate >= this.updateInterval) {
            this.sendLocalPlayerState();
            this.lastUpdate = 0;
        }

        // Update remote players with interpolation
        this.updateRemotePlayers(deltaTime);

        // Ping server for latency measurement
        this.updatePing(deltaTime);

        // Cleanup stale buffers periodically
        this.lastBufferCleanup += deltaTime;
        if (this.lastBufferCleanup >= this.bufferCleanupInterval) {
            this.cleanupStaleBuffers();
            this.lastBufferCleanup = 0;
        }
    }

    /**
     * Send local player state to server
     * @private
     */
    sendLocalPlayerState() {
        const localPlayer = this.getLocalPlayer();
        if (!localPlayer) {
            console.warn('[NetworkSync] No local player found - cannot send state');
            return;
        }

        const position = localPlayer.getComponent('position');
        const velocity = localPlayer.getComponent('velocity');
        const animation = localPlayer.getComponent('animation');

        if (!position || !velocity) {
            console.warn('[NetworkSync] Missing position or velocity component');
            return;
        }

        // Map PlayerAnimation state back to network animation names
        let networkAnimation = 'idle';
        if (animation && animation.currentState) {
            const stateToNetworkMap = {
                'idle': 'idle',
                'run': 'walk',
                'jump': 'jump',
                'attack1': 'attack',
                'arrowShoot': 'shoot',
                'magicAttack': 'cast',
                'death': 'death'
            };
            networkAnimation = stateToNetworkMap[animation.currentState] || 'idle';
        }

        const state = {
            playerId: this.game.localPlayerId,
            x: Math.round(position.x * 100) / 100, // Round to 2 decimals
            y: Math.round(position.y * 100) / 100,
            vx: Math.round(velocity.vx * 100) / 100,
            vy: Math.round(velocity.vy * 100) / 100,
            animation: networkAnimation,
            facingRight: animation ? !animation.isFlipped : true,
            timestamp: Date.now()
        };

        console.log('[NetworkSync] Sending player_state:', state);
        this.game.networkClient.send('player_state', state);
    }

    /**
     * Get local player entity
     * @private
     * @returns {Entity|null}
     */
    getLocalPlayer() {
        for (const entity of this.game.entities) {
            const networkPlayer = entity.getComponent('networkPlayer');
            if (networkPlayer && networkPlayer.playerId === this.game.localPlayerId) {
                return entity;
            }
        }
        return null;
    }

    /**
     * Handle game state sync from server
     * @param {Object} data - Game state data
     */
    handleGameStateSync(data) {
        console.log('🔥🔥🔥 [NetworkSync] handleGameStateSync CALLED! Players:', data?.players?.length);

        if (!data.players) {
            console.warn('[NetworkSync] No players in game_state_sync');
            return;
        }

        console.log('[NetworkSync] Processing', data.players.length, 'player states');

        // Update all remote players
        for (const playerState of data.players) {
            const isLocal = playerState.playerId === this.game.localPlayerId;
            console.log(`[NetworkSync] Player ${playerState.playerId.substring(0, 8)}: ${isLocal ? 'LOCAL (reconcile)' : 'REMOTE (buffer)'}`);

            if (isLocal) {
                // Server reconciliation for local player
                this.reconcileLocalPlayer(playerState);
            } else {
                // Buffer state for remote player interpolation
                this.bufferRemotePlayerState(playerState);
            }
        }
    }

    /**
     * Server reconciliation for local player
     * Snap position if error exceeds threshold
     * @private
     * @param {Object} serverState - Server's view of local player
     */
    reconcileLocalPlayer(serverState) {
        if (!this.predictionEnabled) return;

        const localPlayer = this.getLocalPlayer();
        if (!localPlayer) return;

        const position = localPlayer.getComponent('position');
        if (!position) return;

        // Calculate position error
        const dx = serverState.x - position.x;
        const dy = serverState.y - position.y;
        const error = Math.sqrt(dx * dx + dy * dy);

        // Snap if error exceeds threshold
        if (error > this.reconciliationThreshold) {
            console.log(`[NetworkSyncSystem] Reconciliation snap: error=${error.toFixed(2)}px`);
            position.x = serverState.x;
            position.y = serverState.y;
        }
    }

    /**
     * Buffer remote player state for interpolation
     * @private
     * @param {Object} state - Remote player state
     */
    bufferRemotePlayerState(state) {
        console.log('[NetworkSync] bufferRemotePlayerState for:', state.playerId, 'pos:', state.x, state.y);

        if (!this.stateBuffer.has(state.playerId)) {
            console.log('[NetworkSync] Creating new buffer for player:', state.playerId);
            this.stateBuffer.set(state.playerId, []);
        }

        const buffer = this.stateBuffer.get(state.playerId);
        buffer.push({
            ...state,
            receivedAt: Date.now()
        });

        console.log('[NetworkSync] Buffer size for', state.playerId, ':', buffer.length);

        // Keep buffer size limited (last 10 states)
        if (buffer.length > 10) {
            buffer.shift();
        }
    }

    /**
     * Update remote players with interpolation
     * @private
     * @param {number} deltaTime - Time since last frame
     */
    updateRemotePlayers(deltaTime) {
        let remotePlayerCount = 0;
        let interpolatedCount = 0;

        for (const entity of this.game.entities) {
            const networkPlayer = entity.getComponent('networkPlayer');
            if (!networkPlayer || networkPlayer.isLocal) continue;

            remotePlayerCount++;

            const buffer = this.stateBuffer.get(networkPlayer.playerId);
            if (!buffer || buffer.length < 2) {
                console.warn('[NetworkSync] Remote player', networkPlayer.playerId, 'has insufficient buffer:', buffer?.length || 0);
                continue;
            }

            // Interpolate between buffered states
            this.interpolateRemotePlayer(entity, buffer);
            interpolatedCount++;
        }

        if (remotePlayerCount > 0) {
            console.log('[NetworkSync] updateRemotePlayers:', interpolatedCount, '/', remotePlayerCount, 'players interpolated');
        }
    }

    /**
     * Interpolate remote player position
     * @private
     * @param {Entity} entity - Remote player entity
     * @param {Array} buffer - State buffer
     */
    interpolateRemotePlayer(entity, buffer) {
        const networkPlayer = entity.getComponent('networkPlayer');
        const now = Date.now();
        const renderTime = now - this.interpolationDelay;

        // Find two states to interpolate between
        let state1 = null;
        let state2 = null;

        for (let i = 0; i < buffer.length - 1; i++) {
            if (buffer[i].timestamp <= renderTime && buffer[i + 1].timestamp >= renderTime) {
                state1 = buffer[i];
                state2 = buffer[i + 1];
                break;
            }
        }

        // If no states found, use latest state
        if (!state1 || !state2) {
            state1 = buffer[buffer.length - 2];
            state2 = buffer[buffer.length - 1];
        }

        if (!state1 || !state2) {
            console.warn('[NetworkSync] No valid states to interpolate for', networkPlayer.playerId);
            return;
        }

        // Calculate interpolation factor
        const timeDiff = state2.timestamp - state1.timestamp;
        const t = timeDiff > 0 ? (renderTime - state1.timestamp) / timeDiff : 1;
        const factor = Math.max(0, Math.min(1, t));

        // Interpolate position
        const position = entity.getComponent('position');
        if (position) {
            const oldX = position.x;
            const oldY = position.y;
            position.x = state1.x + (state2.x - state1.x) * factor;
            position.y = state1.y + (state2.y - state1.y) * factor;

            console.log('[NetworkSync] Interpolated', networkPlayer.playerId, 'from', oldX.toFixed(1), oldY.toFixed(1), 'to', position.x.toFixed(1), position.y.toFixed(1));
        }

        // Update animation and facing direction
        const animation = entity.getComponent('animation');

        if (animation && state2.animation) {
            // PlayerAnimation uses currentState property, not currentAnimation
            if (animation.currentState !== state2.animation) {
                animation.setState(state2.animation);
            }

            // PlayerAnimation uses isFlipped property for facing direction
            if (state2.facingRight !== undefined) {
                animation.isFlipped = !state2.facingRight;
            }
        }
    }

    /**
     * Update ping measurement
     * @private
     * @param {number} deltaTime - Time since last frame
     */
    updatePing(deltaTime) {
        this.lastPingTime += deltaTime;

        if (this.lastPingTime >= this.pingInterval) {
            const pingData = {
                timestamp: Date.now()
            };

            this.game.networkClient.send('ping', pingData);
            this.lastPingTime = 0;
        }
    }

    /**
     * Handle pong response from server
     * @param {Object} data - Pong data with original timestamp
     */
    handlePong(data) {
        const now = Date.now();
        this.latency = now - data.timestamp;

        // Adjust interpolation delay based on latency
        if (this.latency > 100) {
            this.interpolationDelay = Math.min(this.latency * 1.5, 300);
        }
    }

    /**
     * Create remote player entity
     * @param {Object} playerData - Player data from server
     * @param {number} playerIndex - Player index for color assignment
     * @returns {Entity}
     */
    async createRemotePlayer(playerData, playerIndex = 0) {
        // Import createRemotePlayer factory
        const { createRemotePlayer } = await import('../../create/remote_player_create.js');

        // Create entity with factory
        const entity = createRemotePlayer(playerData, playerIndex);

        // Add to game
        this.game.entities.add(entity);
        this.game.players.set(playerData.playerId, entity);

        console.log(`[NetworkSyncSystem] Created remote player: ${playerData.playerName} (index: ${playerIndex})`);

        return entity;
    }

    /**
     * Remove remote player
     * @param {string} playerId - Player ID
     */
    removeRemotePlayer(playerId) {
        const entity = this.game.players.get(playerId);
        if (entity) {
            this.game.entities.delete(entity);
            this.game.players.delete(playerId);
            this.stateBuffer.delete(playerId);

            console.log(`[NetworkSyncSystem] Removed remote player: ${playerId}`);
        }
    }

    /**
     * Cleanup stale state buffers for disconnected players
     * @private
     */
    cleanupStaleBuffers() {
        const now = Date.now();
        let cleanedCount = 0;

        for (const [playerId, buffer] of this.stateBuffer.entries()) {
            if (buffer.length === 0) {
                // Empty buffer, remove it
                this.stateBuffer.delete(playerId);
                cleanedCount++;
                continue;
            }

            // Check last update time
            const lastState = buffer[buffer.length - 1];
            const timeSinceLastUpdate = now - (lastState.receivedAt || 0);

            if (timeSinceLastUpdate > this.staleBufferThreshold) {
                // Buffer is stale (player likely disconnected)
                this.stateBuffer.delete(playerId);
                cleanedCount++;
                console.log(`[NetworkSyncSystem] Cleaned stale buffer for player ${playerId} (last update: ${(timeSinceLastUpdate / 1000).toFixed(1)}s ago)`);
            }
        }

        if (cleanedCount > 0) {
            console.log(`[NetworkSyncSystem] Cleaned ${cleanedCount} stale buffer(s)`);
        }
    }

    /**
     * Get network stats
     * @returns {Object}
     */
    getNetworkStats() {
        return {
            latency: this.latency,
            updateRate: this.updateRate,
            interpolationDelay: this.interpolationDelay,
            remotePlayerCount: this.game.players.size - 1,
            activeBuffers: this.stateBuffer.size
        };
    }
}
