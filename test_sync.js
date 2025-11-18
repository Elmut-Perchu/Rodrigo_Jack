// test_sync.js - Système minimal de cercles synchronisés

class TestSync {
    constructor() {
        // ===== ADVENTURE MODE PARAMETERS =====
        // Extracted from Adventure mode for consistency
        // Source: ADVENTURE_PARAMS_REFERENCE.md

        // Player dimensions (Adventure: 110x110px)
        this.PLAYER_RADIUS = 55; // radius = width/2 (110/2 = 55)
        this.TERRAIN_RADIUS = 26; // Adventure collision radius

        // Movement (Adventure: 450 px/s)
        this.PLAYER_SPEED = 450; // pixels per second

        // Physics (Adventure: gravity=1000, jumpStrength=425)
        this.GRAVITY = 1000; // pixels per second^2
        this.JUMP_VELOCITY = -425; // pixels per second (negative = up)

        // Jump system (Adventure: double jump, max 2)
        this.MAX_JUMPS = 2; // Enable double jump like Adventure

        // Network & rendering
        this.TRAIL_OPACITY = 0.02;
        this.UPDATE_RATE = 50; // ms (20Hz)

        // Map configuration
        this.MAP_WIDTH = 1280;
        this.MAP_HEIGHT = 720;
        this.WALL_THICKNESS = 20;
        this.WALL_COLOR = '#444444';
        this.GROUND_Y = this.MAP_HEIGHT - this.WALL_THICKNESS - this.PLAYER_RADIUS; // Ground level

        // Platforms
        this.platforms = [
            { x: 200, y: 500, width: 200, height: 20 },
            { x: 500, y: 400, width: 250, height: 20 },
            { x: 850, y: 300, width: 200, height: 20 }
        ];

        // Player persistence
        this.loadPlayerSession();

        // Couleurs pour les joueurs
        this.COLORS = [
            '#FF6B6B', // Rouge
            '#4ECDC4', // Cyan
            '#45B7D1', // Bleu
            '#96CEB4', // Vert
            '#FFEAA7', // Jaune
            '#DDA0DD', // Violet
            '#98D8C8', // Menthe
            '#FFB6C1'  // Rose
        ];

        // État
        this.ws = null;
        this.connected = false;
        this.disconnecting = false; // Flag to prevent disconnect loops
        this.localPlayerId = null;
        this.roomCode = null;
        this.players = new Map();
        this.localPlayer = null;

        // Input
        this.keys = new Set();
        this.inputVector = { x: 0, y: 0 };

        // Canvas pour traînées
        this.canvas = document.getElementById('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.resizeCanvas();

        // Container pour les cercles
        this.playersContainer = document.getElementById('players');

        // Timing
        this.lastUpdate = 0;
        this.lastSendTime = 0;
        this.frameCount = 0;
        this.lastFpsUpdate = 0;

        // Logs
        this.logsContainer = document.getElementById('logs');
        this.maxLogs = 50;

        // Debug counters
        this.joinedCount = 0;

        // Setup
        this.setupEventListeners();
        this.startGameLoop();
    }

    setupEventListeners() {
        // Resize canvas
        window.addEventListener('resize', () => this.resizeCanvas());

        // Keyboard input
        window.addEventListener('keydown', (e) => {
            if (!this.connected || !this.localPlayer) return;

            // Prevent default behavior for game keys (space, arrows)
            if (e.key === ' ' || e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault(); // CRITICAL: Prevent space from activating buttons, arrows from scrolling!
            }

            // Handle jump separately (not held down) - DON'T add to keys
            if (e.key === ' ') {
                if (!this.keys.has(' ')) {
                    this.handleJump();
                }
                // Don't add space to keys - it's only for jump, not movement
                return;
            }

            this.keys.add(e.key);
            this.updateInputVector();
        });

        window.addEventListener('keyup', (e) => {
            // Don't process space key in keyup
            if (e.key === ' ') return;

            this.keys.delete(e.key);
            this.updateInputVector();
        });

        // Buttons
        document.getElementById('connectBtn').addEventListener('click', () => {
            const name = document.getElementById('playerName').value || 'Player';
            const room = document.getElementById('roomCode').value || 'TEST';

            if (!this.connected) {
                this.connect(name, room);
            } else {
                this.disconnect();
            }
        });

        document.getElementById('clearBtn').addEventListener('click', () => {
            this.clearTrails();
        });

        // New Session button
        document.getElementById('newSessionBtn').addEventListener('click', () => {
            if (this.connected) {
                alert('Please disconnect before creating a new session');
                return;
            }

            if (confirm('Create a new session? This will reset your player identity.')) {
                localStorage.removeItem('testSyncSession');
                this.createNewSession();
                this.updateSessionDisplay();
                this.log('Created new session: ' + this.sessionId.substring(8, 16), 'warning');
            }
        });

        // Display session on load
        this.updateSessionDisplay();
    }

    updateSessionDisplay() {
        const display = document.getElementById('sessionDisplay');
        if (display && this.sessionId) {
            display.textContent = this.sessionId.substring(8, 16) + '...';
        }
    }

    updateInputVector() {
        this.inputVector.x = 0;
        this.inputVector.y = 0; // No longer used (gravity controls vertical)

        if (this.keys.has('ArrowLeft')) this.inputVector.x = -1;
        if (this.keys.has('ArrowRight')) this.inputVector.x = 1;
        // ArrowUp/Down no longer control movement (Space = jump, gravity = fall)
    }

    checkPlatformCollision(player, mapX, mapY) {
        const playerBottom = player.y + this.PLAYER_RADIUS;
        const playerTop = player.y - this.PLAYER_RADIUS;
        const playerLeft = player.x - this.PLAYER_RADIUS;
        const playerRight = player.x + this.PLAYER_RADIUS;

        for (const platform of this.platforms) {
            const platformX = mapX + platform.x;
            const platformY = mapY + platform.y;
            const platformRight = platformX + platform.width;
            const platformBottom = platformY + platform.height;

            // Check if player is horizontally aligned with platform
            if (playerRight > platformX && playerLeft < platformRight) {
                // Landing on top of platform (falling down)
                if (player.vy >= 0 && playerBottom >= platformY && playerBottom <= platformBottom) {
                    player.y = platformY - this.PLAYER_RADIUS;
                    player.vy = 0;
                    player.onGround = true;
                    player.jumpCount = 0; // Reset jump counter when landing
                }
                // Hitting bottom of platform (jumping up)
                else if (player.vy < 0 && playerTop <= platformBottom && playerTop >= platformY) {
                    player.y = platformBottom + this.PLAYER_RADIUS;
                    player.vy = 0;
                }
            }
        }
    }

    resizeCanvas() {
        console.log('📐 RESIZE CANVAS called');
        // Only resize if canvas exists and we have a context
        if (!this.canvas || !this.ctx) return;

        // Store old canvas data before resizing (only if there's data to save)
        let imageData = null;
        if (this.canvas.width > 0 && this.canvas.height > 0) {
            try {
                imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
            } catch(e) {
                console.warn('Could not save canvas data:', e);
            }
        }

        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;

        // Redraw background
        this.ctx.fillStyle = '#2a2a2a';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw map boundaries
        this.drawWalls();

        // Restore old trails (if they exist and fit)
        if (imageData) {
            try {
                this.ctx.putImageData(imageData, 0, 0);
            } catch(e) {
                // Canvas might be smaller, that's ok
                console.warn('Could not restore canvas data:', e);
            }
        }
    }

    drawWalls() {
        this.ctx.fillStyle = this.WALL_COLOR;

        // Calculate map position (centered on screen)
        const mapX = (this.canvas.width - this.MAP_WIDTH) / 2;
        const mapY = (this.canvas.height - this.MAP_HEIGHT) / 2;

        // Top wall
        this.ctx.fillRect(mapX, mapY, this.MAP_WIDTH, this.WALL_THICKNESS);

        // Bottom wall (ground)
        this.ctx.fillRect(mapX, mapY + this.MAP_HEIGHT - this.WALL_THICKNESS,
                         this.MAP_WIDTH, this.WALL_THICKNESS);

        // Left wall
        this.ctx.fillRect(mapX, mapY, this.WALL_THICKNESS, this.MAP_HEIGHT);

        // Right wall
        this.ctx.fillRect(mapX + this.MAP_WIDTH - this.WALL_THICKNESS, mapY,
                         this.WALL_THICKNESS, this.MAP_HEIGHT);

        // Draw platforms
        this.ctx.fillStyle = '#666666';
        for (const platform of this.platforms) {
            this.ctx.fillRect(
                mapX + platform.x,
                mapY + platform.y,
                platform.width,
                platform.height
            );
        }

        // Draw a subtle grid inside the map area
        this.ctx.strokeStyle = '#333333';
        this.ctx.lineWidth = 1;
        this.ctx.globalAlpha = 0.3;

        // Grid lines every 100 pixels
        for (let x = mapX + 100; x < mapX + this.MAP_WIDTH; x += 100) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, mapY);
            this.ctx.lineTo(x, mapY + this.MAP_HEIGHT);
            this.ctx.stroke();
        }
        for (let y = mapY + 100; y < mapY + this.MAP_HEIGHT; y += 100) {
            this.ctx.beginPath();
            this.ctx.moveTo(mapX, y);
            this.ctx.lineTo(mapX + this.MAP_WIDTH, y);
            this.ctx.stroke();
        }

        this.ctx.globalAlpha = 1;
    }

    handleJump() {
        if (!this.localPlayer || !this.connected) return;

        // Double jump system (Adventure mode: max 2 jumps)
        // Initialize jump counter if not exists
        if (this.localPlayer.jumpCount === undefined) {
            this.localPlayer.jumpCount = 0;
        }

        // Can jump if: on ground OR in air with jumps remaining
        if (this.localPlayer.jumpCount < this.MAX_JUMPS) {
            this.localPlayer.vy = this.JUMP_VELOCITY;
            this.localPlayer.jumpCount++;
            this.localPlayer.onGround = false;

            const jumpType = this.localPlayer.jumpCount === 1 ? 'Jump!' : 'Double Jump!';
            this.log(jumpType, 'info');
        }
    }

    clearTrails() {
        this.ctx.fillStyle = '#2a2a2a';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.drawWalls();
        this.log('Trails cleared', 'warning');
    }

    connect(playerName, roomCode) {
        this.roomCode = roomCode;
        // Use sessionId for consistent player identity
        this.localPlayerId = this.sessionId;

        // Save the player name for future reconnections
        this.sessionName = playerName;
        this.saveSession();

        this.log(`Connecting to room ${roomCode} as ${playerName} (Session: ${this.sessionId.substring(8, 16)})...`, 'send');

        // WebSocket connection
        this.ws = new WebSocket('ws://localhost:8080/ws');

        this.ws.onopen = () => {
            this.connected = true;
            this.disconnecting = false; // Reset disconnecting flag
            this.log('WebSocket connected!', 'send');
            document.getElementById('status').textContent = 'Connected';
            document.getElementById('connectBtn').textContent = 'Disconnect';

            // Join room with persistent session ID
            this.send('test_join', {
                roomCode: roomCode,
                playerId: this.localPlayerId,
                playerName: playerName,
                sessionId: this.sessionId,  // Send session for reconnection handling
                isReconnect: false  // Will be true when implementing reconnection
            });

            // Start heartbeat to prevent timeout
            this.heartbeatInterval = setInterval(() => {
                if (this.connected) {
                    this.send('ping', { timestamp: Date.now() });
                }
            }, 30000); // Every 30 seconds
        };

        this.ws.onmessage = (event) => {
            const message = JSON.parse(event.data);
            this.handleMessage(message);
        };

        this.ws.onerror = (error) => {
            this.log(`WebSocket error: ${error}`, 'error');
        };

        this.ws.onclose = () => {
            // Only call disconnect() if we're not already disconnecting
            // (prevents infinite loop: disconnect() → ws.close() → onclose → disconnect()...)
            if (!this.disconnecting) {
                this.log('WebSocket disconnected', 'error');
                this.disconnect();
            }
        };
    }

    disconnect() {
        // Prevent recursive disconnect calls
        if (this.disconnecting) {
            console.log('⚠️ Already disconnecting, skipping...');
            return;
        }

        this.disconnecting = true;
        console.log('🔴 DISCONNECT CALLED from:', new Error().stack.split('\n')[2]);

        if (this.ws) {
            this.ws.close();
        }

        // Clear heartbeat
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }

        this.connected = false;
        this.players.clear();
        console.log('🔴 DISCONNECT: Setting localPlayer to NULL');
        this.localPlayer = null;

        // Clear UI
        this.playersContainer.innerHTML = '';
        document.getElementById('status').textContent = 'Disconnected';
        document.getElementById('connectBtn').textContent = 'Connect';
        document.getElementById('room').textContent = '-';
        document.getElementById('playerId').textContent = '-';
        document.getElementById('playerCount').textContent = '0';
    }

    send(type, data) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        const message = {
            type: type,
            data: data,
            timestamp: Date.now()
        };

        this.ws.send(JSON.stringify(message));
    }

    handleMessage(message) {
        const { type, data } = message;

        switch(type) {
            case 'test_joined':
                console.log(`📨 Received test_joined message #${++this.joinedCount || 1}`);
                this.handleTestJoined(data);
                break;

            case 'test_state':
                this.handleTestState(data);
                break;

            case 'player_joined':
                this.handlePlayerJoined(data);
                break;

            case 'player_left':
                this.handlePlayerLeft(data);
                break;

            case 'ping':
                // Server sent ping, respond with pong
                this.send('pong', {});
                break;

            case 'pong':
                // Server responded to our ping, just acknowledge
                // No action needed
                break;

            default:
                this.log(`Unknown message type: ${type}`, 'warning');
        }
    }

    handleTestJoined(data) {
        this.log(`Joined room ${this.roomCode}!`, 'receive');
        document.getElementById('room').textContent = this.roomCode;
        document.getElementById('playerId').textContent = this.localPlayerId.substring(0, 8);

        // Calculate map position for spawn
        const mapX = (this.canvas.width - this.MAP_WIDTH) / 2;
        const mapY = (this.canvas.height - this.MAP_HEIGHT) / 2;

        // CRITICAL FIX: Only create player if doesn't exist yet
        if (!this.localPlayer) {
            // Create local player - use playerIndex from server for color
            const colorIndex = data.playerIndex !== undefined ? data.playerIndex : this.hashPlayerId(this.localPlayerId);
            const color = this.COLORS[colorIndex % this.COLORS.length];
            console.log(`🎨 Local player: index=${colorIndex}, color=${color}, data=`, data);
            this.localPlayer = this.createPlayer(this.localPlayerId, data.playerName || 'Player', color, true);

            // Use position from server but adjust to map coordinates
            this.localPlayer.x = mapX + (data.x || 400);
            this.localPlayer.y = mapY + (data.y || 300);
            console.log(`📍 Local player spawn: (${this.localPlayer.x}, ${this.localPlayer.y})`);
        } else {
            // Player already exists - just update position from server (reconnection case)
            console.log(`♻️ Player already exists, updating position from server`);
            this.localPlayer.x = mapX + (data.x || this.localPlayer.x - mapX);
            this.localPlayer.y = mapY + (data.y || this.localPlayer.y - mapY);
            console.log(`📍 Updated position: (${this.localPlayer.x}, ${this.localPlayer.y})`);
        }

        // Update visual
        this.updatePlayerVisual(this.localPlayer);
    }

    handleTestState(data) {
        if (!data.players) return;

        // Calculate map position for coordinate adjustment
        const mapX = (this.canvas.width - this.MAP_WIDTH) / 2;
        const mapY = (this.canvas.height - this.MAP_HEIGHT) / 2;

        // Debug: Log all player IDs received (throttled - once per second)
        const receivedIds = data.players.map(p => p.playerId);
        if (receivedIds.includes(this.localPlayerId)) {
            const now = Date.now();
            if (!this.lastPosLogTime || now - this.lastPosLogTime > 1000) {
                console.log(`ℹ️ Received my own position from server: ${data.players.find(p => p.playerId === this.localPlayerId).x}, ${data.players.find(p => p.playerId === this.localPlayerId).y}`);
                this.lastPosLogTime = now;
            }
        }

        // Update all remote players
        for (const playerData of data.players) {
            if (playerData.playerId === this.localPlayerId) continue;

            let player = this.players.get(playerData.playerId);

            if (!player) {
                // New player - use playerIndex from server or hash-based fallback
                const colorIndex = playerData.playerIndex !== undefined
                    ? playerData.playerIndex
                    : this.hashPlayerId(playerData.playerId);
                console.log(`🎨 Remote player: index=${colorIndex}, playerData=`, playerData);
                player = this.createPlayer(
                    playerData.playerId,
                    playerData.playerName || 'Player',
                    this.COLORS[colorIndex % this.COLORS.length],
                    false
                );
                // Set initial position adjusted to map coordinates
                player.x = mapX + playerData.x;
                player.y = mapY + playerData.y;
                player.targetX = player.x;
                player.targetY = player.y;
                this.log(`Player ${playerData.playerName} joined with color index ${colorIndex}`, 'receive');
            }

            // Update position (with interpolation) - adjust to map coordinates
            player.targetX = mapX + playerData.x;
            player.targetY = mapY + playerData.y;
        }

        // Update player count
        document.getElementById('playerCount').textContent = this.players.size;
    }

    handlePlayerJoined(data) {
        this.log(`Player ${data.playerName} joined`, 'receive');
    }

    handlePlayerLeft(data) {
        const player = this.players.get(data.playerId);
        if (player) {
            this.log(`Player ${player.name} left`, 'warning');
            this.removePlayer(data.playerId);
        }
    }

    createPlayer(id, name, color, isLocal) {
        const player = {
            id: id,
            name: name,
            color: color,
            isLocal: isLocal,
            x: 400,
            y: 300,
            targetX: 400,
            targetY: 300,
            vx: 0,
            vy: 0,
            onGround: false,
            jumpCount: 0, // Initialize jump counter for double jump system
            element: null
        };

        // Create visual element
        const element = document.createElement('div');
        element.className = 'player-circle';
        element.style.width = `${this.PLAYER_RADIUS * 2}px`;
        element.style.height = `${this.PLAYER_RADIUS * 2}px`;
        element.style.backgroundColor = color;
        element.style.color = isLocal ? 'white' : 'black';
        element.textContent = name.substring(0, 2).toUpperCase();

        this.playersContainer.appendChild(element);
        player.element = element;

        this.players.set(id, player);

        return player;
    }

    removePlayer(id) {
        const player = this.players.get(id);
        if (player) {
            if (player.element) {
                player.element.remove();
            }
            this.players.delete(id);
        }
    }

    updatePlayerVisual(player) {
        if (!player.element) {
            console.error('❌ Player element is NULL!', player);
            return;
        }

        player.element.style.left = `${player.x - this.PLAYER_RADIUS}px`;
        player.element.style.top = `${player.y - this.PLAYER_RADIUS}px`;
    }

    drawTrail(player, oldX, oldY) {
        // Draw trail line
        this.ctx.strokeStyle = player.color;
        this.ctx.lineWidth = this.PLAYER_RADIUS * 2;
        this.ctx.lineCap = 'round';
        this.ctx.globalAlpha = 0.5;

        this.ctx.beginPath();
        this.ctx.moveTo(oldX, oldY);
        this.ctx.lineTo(player.x, player.y);
        this.ctx.stroke();

        this.ctx.globalAlpha = 1;
    }

    update(deltaTime) {
        // Debug: Check if localPlayer exists
        if (!this.localPlayer && this.connected) {
            console.error('❌ localPlayer is NULL but connected! Recreating...');
            // Don't continue, let it be recreated on next test_joined
            return;
        }

        // Update local player
        if (this.localPlayer && this.connected) {
            const oldX = this.localPlayer.x;
            const oldY = this.localPlayer.y;

            // Calculate map boundaries (centered on screen)
            const mapX = (this.canvas.width - this.MAP_WIDTH) / 2;
            const mapY = (this.canvas.height - this.MAP_HEIGHT) / 2;

            // Apply horizontal input (no more vertical input, that's gravity's job)
            this.localPlayer.vx = this.inputVector.x * this.PLAYER_SPEED;

            // Apply gravity
            this.localPlayer.vy += this.GRAVITY * deltaTime;

            // Update position
            let newX = this.localPlayer.x + this.localPlayer.vx * deltaTime;
            let newY = this.localPlayer.y + this.localPlayer.vy * deltaTime;

            // Horizontal collision with walls
            const minX = mapX + this.WALL_THICKNESS + this.PLAYER_RADIUS;
            const maxX = mapX + this.MAP_WIDTH - this.WALL_THICKNESS - this.PLAYER_RADIUS;
            this.localPlayer.x = Math.max(minX, Math.min(maxX, newX));

            // Vertical collision with ground
            const groundY = mapY + this.MAP_HEIGHT - this.WALL_THICKNESS - this.PLAYER_RADIUS;

            // Check ground collision
            if (newY >= groundY) {
                this.localPlayer.y = groundY;
                this.localPlayer.vy = 0;
                this.localPlayer.onGround = true;
                this.localPlayer.jumpCount = 0; // Reset jump counter when landing
            } else {
                this.localPlayer.y = newY;
                this.localPlayer.onGround = false;
            }

            // Check platform collisions
            this.checkPlatformCollision(this.localPlayer, mapX, mapY);

            // Ceiling collision
            const minY = mapY + this.WALL_THICKNESS + this.PLAYER_RADIUS;
            if (this.localPlayer.y < minY) {
                this.localPlayer.y = minY;
                this.localPlayer.vy = 0;
            }

            // Draw trail if moved
            if (Math.abs(oldX - this.localPlayer.x) > 0.1 || Math.abs(oldY - this.localPlayer.y) > 0.1) {
                this.drawTrail(this.localPlayer, oldX, oldY);
            }

            // Update visual
            this.updatePlayerVisual(this.localPlayer);

            // Update position display
            document.getElementById('position').textContent =
                `${Math.round(this.localPlayer.x)}, ${Math.round(this.localPlayer.y)}`;

            // Send position update (even if not moving, to keep connection alive)
            const now = Date.now();
            if (now - this.lastSendTime >= this.UPDATE_RATE) {
                // Calculate map position to send relative coordinates
                const mapX = (this.canvas.width - this.MAP_WIDTH) / 2;
                const mapY = (this.canvas.height - this.MAP_HEIGHT) / 2;

                // Send position relative to map origin (not screen)
                this.send('test_update', {
                    playerId: this.localPlayerId,
                    x: Math.round(this.localPlayer.x - mapX),
                    y: Math.round(this.localPlayer.y - mapY),
                    vx: this.localPlayer.vx,
                    vy: this.localPlayer.vy
                });
                this.lastSendTime = now;
            }
        }

        // Update remote players (interpolation)
        for (const [id, player] of this.players) {
            if (player.isLocal) continue;

            const oldX = player.x;
            const oldY = player.y;

            // Smooth interpolation
            const lerpFactor = 0.15;
            player.x += (player.targetX - player.x) * lerpFactor;
            player.y += (player.targetY - player.y) * lerpFactor;

            // Draw trail if moved
            if (Math.abs(oldX - player.x) > 0.5 || Math.abs(oldY - player.y) > 0.5) {
                this.drawTrail(player, oldX, oldY);
            }

            // Update visual
            this.updatePlayerVisual(player);
        }
    }

    startGameLoop() {
        let lastTime = performance.now();

        const loop = (currentTime) => {
            const deltaTime = (currentTime - lastTime) / 1000; // Convert to seconds
            lastTime = currentTime;

            // Update
            this.update(deltaTime);

            // FPS counter
            this.frameCount++;
            if (currentTime - this.lastFpsUpdate > 1000) {
                document.getElementById('fps').textContent = this.frameCount;
                this.frameCount = 0;
                this.lastFpsUpdate = currentTime;
            }

            requestAnimationFrame(loop);
        };

        requestAnimationFrame(loop);
    }

    log(message, type = 'info') {
        const entry = document.createElement('div');
        entry.className = `log-entry log-${type}`;
        entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;

        this.logsContainer.appendChild(entry);

        // Keep only last N logs
        while (this.logsContainer.children.length > this.maxLogs) {
            this.logsContainer.removeChild(this.logsContainer.firstChild);
        }

        // Auto scroll to bottom
        this.logsContainer.scrollTop = this.logsContainer.scrollHeight;
    }

    generateId() {
        return Math.random().toString(36).substring(2) + Date.now().toString(36);
    }

    // Hash player ID to get consistent color index
    hashPlayerId(playerId) {
        let hash = 0;
        for (let i = 0; i < playerId.length; i++) {
            const char = playerId.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return Math.abs(hash);
    }

    // Session management
    loadPlayerSession() {
        // Try to load existing session from localStorage
        const savedSession = localStorage.getItem('testSyncSession');
        if (savedSession) {
            try {
                const session = JSON.parse(savedSession);
                this.sessionId = session.sessionId;
                this.sessionName = session.sessionName;
                console.log('📦 Loaded session:', this.sessionId);

                // Pre-fill the name field
                const nameField = document.getElementById('playerName');
                if (nameField && this.sessionName) {
                    nameField.value = this.sessionName;
                }
            } catch (e) {
                console.log('Creating new session (invalid saved data)');
                this.createNewSession();
            }
        } else {
            this.createNewSession();
        }
    }

    createNewSession() {
        // Create a unique session ID that persists across reconnections
        this.sessionId = 'session_' + this.generateId();
        this.sessionName = '';
        this.saveSession();
        console.log('🆕 Created new session:', this.sessionId);
    }

    saveSession() {
        const session = {
            sessionId: this.sessionId,
            sessionName: this.sessionName,
            timestamp: Date.now()
        };
        localStorage.setItem('testSyncSession', JSON.stringify(session));
    }
}

// Start when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.testSync = new TestSync();
    console.log('🔴 Test Sync initialized! Use arrow keys to move.');
});