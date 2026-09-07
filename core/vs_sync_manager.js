/**
 * VSSyncManager - Simplified VS Mode Synchronization
 * Based on working test_sync.js architecture
 *
 * Architecture: Simple player objects + direct WebSocket sync
 * - No complex ECS for networking
 * - Direct position updates
 * - Simple interpolation
 * - Proven to work
 */

export class VSSyncManager {
    constructor(game) {
        this.game = game;

        // Network
        this.ws = null;
        this.connected = false;
        this.roomCode = null;
        this.localPlayerId = null;

        // Players (simple objects, not ECS entities)
        this.players = new Map(); // Map<playerId, player>
        this.localPlayer = null;

        // Physics parameters (from Adventure mode)
        this.PLAYER_SPEED = 450; // px/s
        this.GRAVITY = 1000; // px/s²
        this.JUMP_VELOCITY = -425; // px/s
        this.MAX_JUMPS = 2;

        // Network timing
        this.UPDATE_RATE = 50; // ms (20Hz)
        this.lastSendTime = 0;

        // Input state
        this.keys = new Set();
        this.inputVector = { x: 0, y: 0 };

        // Map boundaries (from pvp_arena_1.json)
        this.MAP_WIDTH = 1920;
        this.MAP_HEIGHT = 1080;

        console.log('[VSSyncManager] Initialized');
    }

    /**
     * Connect to VS mode server
     * @param {string} roomCode - Room code
     * @param {string} playerName - Player name
     */
    async connect(roomCode, playerName) {
        this.roomCode = roomCode;

        console.log(`[VSSyncManager] Connecting to room ${roomCode} as ${playerName}`);

        // Create WebSocket connection
        this.ws = new WebSocket('ws://localhost:8080/ws');

        return new Promise((resolve, reject) => {
            this.ws.onopen = () => {
                this.connected = true;
                console.log('[VSSyncManager] WebSocket connected');

                // Join lobby (VS mode uses lobby_join, not test_join)
                this.send('lobby_join', {
                    roomCode: roomCode,
                    playerName: playerName,
                    isHost: false // Server will determine host
                });

                // Setup event listeners
                this.setupEventListeners();

                resolve();
            };

            this.ws.onmessage = (event) => {
                const message = JSON.parse(event.data);
                this.handleMessage(message);
            };

            this.ws.onerror = (error) => {
                console.error('[VSSyncManager] WebSocket error:', error);
                reject(error);
            };

            this.ws.onclose = () => {
                console.log('[VSSyncManager] WebSocket closed');
                this.connected = false;
            };
        });
    }

    /**
     * Setup keyboard event listeners
     */
    setupEventListeners() {
        window.addEventListener('keydown', (e) => {
            if (!this.connected || !this.localPlayer) return;

            // Prevent default for game keys
            if (['ArrowLeft', 'ArrowRight', 'ArrowUp'].includes(e.key)) {
                e.preventDefault();
            }

            // Handle jump separately (not held) - ArrowUp like Adventure mode
            if (e.key === 'ArrowUp' && !this.keys.has('ArrowUp')) {
                this.handleJump();
            }

            this.keys.add(e.key);
            this.updateInputVector();
        });

        window.addEventListener('keyup', (e) => {
            this.keys.delete(e.key);
            this.updateInputVector();
        });

        // Attack keys (same as Adventure: w=attack1, x=attack2, c=attack3, v=magic, space=arrow)
        window.addEventListener('keydown', (e) => {
            if (!this.connected || !this.localPlayer) return;

            switch(e.key.toLowerCase()) {
                case 'w':
                    this.handleAttack('attack1');
                    break;
                case 'x':
                    this.handleAttack('attack2');
                    break;
                case 'c':
                    this.handleAttack('attack3');
                    break;
                case 'v':
                    this.handleAttack('magicAttack');
                    break;
                case ' ':
                    this.handleAttack('arrowShoot');
                    break;
            }
        });
    }

    /**
     * Update input vector from keys
     */
    updateInputVector() {
        this.inputVector.x = 0;

        if (this.keys.has('ArrowLeft')) this.inputVector.x = -1;
        if (this.keys.has('ArrowRight')) this.inputVector.x = 1;
    }

    /**
     * Handle jump input
     */
    handleJump() {
        if (!this.localPlayer) return;

        // Double jump system
        if (this.localPlayer.jumpCount < this.MAX_JUMPS) {
            this.localPlayer.vy = this.JUMP_VELOCITY;
            this.localPlayer.jumpCount++;
            this.localPlayer.onGround = false;

            console.log(`[VSSyncManager] Jump ${this.localPlayer.jumpCount}/${this.MAX_JUMPS}`);
        }
    }

    /**
     * Handle attack input
     * @param {string} attackType - 'melee', 'ranged', 'magic'
     */
    handleAttack(attackType) {
        if (!this.localPlayer) return;

        console.log(`[VSSyncManager] Attack: ${attackType}`);

        // Send attack to server
        this.send('player_attack', {
            playerId: this.localPlayerId,
            attackType: attackType,
            x: this.localPlayer.x,
            y: this.localPlayer.y,
            facingRight: !this.localPlayer.facingRight, // Will be set by animation
            timestamp: Date.now()
        });

        // Update local animation (attackType is already the animation name)
        this.localPlayer.animation = attackType;
    }

    /**
     * Send message to server
     */
    send(type, data) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        this.ws.send(JSON.stringify({
            type: type,
            data: data,
            timestamp: Date.now()
        }));
    }

    /**
     * Handle incoming message
     */
    handleMessage(message) {
        const { type, data } = message;

        switch(type) {
            case 'lobby_joined':
                this.handleLobbyJoined(data);
                break;

            case 'game_state_sync':
                this.handleGameStateSync(data);
                break;

            case 'player_joined':
                console.log(`[VSSyncManager] Player ${data.playerName} joined`);
                break;

            case 'player_left':
                this.handlePlayerLeft(data);
                break;

            case 'player_attack':
                this.handlePlayerAttack(data);
                break;

            case 'player_hit':
                this.handlePlayerHit(data);
                break;

            case 'player_death':
                this.handlePlayerDeath(data);
                break;

            case 'match_start':
                console.log('[VSSyncManager] Match started!');
                break;

            case 'match_end':
                this.handleMatchEnd(data);
                break;

            default:
                console.warn(`[VSSyncManager] Unknown message type: ${type}`);
        }
    }

    /**
     * Handle lobby joined
     */
    handleLobbyJoined(data) {
        this.localPlayerId = data.playerId;

        console.log(`[VSSyncManager] Joined as ${data.playerName} (ID: ${this.localPlayerId})`);

        // Create local player
        this.localPlayer = this.createPlayer(
            data.playerId,
            data.playerName,
            data.x || 400,
            data.y || 300,
            data.playerIndex || 0,
            true
        );

        console.log('[VSSyncManager] Local player created:', this.localPlayer);
    }

    /**
     * Handle game state sync from server
     */
    handleGameStateSync(data) {
        if (!data.players) return;

        for (const playerData of data.players) {
            if (playerData.playerId === this.localPlayerId) {
                // Skip local player (we predict locally)
                continue;
            }

            let player = this.players.get(playerData.playerId);

            if (!player) {
                // New remote player
                player = this.createPlayer(
                    playerData.playerId,
                    playerData.playerName,
                    playerData.x,
                    playerData.y,
                    playerData.playerIndex,
                    false
                );
                console.log(`[VSSyncManager] Remote player created: ${playerData.playerName}`);
            }

            // Update target position for interpolation
            player.targetX = playerData.x;
            player.targetY = playerData.y;
            player.animation = playerData.animation;
            player.facingRight = playerData.facingRight;
            player.health = playerData.health;
            player.isAlive = playerData.isAlive;
        }
    }

    /**
     * Handle player left
     */
    handlePlayerLeft(data) {
        const player = this.players.get(data.playerId);
        if (player) {
            console.log(`[VSSyncManager] Player ${player.name} left`);
            this.removePlayer(data.playerId);
        }
    }

    /**
     * Handle player attack
     */
    handlePlayerAttack(data) {
        const player = this.players.get(data.playerId);
        if (player) {
            const animationMap = {
                'melee': 'attack1',
                'ranged': 'arrowShoot',
                'magic': 'magicAttack'
            };
            player.animation = animationMap[data.attackType] || 'attack1';
        }
    }

    /**
     * Handle player hit
     */
    handlePlayerHit(data) {
        const player = this.players.get(data.playerId);
        if (player) {
            player.health = data.health;
            console.log(`[VSSyncManager] ${player.name} hit! Health: ${data.health}`);
        }
    }

    /**
     * Handle player death
     */
    handlePlayerDeath(data) {
        const player = this.players.get(data.playerId);
        if (player) {
            player.isAlive = false;
            player.animation = 'death';
            console.log(`[VSSyncManager] ${player.name} died!`);
        }
    }

    /**
     * Handle match end
     */
    handleMatchEnd(data) {
        console.log(`[VSSyncManager] Match ended! Winner: ${data.winner}`);
        // Game will handle showing match end screen
    }

    /**
     * Create player object
     */
    createPlayer(id, name, x, y, index, isLocal) {
        const player = {
            id: id,
            name: name,
            x: x,
            y: y,
            targetX: x,
            targetY: y,
            vx: 0,
            vy: 0,
            onGround: false,
            jumpCount: 0,
            isLocal: isLocal,
            playerIndex: index,
            health: 100,
            isAlive: true,
            animation: 'idle',
            facingRight: true
        };

        this.players.set(id, player);

        return player;
    }

    /**
     * Remove player
     */
    removePlayer(id) {
        this.players.delete(id);
    }

    /**
     * Update - called every frame by game loop
     * @param {number} deltaTime - Time since last frame (seconds)
     */
    update(deltaTime) {
        if (!this.connected) return;

        // Update local player physics
        if (this.localPlayer) {
            this.updateLocalPlayer(deltaTime);
        }

        // Update remote players (interpolation)
        for (const [id, player] of this.players) {
            if (player.isLocal) continue;
            this.updateRemotePlayer(player, deltaTime);
        }

        // Send position update to server (20Hz)
        const now = Date.now();
        if (this.localPlayer && now - this.lastSendTime >= this.UPDATE_RATE) {
            this.sendPlayerState();
            this.lastSendTime = now;
        }
    }

    /**
     * Update local player with physics
     */
    updateLocalPlayer(deltaTime) {
        const player = this.localPlayer;

        // Apply horizontal input
        player.vx = this.inputVector.x * this.PLAYER_SPEED;

        // Apply gravity
        player.vy += this.GRAVITY * deltaTime;

        // Update position
        player.x += player.vx * deltaTime;
        player.y += player.vy * deltaTime;

        // Simple ground collision (y = 600 for now, will use map data later)
        const groundY = 600;
        if (player.y >= groundY) {
            player.y = groundY;
            player.vy = 0;
            player.onGround = true;
            player.jumpCount = 0; // Reset jumps on ground
        } else {
            player.onGround = false;
        }

        // Boundary collision
        player.x = Math.max(55, Math.min(this.MAP_WIDTH - 55, player.x));

        // Update animation state
        if (player.vx !== 0) {
            player.animation = 'run';
            player.facingRight = player.vx > 0;
        } else {
            player.animation = 'idle';
        }

        if (!player.onGround) {
            player.animation = 'jump';
        }
    }

    /**
     * Update remote player with interpolation
     */
    updateRemotePlayer(player, deltaTime) {
        // Smooth interpolation towards target
        const lerpFactor = 0.15;
        player.x += (player.targetX - player.x) * lerpFactor;
        player.y += (player.targetY - player.y) * lerpFactor;
    }

    /**
     * Send player state to server
     */
    sendPlayerState() {
        if (!this.localPlayer) return;

        this.send('player_state', {
            playerId: this.localPlayerId,
            x: Math.round(this.localPlayer.x * 100) / 100,
            y: Math.round(this.localPlayer.y * 100) / 100,
            vx: Math.round(this.localPlayer.vx * 100) / 100,
            vy: Math.round(this.localPlayer.vy * 100) / 100,
            animation: this.localPlayer.animation,
            facingRight: this.localPlayer.facingRight,
            health: this.localPlayer.health,
            isAlive: this.localPlayer.isAlive,
            timestamp: Date.now()
        });
    }

    /**
     * Cleanup
     */
    cleanup() {
        if (this.ws) {
            this.ws.close();
        }
        this.players.clear();
        this.localPlayer = null;
        this.connected = false;
        console.log('[VSSyncManager] Cleanup complete');
    }
}
