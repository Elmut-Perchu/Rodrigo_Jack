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
        this.updateInterval = 1 / this.updateRate; // CRITICAL FIX: Keep in SECONDS (0.01666s) to match deltaTime units!
        this.lastUpdate = 0;

        // Client-side prediction
        this.predictionEnabled = true;
        this.reconciliationThreshold = 50; // 50px error threshold for snap correction

        // Remote player interpolation
        this.interpolationDelay = 100; // 100ms delay for smooth interpolation
        this.stateBuffer = new Map(); // playerId -> [state history]

        // Network stats
        this.lastPingTime = 0;
        this.pingInterval = 1; // FIXED: Ping every 1 SECOND (not 1000 ms, we use seconds)
        this.latency = 0;

        // Buffer cleanup
        this.lastBufferCleanup = 0;
        this.bufferCleanupInterval = 5; // FIXED: Cleanup every 5 SECONDS (not 5000 ms)
        this.staleBufferThreshold = 30; // FIXED: 30 SECONDS without updates = stale (not 30000 ms)

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
        console.log('🔍 [NetworkSyncSystem] registerHandlers() called');
        console.log('🔍 [NetworkSyncSystem] this.game:', !!this.game);
        console.log('🔍 [NetworkSyncSystem] this.game.networkClient:', !!this.game?.networkClient);

        // CRITICAL FIX: Check if game is GameVS instance with networkClient property
        const networkClient = this.game?.networkClient;

        if (!this.game || !networkClient) {
            console.error('❌ [NetworkSyncSystem] Cannot register handlers - networkClient does not exist!');
            console.error('❌ [NetworkSyncSystem] this.game exists?', !!this.game);
            console.error('❌ [NetworkSyncSystem] networkClient exists?', !!networkClient);
            return;
        }

        console.log('✅ [NetworkSyncSystem] networkClient exists, registering handlers...');

        // Game state sync
        networkClient.on('game_state_sync', (data) => {
            this.handleGameStateSync(data);
        });

        // Pong for latency measurement
        networkClient.on('pong', (data) => {
            this.handlePong(data);
        });

        // Combat events (delegated to CombatSyncSystem)
        networkClient.on('player_attack', (data) => {
            const combatSystem = this.getCombatSystem();
            if (combatSystem) combatSystem.handlePlayerAttack(data);
        });

        networkClient.on('player_hit', (data) => {
            const combatSystem = this.getCombatSystem();
            if (combatSystem) combatSystem.handlePlayerHit(data);
        });

        networkClient.on('player_death', (data) => {
            const combatSystem = this.getCombatSystem();
            if (combatSystem) combatSystem.handlePlayerDeath(data);
        });

        networkClient.on('match_end', (data) => {
            const combatSystem = this.getCombatSystem();
            if (combatSystem) combatSystem.handleMatchEnd(data);
        });

        networkClient.on('player_respawn', (data) => {
            const combatSystem = this.getCombatSystem();
            if (combatSystem) combatSystem.handlePlayerRespawn(data);
        });

        console.log('[NetworkSyncSystem] Message handlers registered');

        // Mark as registered to prevent duplicate registration
        this.handlersRegistered = true;

        // Mark handlers as ready to process queued messages
        networkClient.markHandlersReady();
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

        // DEBUG: Log deltaTime every 60 frames
        this.debugDeltaCount = (this.debugDeltaCount || 0) + 1;
        if (this.debugDeltaCount % 60 === 0) {
            console.log('[NetworkSync] deltaTime:', deltaTime, 'lastUpdate:', this.lastUpdate, 'interval:', this.updateInterval);
        }

        // Send local player state at update rate
        if (this.lastUpdate >= this.updateInterval) {
            console.log('[NetworkSync] Time to send state! lastUpdate:', this.lastUpdate, 'interval:', this.updateInterval);
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
        console.log('[NetworkSync] sendLocalPlayerState() called');
        const localPlayer = this.getLocalPlayer();
        if (!localPlayer) {
            console.warn('[NetworkSync] No local player found - cannot send state');
            return;
        }
        console.log('[NetworkSync] Local player found:', localPlayer);

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
            console.log(`[NetworkSync] Player ${playerState.playerId.substring(0, 8)}: ${isLocal ? 'LOCAL' : 'REMOTE'} at (${playerState.x}, ${playerState.y})`);

            if (isLocal) {
                // Server reconciliation for local player
                this.reconcileLocalPlayer(playerState);
            } else {
                // Buffer state for remote player interpolation
                console.log(`[NetworkSync] Buffering remote player ${playerState.playerId.substring(0, 8)} state`);
                this.bufferRemotePlayerState(playerState);
            }
        }
    }

    /**
     * Server reconciliation for local player
     * DISABLED: Client has full authority over local player movement
     * Only log errors for debugging, don't snap position
     * @private
     * @param {Object} serverState - Server's view of local player
     */
    reconcileLocalPlayer(serverState) {
        // CRITICAL FIX: Do NOT reconcile local player position!
        // This causes the "tug of war" effect where server constantly snaps player back
        // In a fast-paced platformer, client must have full control of local movement

        if (!this.predictionEnabled) return;

        const localPlayer = this.getLocalPlayer();
        if (!localPlayer) return;

        const position = localPlayer.getComponent('position');
        if (!position) return;

        // Calculate position error (for debugging only)
        const dx = serverState.x - position.x;
        const dy = serverState.y - position.y;
        const error = Math.sqrt(dx * dx + dy * dy);

        // Log large errors for debugging (but don't snap!)
        if (error > 100) {
            console.warn(`[NetworkSync] Large position error: ${error.toFixed(2)}px (client vs server)`);
        }

        // ❌ DO NOT SNAP LOCAL PLAYER POSITION
        // The client has full authority over its own player
        // Only remote players are interpolated from server state
    }

    /**
     * Buffer remote player state for interpolation
     * @private
     * @param {Object} state - Remote player state
     */
    bufferRemotePlayerState(state) {
        console.log('[NetworkSync] bufferRemotePlayerState for:', state.playerId, 'pos:', state.x, state.y, 'timestamp:', state.timestamp);

        if (!this.stateBuffer.has(state.playerId)) {
            console.log('[NetworkSync] Creating new buffer for player:', state.playerId);
            this.stateBuffer.set(state.playerId, []);
        }

        const buffer = this.stateBuffer.get(state.playerId);

        // CRITICAL FIX: Server sends timestamp in milliseconds but we need it for interpolation
        const stateWithTimestamp = {
            ...state,
            timestamp: state.timestamp || Date.now(), // Use server timestamp if available
            receivedAt: Date.now()
        };

        buffer.push(stateWithTimestamp);

        console.log('[NetworkSync] Buffer size for', state.playerId, ':', buffer.length, 'timestamp:', stateWithTimestamp.timestamp);

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
        for (const entity of this.game.entities) {
            const networkPlayer = entity.getComponent('networkPlayer');
            if (!networkPlayer || networkPlayer.isLocal) continue;

            const buffer = this.stateBuffer.get(networkPlayer.playerId);

            // CRITICAL FIX: With alpha-based interpolation, we don't need 2 states!
            // The interpolation runs continuously between previousX/Y and targetX/Y
            // We only need buffer states when alpha reaches 1.0 to advance to next target
            if (!buffer) {
                continue;
            }

            // Interpolate (will continue smoothly even with empty buffer until new states arrive)
            this.interpolateRemotePlayer(entity, buffer);
        }
    }

    /**
     * Interpolate remote player position
     * REWRITTEN: Use alpha-based progressive interpolation instead of timestamp-based
     * This prevents teleportation artifacts
     * @private
     * @param {Entity} entity - Remote player entity
     * @param {Array} buffer - State buffer
     */
    interpolateRemotePlayer(entity, buffer) {
        const networkPlayer = entity.getComponent('networkPlayer');
        const interpolation = entity.getComponent('interpolation');
        const position = entity.getComponent('position');

        if (!interpolation || !position) {
            console.warn('[NetworkSync] Missing interpolation or position component for', networkPlayer.playerId);
            return;
        }

        // CRITICAL FIX: Initialize interpolation target on first update
        // Without this, the player appears frozen for one interpolation cycle (~0.17s)
        if (interpolation.alpha === 0 && interpolation.previousX === interpolation.targetX && interpolation.previousY === interpolation.targetY) {
            // First interpolation - initialize with first buffered state
            const firstState = buffer.shift();
            if (firstState) {
                interpolation.targetX = firstState.x;
                interpolation.targetY = firstState.y;
                console.log(`[NetworkSync] ${networkPlayer.playerId.substring(0,8)}: INITIAL target set to (${firstState.x.toFixed(1)}, ${firstState.y.toFixed(1)})`);
            }
        }

        // Check if we need to advance to next state (alpha >= 1.0)
        if (interpolation.alpha >= 1.0) {
            // Pop oldest state from buffer and set new target
            const newTarget = buffer.shift(); // Get first state from buffer

            if (!newTarget) {
                // No new states available, stay at current position
                return;
            }

            // Current target becomes new previous
            interpolation.previousX = interpolation.targetX;
            interpolation.previousY = interpolation.targetY;

            // New buffer state becomes new target
            interpolation.targetX = newTarget.x;
            interpolation.targetY = newTarget.y;

            // Reset alpha to start new interpolation
            interpolation.alpha = 0;

            console.log(`[NetworkSync] ${networkPlayer.playerId.substring(0,8)}: New target (${newTarget.x.toFixed(1)}, ${newTarget.y.toFixed(1)})`);
        }

        // Calculate interpolation speed based on distance
        // Server broadcasts at 20Hz (50ms), we render at 60fps (16.67ms)
        // We want to complete interpolation in ~50ms = ~3 frames
        // So alpha should increase by 1/3 per frame (0.33 per frame)
        const interpolationSpeed = 6.0; // Higher = faster interpolation (reach target in ~0.17s)

        // Increase alpha based on deltaTime
        const deltaTime = this.game.deltaTime || 0.016; // Fallback to 60fps if undefined
        interpolation.alpha += deltaTime * interpolationSpeed;
        interpolation.alpha = Math.min(1.0, interpolation.alpha); // Clamp to 1.0

        // Smooth interpolation using easing function (ease-out for snappy movement)
        const easedAlpha = this.easeOutCubic(interpolation.alpha);

        // Interpolate position
        const oldX = position.x;
        const oldY = position.y;
        position.x = interpolation.previousX + (interpolation.targetX - interpolation.previousX) * easedAlpha;
        position.y = interpolation.previousY + (interpolation.targetY - interpolation.previousY) * easedAlpha;

        // 🔥 DEBUG: Log EVERY interpolation to see if it's working
        console.log(`🎯 [INTERPOLATION] ${networkPlayer.playerId.substring(0,8)}: α=${interpolation.alpha.toFixed(2)} | prev=(${interpolation.previousX.toFixed(1)},${interpolation.previousY.toFixed(1)}) → target=(${interpolation.targetX.toFixed(1)},${interpolation.targetY.toFixed(1)}) | OLD=(${oldX.toFixed(1)},${oldY.toFixed(1)}) → NEW=(${position.x.toFixed(1)},${position.y.toFixed(1)})`);

        // Verify position actually changed
        if (oldX === position.x && oldY === position.y) {
            console.warn(`⚠️ [INTERPOLATION] Position NOT CHANGED! prev=target=${interpolation.previousX.toFixed(1)},${interpolation.previousY.toFixed(1)}`);
        }
    }

    /**
     * Ease-out cubic easing function for smooth interpolation
     * @private
     */
    easeOutCubic(t) {
        return 1 - Math.pow(1 - t, 3);
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
