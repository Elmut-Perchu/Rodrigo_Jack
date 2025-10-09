/**
 * GameVS - VS Mode Extension of Base Game
 * Extends game.js for multiplayer battle arena functionality
 *
 * Phase 1 Day 2 - Placeholder
 * Will be fully implemented in Phase 2-4
 */

import { Game } from './game.js';

export class GameVS extends Game {
    constructor(container) {
        super(container);

        // VS Mode specific properties
        this.mode = 'vs';
        this.roomCode = null;
        this.players = new Map(); // Map of player entities by UUID
        this.localPlayerId = null;
        this.isHost = false;

        // Network properties (placeholder)
        this.networkClient = null;
        this.lastNetworkUpdate = 0;
        this.networkUpdateRate = 50; // 20 updates per second

        // Match properties
        this.matchStarted = false;
        this.matchTimer = 0;
        this.matchDuration = 180000; // 3 minutes
        this.playersAlive = 0;

        console.log('[GameVS] VS Mode game instance created');
        console.log('[GameVS] Mode:', this.mode);
    }

    /**
     * Initialize VS mode game
     * @param {string} roomCode - Room identifier
     * @param {boolean} isHost - Whether this player is the host
     */
    async initializeVSMode(roomCode, isHost = false) {
        this.roomCode = roomCode;
        this.isHost = isHost;

        console.log(`[GameVS] Initializing VS mode - Room: ${roomCode}, Host: ${isHost}`);

        // Disable Adventure-specific features
        this.disableAdventureFeatures();

        // Load VS battle map (placeholder - will implement in Phase 4)
        await this.loadVSMap();

        console.log('[GameVS] VS mode initialized');
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

        // Clear level state (not needed in VS)
        this.levelState = null;
        this.globalStats = null;

        console.log('[GameVS] Adventure features disabled');
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

            // Load pvp_arena1.json
            await mapLoader.loadMap('assets/maps/pvp_arena1.json');

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
            this.entities.delete(player);
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
