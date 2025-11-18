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

        // Client send rate matches server tick rate
        this.updateRate = 20; // Match server 20Hz
        this.updateInterval = 1 / this.updateRate; // 0.05s = 50ms
        this.lastUpdate = 0;

        // Client-side prediction
        this.predictionEnabled = true;
        this.reconciliationThreshold = 50; // 50px error threshold for snap correction

        // ========== SIMPLE CLIENT-SIDE PREDICTION ==========
        // Store LAST server state + smooth towards it with velocity extrapolation
        // Simple, works with ANY tick rate, no complex timing issues

        // Last known server state per player
        this.lastServerState = new Map(); // playerId -> {x, y, vx, vy, timestamp}

        // Smoothing factor for corrections (0.2 = gentle, 0.8 = aggressive)
        // ✅ FIX #2 APPLIED: Changed from 0.2 to 0.6 for perfect sync with 20Hz server
        // With 0.6: Reaches ~94% of target position within one server tick (3 frames)
        // This eliminates visible lag and "catch-up" effect
        this.smoothingFactor = 0.6;

        // DIAGNOSTIC MODE: Enhanced logging for audit
        this.diagnosticMode = true; // SET TO FALSE after audit
        this.updateStats = {
            totalUpdates: 0,
            visualUpdates: 0,
            positionUpdates: 0,
            lastLogTime: 0
        };

        // Network stats
        this.lastPingTime = 0;
        this.pingInterval = 1; // Ping every 1 SECOND
        this.latency = 0;

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
        console.error('🔥🔥🔥 [TEST 1] registerHandlers() CALLED');
        console.error('🔥 [TEST 1] this.game exists?', !!this.game);
        console.error('🔥 [TEST 1] this.game.networkClient exists?', !!this.game?.networkClient);
        console.error('🔥 [TEST 1] Stack trace:', new Error().stack);

        // CRITICAL FIX: Check if game is GameVS instance with networkClient property
        const networkClient = this.game?.networkClient;

        if (!this.game || !networkClient) {
            console.error('❌ [NetworkSyncSystem] Cannot register handlers - networkClient does not exist!');
            console.error('❌ [NetworkSyncSystem] this.game exists?', !!this.game);
            console.error('❌ [NetworkSyncSystem] networkClient exists?', !!networkClient);
            return;
        }

        console.error('✅ [TEST 2] networkClient exists, registering handlers...');
        console.error('🔥 [TEST 2] networkClient.on is a function?', typeof networkClient.on === 'function');

        // Game state sync
        console.error('🔥 [TEST 3] Registering game_state_sync handler...');
        networkClient.on('game_state_sync', (data) => {
            console.error('🔥🔥🔥 [TEST 4] game_state_sync HANDLER CALLED WITH DATA:', data);
            try {
                this.handleGameStateSync(data);
            } catch (error) {
                console.error('❌ [TEST 4] ERROR calling handleGameStateSync:', error);
                console.error('❌ [TEST 4] Error stack:', error.stack);
            }
        });
        console.error('🔥 [TEST 3] game_state_sync handler registered');

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

        // Position correction from server (anti-cheat)
        networkClient.on('position_correction', (data) => {
            this.handlePositionCorrection(data);
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
        // 🔍 DEBUG: Log if update is being called
        if (!this._updateCallCount) this._updateCallCount = 0;
        this._updateCallCount++;
        if (this._updateCallCount % 300 === 0) {
            console.warn(`🔍 [UPDATE] NetworkSyncSystem.update() called ${this._updateCallCount} times`);
            console.warn(`🔍 [UPDATE] mode=${this.game.mode}, connected=${this.game.networkClient?.connected}`);
        }

        if (!this.game.mode || this.game.mode !== 'vs') {
            if (this._updateCallCount % 300 === 0) {
                console.error('❌ [UPDATE] Exiting: mode is not "vs"');
            }
            return;
        }

        if (!this.game.networkClient || !this.game.networkClient.connected) {
            if (this._updateCallCount % 300 === 0) {
                console.error('❌ [UPDATE] Exiting: networkClient not connected');
            }
            return;
        }

        this.lastUpdate += deltaTime;

        // Send local player state at update rate
        if (this.lastUpdate >= this.updateInterval) {
            this.sendLocalPlayerState();
            this.lastUpdate = 0;
        }

        // Update remote players with interpolation
        this.updateRemotePlayers();

        // Ping server for latency measurement
        this.updatePing(deltaTime);
    }

    /**
     * Send local player state to server
     * @private
     */
    sendLocalPlayerState() {
        const localPlayer = this.getLocalPlayer();
        if (!localPlayer) {
            if (!this._noLocalPlayerWarned) {
                console.error('🚨 [SEND] No local player found!');
                this._noLocalPlayerWarned = true;
            }
            return;
        }

        const position = localPlayer.getComponent('position');
        const velocity = localPlayer.getComponent('velocity');
        const animation = localPlayer.getComponent('animation');
        const input = localPlayer.getComponent('input');

        if (!position) {
            console.error('🚨 [SEND] Local player has NO position component!');
            return;
        }

        if (!velocity) {
            console.error('🚨 [SEND] Local player has NO velocity component!');
            return;
        }

        // 🔍 CRITICAL DEBUG: Log RAW position values BEFORE rounding
        if (!this._rawPosLogCount) this._rawPosLogCount = 0;
        this._rawPosLogCount++;
        if (this._rawPosLogCount % 60 === 0) {
            console.warn(`🔍 [SEND RAW] position.x=${position.x}, position.y=${position.y}`);
            console.warn(`🔍 [SEND RAW] velocity.vx=${velocity.vx}, velocity.vy=${velocity.vy}`);
            console.warn(`🔍 [SEND RAW] has input: ${!!input}, networkPlayer.isLocal: ${localPlayer.getComponent('networkPlayer')?.isLocal}`);
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
            x: Math.round(position.x * 100) / 100,
            y: Math.round(position.y * 100) / 100,
            vx: Math.round(velocity.vx * 100) / 100,
            vy: Math.round(velocity.vy * 100) / 100,
            animation: networkAnimation,
            facingRight: animation ? !animation.isFlipped : true,
            timestamp: Date.now()
        };

        // 🔍 DEBUG: Log what we're sending EVERY TIME to debug stuck position
        console.error(`🚀 [SEND LOCAL] Sending x=${state.x}, y=${state.y}, vx=${state.vx}, vy=${state.vy}`);

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
     * SIMPLE: Just store the latest state
     * @param {Object} data - Game state data
     */
    handleGameStateSync(data) {
        console.error('🔥🔥🔥 [TEST 5] handleGameStateSync CALLED');
        console.error('🔥 [TEST 5] data:', data);
        console.error('🔥 [TEST 5] data.players:', data?.players);

        if (!data.players) {
            console.error('❌ [TEST 5] NO PLAYERS IN DATA');
            return;
        }

        // 🔍 DEBUG: Log FIRST player state to see actual server values
        if (data.players.length > 0) {
            const firstPlayer = data.players[0];
            console.warn('🔍 [DEBUG] First player in game_state_sync:', {
                playerId: firstPlayer.playerId,
                x: firstPlayer.x,
                y: firstPlayer.y,
                vx: firstPlayer.vx,
                vy: firstPlayer.vy,
                timestamp: data.timestamp
            });
        }

        const now = Date.now();

        // Store latest server state for each remote player
        for (const playerState of data.players) {
            console.error('🔥 [TEST 5] Processing player:', playerState.playerId, 'local?', playerState.playerId === this.game.localPlayerId);

            if (playerState.playerId !== this.game.localPlayerId) {
                // Remote player - store latest state
                this.lastServerState.set(playerState.playerId, {
                    ...playerState,
                    timestamp: now
                });
                console.error('✅ [TEST 5] Stored state for remote player:', playerState.playerId);
            }
        }
    }


    /**
     * Update remote players with simple smooth movement
     * @private
     */
    updateRemotePlayers() {
        // Log once every 60 frames
        if (!this._updateLogCount) this._updateLogCount = 0;
        this._updateLogCount++;

        if (this._updateLogCount % 60 === 0) {
            console.error('🔥 [TEST 6] updateRemotePlayers called, entities:', this.game.entities.size);
            console.error('🔥 [TEST 6] lastServerState size:', this.lastServerState.size);
            console.error('🔥 [TEST 6] lastServerState keys:', Array.from(this.lastServerState.keys()));
        }

        for (const entity of this.game.entities) {
            const networkPlayer = entity.getComponent('networkPlayer');
            if (!networkPlayer || networkPlayer.isLocal) continue;

            if (this._updateLogCount % 60 === 0) {
                console.error('🔥 [TEST 6] Found remote player entity, playerId:', networkPlayer.playerId);
            }

            const serverState = this.lastServerState.get(networkPlayer.playerId);
            if (!serverState) {
                if (this._updateLogCount % 60 === 0) {
                    console.error('❌ [TEST 6] No server state for player:', networkPlayer.playerId);
                    console.error('❌ [TEST 6] Available states:', Array.from(this.lastServerState.keys()));
                }
                continue;
            }

            if (this._updateLogCount % 60 === 0) {
                console.error('✅ [TEST 6] Found matching state for player:', networkPlayer.playerId);
            }

            this.updateRemotePlayer(entity, serverState);
        }
    }

    /**
     * Update remote player with simple smooth movement
     * SIMPLE APPROACH: Smooth towards server position using lerp
     *
     * @private
     * @param {Entity} entity - Remote player entity
     * @param {Object} serverState - Latest server state {x, y, vx, vy, timestamp}
     */
    updateRemotePlayer(entity, serverState) {
        console.error('🔥🔥🔥 [TEST 7] updateRemotePlayer CALLED! entity:', entity?.uuid, 'serverState:', serverState);

        const position = entity.getComponent('position');
        console.error('🔥 [TEST 7] position component:', !!position, position);

        const visual = entity.getComponent('visual');
        console.error('🔥 [TEST 7] visual component:', !!visual, visual);

        const networkPlayer = entity.getComponent('networkPlayer');
        console.error('🔥 [TEST 7] networkPlayer component:', !!networkPlayer, networkPlayer);

        if (!position) {
            console.error('❌ [updateRemotePlayer] No position component');
            return;
        }

        // Track stats
        this.updateStats.totalUpdates++;
        const now = performance.now();

        // DIAGNOSTIC: Calculate delta and distance
        const deltaX = serverState.x - position.x;
        const deltaY = serverState.y - position.y;
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

        // Log detailed info every 60 frames (~1 second at 60fps)
        if (!this._updatePlayerLogCount) this._updatePlayerLogCount = 0;
        this._updatePlayerLogCount++;

        if (this.diagnosticMode && this._updatePlayerLogCount % 60 === 0) {
            const playerName = networkPlayer?.playerName || 'Unknown';
            console.log(`
╔════════════════════════════════════════════════════════════
║ 🔍 [AUDIT] Remote Player Update - ${playerName}
╠════════════════════════════════════════════════════════════
║ BEFORE Position: (${position.x.toFixed(1)}, ${position.y.toFixed(1)})
║ SERVER Position: (${serverState.x.toFixed(1)}, ${serverState.y.toFixed(1)})
║ Delta: (${deltaX.toFixed(1)}, ${deltaY.toFixed(1)}) = ${distance.toFixed(1)}px
║ Smoothing Factor: ${this.smoothingFactor}
║ Will Move: (${(deltaX * this.smoothingFactor).toFixed(1)}, ${(deltaY * this.smoothingFactor).toFixed(1)})
╚════════════════════════════════════════════════════════════`);
        }

        // Simple linear interpolation towards server position
        // This creates smooth movement without complex prediction
        const oldX = position.x;
        const oldY = position.y;

        console.error(`📍 [UPDATE] BEFORE: position=(${oldX}, ${oldY}), server=(${serverState.x}, ${serverState.y}), delta=(${deltaX}, ${deltaY})`);

        position.x += deltaX * this.smoothingFactor;
        position.y += deltaY * this.smoothingFactor;
        this.updateStats.positionUpdates++;

        console.error(`📍 [UPDATE] AFTER: position=(${position.x}, ${position.y}), moved=(${position.x - oldX}, ${position.y - oldY})`);

        // 🔄 ROLLBACK: Restore visual.div update (removing it broke the system)
        // Issue: Gravity/Movement systems fight with network position
        // Without direct visual update, remote players vibrate and don't sync
        if (visual && visual.div) {
            visual.div.style.left = `${position.x}px`;
            visual.div.style.top = `${position.y}px`;
            this.updateStats.visualUpdates++;

            if (this.diagnosticMode && this._updatePlayerLogCount % 60 === 0) {
                console.log(`║ 🔄 [ROLLBACK] NetworkSync updating visual.div directly
║ Position: (${position.x.toFixed(1)}, ${position.y.toFixed(1)})
║ This is needed to bypass Gravity/Movement systems on remote players
╚════════════════════════════════════════════════════════════`);
            }
        }

        // Log stats every 5 seconds
        if (this.diagnosticMode && (now - this.updateStats.lastLogTime) > 5000) {
            console.log(`
📊 [AUDIT STATS] 5-second summary:
   - Total updates: ${this.updateStats.totalUpdates}
   - Position updates: ${this.updateStats.positionUpdates}
   - Visual updates: ${this.updateStats.visualUpdates}
   - Update rate: ${(this.updateStats.totalUpdates / 5).toFixed(1)} Hz`);

            this.updateStats.totalUpdates = 0;
            this.updateStats.positionUpdates = 0;
            this.updateStats.visualUpdates = 0;
            this.updateStats.lastLogTime = now;
        }

        // Update animation
        this.updateAnimation(entity, serverState);
    }

    /**
     * Update remote player animation
     * @private
     * @param {Entity} entity - Remote player entity
     * @param {Object} serverState - Server state with animation data
     */
    updateAnimation(entity, serverState) {
        const animation = entity.getComponent('animation');
        if (!animation || !serverState.animation) return;

        // Map network animation to PlayerAnimation state
        const networkToStateMap = {
            'idle': 'idle',
            'walk': 'run',
            'jump': 'jump',
            'attack': 'attack1',
            'shoot': 'arrowShoot',
            'cast': 'magicAttack',
            'death': 'death'
        };
        const newState = networkToStateMap[serverState.animation] || 'idle';

        if (animation.currentState !== newState) {
            animation.setState(newState);
        }

        // Update facing direction
        animation.isFlipped = !serverState.facingRight;
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
        // Latency measurement for debugging/stats only
    }

    /**
     * Handle position correction from server (anti-cheat)
     * Server detected invalid movement and is forcing correct position
     * @param {Object} data - Correction data {x, y, vx, vy}
     */
    handlePositionCorrection(data) {
        console.warn('🚨 [NetworkSync] Position correction received from server!', data);

        const localPlayer = this.getLocalPlayer();
        if (!localPlayer) return;

        const position = localPlayer.getComponent('position');
        const velocity = localPlayer.getComponent('velocity');

        if (!position || !velocity) return;

        // CRITICAL: Server authority - override local position immediately
        position.x = data.x;
        position.y = data.y;
        velocity.vx = data.vx;
        velocity.vy = data.vy;

        console.warn(`🚨 [NetworkSync] Position corrected to (${data.x.toFixed(1)}, ${data.y.toFixed(1)})`);
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
            this.lastServerState.delete(playerId); // Clean up state

            console.log(`[NetworkSyncSystem] Removed remote player: ${playerId}`);
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
            smoothingFactor: this.smoothingFactor,
            remotePlayerCount: this.game.players.size - 1
        };
    }
}
