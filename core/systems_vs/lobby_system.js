/**
 * Lobby System for VS Mode
 * Manages lobby state, player connections, and chat
 *
 * Phase 1 Day 2 - Placeholder
 * Will be implemented in Phase 2
 */

export class LobbySystem {
    constructor() {
        this.roomCode = null;
        this.players = [];
        this.maxPlayers = 4;
        this.isHost = false;
        this.chatMessages = [];
    }

    /**
     * Initialize lobby with room code
     * @param {string} roomCode - 4-character room identifier
     */
    initialize(roomCode) {
        this.roomCode = roomCode;
        console.log('[LobbySystem] Initialized with room code:', roomCode);
    }

    /**
     * Add player to lobby
     * @param {Object} player - Player data {id, name, isReady}
     */
    addPlayer(player) {
        if (this.players.length < this.maxPlayers) {
            this.players.push(player);
            console.log('[LobbySystem] Player added:', player.name);
            return true;
        }
        return false;
    }

    /**
     * Remove player from lobby
     * @param {string} playerId - Player UUID
     */
    removePlayer(playerId) {
        const index = this.players.findIndex(p => p.id === playerId);
        if (index !== -1) {
            const removed = this.players.splice(index, 1)[0];
            console.log('[LobbySystem] Player removed:', removed.name);
            return true;
        }
        return false;
    }

    /**
     * Update player ready status
     * @param {string} playerId - Player UUID
     * @param {boolean} isReady - Ready state
     */
    setPlayerReady(playerId, isReady) {
        const player = this.players.find(p => p.id === playerId);
        if (player) {
            player.isReady = isReady;
            console.log(`[LobbySystem] ${player.name} is ${isReady ? 'ready' : 'not ready'}`);
            return true;
        }
        return false;
    }

    /**
     * Check if all players are ready
     * @returns {boolean} - True if all players ready and min players met
     */
    canStartGame() {
        const minPlayers = 2;
        if (this.players.length < minPlayers) {
            return false;
        }
        return this.players.every(player => player.isReady);
    }

    /**
     * Add chat message
     * @param {string} playerId - Player UUID
     * @param {string} message - Chat message content
     */
    addChatMessage(playerId, message) {
        const player = this.players.find(p => p.id === playerId);
        if (player) {
            const chatMessage = {
                playerId,
                playerName: player.name,
                message,
                timestamp: Date.now()
            };
            this.chatMessages.push(chatMessage);
            console.log(`[LobbySystem] Chat: ${player.name}: ${message}`);
            return chatMessage;
        }
        return null;
    }

    /**
     * Add system message
     * @param {string} message - System message content
     */
    addSystemMessage(message) {
        const systemMessage = {
            playerId: 'system',
            playerName: 'System',
            message,
            timestamp: Date.now()
        };
        this.chatMessages.push(systemMessage);
        console.log(`[LobbySystem] System: ${message}`);
        return systemMessage;
    }

    /**
     * Get lobby state for UI update
     * @returns {Object} - Current lobby state
     */
    getLobbyState() {
        return {
            roomCode: this.roomCode,
            players: this.players,
            playerCount: this.players.length,
            maxPlayers: this.maxPlayers,
            canStart: this.canStartGame(),
            chatMessages: this.chatMessages
        };
    }
}
