/**
 * NetworkSyncSystem - Real-time player synchronization
 * Handles position/velocity sync with client-side prediction and server reconciliation
 *
 * Phase 4 Days 18-20
 */

import { System } from '../system.js';

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

        console.log('[NetworkSyncSystem] Initialized');
    }

    update(deltaTime) {
        if (!this.game.mode || this.game.mode !== 'vs') return;
        if (!this.game.networkClient || !this.game.networkClient.connected) return;

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
    }

    /**
     * Send local player state to server
     * @private
     */
    sendLocalPlayerState() {
        const localPlayer = this.getLocalPlayer();
        if (!localPlayer) return;

        const position = localPlayer.getComponent('position');
        const velocity = localPlayer.getComponent('velocity');
        const animation = localPlayer.getComponent('animation');
        const sprite = localPlayer.getComponent('sprite');

        if (!position || !velocity) return;

        const state = {
            playerId: this.game.localPlayerId,
            x: Math.round(position.x * 100) / 100, // Round to 2 decimals
            y: Math.round(position.y * 100) / 100,
            vx: Math.round(velocity.vx * 100) / 100,
            vy: Math.round(velocity.vy * 100) / 100,
            animation: animation ? animation.currentAnimation : 'idle',
            facingRight: sprite ? sprite.facingRight : true,
            timestamp: Date.now()
        };

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
        if (!data.players) return;

        // Update all remote players
        for (const playerState of data.players) {
            if (playerState.playerId === this.game.localPlayerId) {
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
        if (!this.stateBuffer.has(state.playerId)) {
            this.stateBuffer.set(state.playerId, []);
        }

        const buffer = this.stateBuffer.get(state.playerId);
        buffer.push({
            ...state,
            receivedAt: Date.now()
        });

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
            if (!buffer || buffer.length < 2) continue;

            // Interpolate between buffered states
            this.interpolateRemotePlayer(entity, buffer);
        }
    }

    /**
     * Interpolate remote player position
     * @private
     * @param {Entity} entity - Remote player entity
     * @param {Array} buffer - State buffer
     */
    interpolateRemotePlayer(entity, buffer) {
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

        if (!state1 || !state2) return;

        // Calculate interpolation factor
        const timeDiff = state2.timestamp - state1.timestamp;
        const t = timeDiff > 0 ? (renderTime - state1.timestamp) / timeDiff : 1;
        const factor = Math.max(0, Math.min(1, t));

        // Interpolate position
        const position = entity.getComponent('position');
        if (position) {
            position.x = state1.x + (state2.x - state1.x) * factor;
            position.y = state1.y + (state2.y - state1.y) * factor;
        }

        // Update animation and facing direction
        const animation = entity.getComponent('animation');
        const sprite = entity.getComponent('sprite');

        if (animation && state2.animation) {
            if (animation.currentAnimation !== state2.animation) {
                animation.currentAnimation = state2.animation;
            }
        }

        if (sprite && state2.facingRight !== undefined) {
            sprite.facingRight = state2.facingRight;
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
     * @returns {Entity}
     */
    createRemotePlayer(playerData) {
        // Import createRemotePlayer factory (will be created in Days 23-24)
        // For now, create basic entity
        const { Entity } = require('../entities/entity.js');
        const entity = new Entity();

        // Add network component
        entity.addComponent('networkPlayer', {
            playerId: playerData.playerId,
            playerName: playerData.playerName,
            isLocal: false
        });

        // Add position component
        entity.addComponent('position', {
            x: playerData.x || 0,
            y: playerData.y || 0
        });

        // Add velocity component
        entity.addComponent('velocity', {
            vx: 0,
            vy: 0
        });

        // Add to game
        this.game.entities.add(entity);
        this.game.players.set(playerData.playerId, entity);

        console.log(`[NetworkSyncSystem] Created remote player: ${playerData.playerName}`);

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
     * Get network stats
     * @returns {Object}
     */
    getNetworkStats() {
        return {
            latency: this.latency,
            updateRate: this.updateRate,
            interpolationDelay: this.interpolationDelay,
            remotePlayerCount: this.game.players.size - 1
        };
    }
}
