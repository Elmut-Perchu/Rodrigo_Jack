// game_vs_simple.js - Simplified VS Mode Game (Independent from Adventure)
import { createLocalPlayer, createRemotePlayer } from './create/remote_player_create.js';
import { createTile } from './create/tile_create.js';
import { TILE_CONSTANTS } from './constants/tile_constants.js';

// Import VS-specific systems
import { VSInput } from './core/systems_vs/vs_input_system.js';
import { VSGravity } from './core/systems_vs/vs_gravity_system.js';
import { VSMovement } from './core/systems_vs/vs_movement_system.js';
import { VSCollision } from './core/systems_vs/vs_collision_system.js';
import { VSRender } from './core/systems_vs/vs_render_system.js';
import { VSBow } from './core/systems_vs/vs_bow_system.js';
import { VSSpectre } from './core/systems_vs/vs_spectre_system.js';
import { VSArrow } from './core/systems_vs/vs_arrow_system.js';
import { VSAudio } from './core/systems_vs/vs_audio_system.js';
import { VSBot } from './core/systems_vs/vs_bot_system.js';
import { VSLocalArbiter } from './core/systems_vs/vs_local_arbiter.js';
import { spawnSparks } from './core/systems_vs/vs_sparks.js';
import { createArrow } from './create/arrow_create.js';
import { createBot } from './create/bot_create.js';
import { createSpectre } from './create/spectre_create.js';
import { differentSwing } from './constants/vs_combat_constants.js';
import { paletteFor } from './constants/vs_palette.js';
import { getBotLevel } from './constants/bot_constants.js';

// Shared with the lobby so both pages present the same session identity
import { getVsSessionId } from './core/network/websocket_client.js';

export class GameVSSimple {
    constructor() {
        this.entities = new Set();
        this.systems = [];
        this.mode = 'vs';
        this.isPaused = false;
        this.lastTime = 0;

        // Network state
        this.ws = null;
        this.localPlayerId = null;
        this.localPlayer = null;
        this.remotePlayers = new Map(); // playerId -> entity (networked)
        this.bots = new Map();          // playerId -> entity (computer opponents)

        // Set in a match against the computer: stands in for the Go server and
        // speaks the same protocol (see VSLocalArbiter).
        this.arbiter = null;
        this.roomId = null;
        this.playerName = null;
        this.sessionId = null;
        this.syncInterval = null;
        this.spawnApplied = false; // Local player snapped to the server spawn yet?
        this.lastAliveCount = null; // Alive count from the latest server sync
        this.arrows = new Map();    // arrowId -> arrow entity
        this.spectres = new Map();  // spectreId -> spirit entity
        this.hudCards = null;       // playerId -> HUD card elements
        this.pendingRoomState = null; // Roster held until we know our own id
        this.teams = new Map();       // playerId -> team number (0 = free-for-all)
        this.teamMode = 'ffa';
        this.botStreamInterval = null; // Streams our bots' poses to the server
        this.matchOver = false;
        this._onJoined = null;     // Resolves connectToServer() on lobby_joined

        // Map data
        this.currentMap = null;

        console.log('🎮 [GameVSSimple] Created');
    }

    async init() {
        console.log('🎮 [GameVSSimple] Initializing...');

        // Add systems in strict order
        this.botSystem = new VSBot(this);
        this.addSystem(this.botSystem); // Writes the bots' input
        this.addSystem(new VSInput(this));
        this.addSystem(new VSBow(this));      // Weapon input -> network
        // After VSInput, whose velocity it slows while a spirit is channelled
        this.addSystem(new VSSpectre(this));
        this.addSystem(new VSGravity(this));
        this.addSystem(new VSMovement(this));
        this.addSystem(new VSCollision(this));
        this.arrowSystem = new VSArrow(this); // Arrow flight, impact, pickup
        this.addSystem(this.arrowSystem);
        this.addSystem(new VSRender(this));
        this.audio = new VSAudio(this);       // Reads the states VSRender just set
        this.addSystem(this.audio);

        console.log('🎮 [GameVSSimple] Systems added:', this.systems.length);

        // Load the VS map
        await this.loadMap('pvp_arena_compact');

        // Start game loop
        requestAnimationFrame(this.loop.bind(this));

        console.log('🎮 [GameVSSimple] Initialized and running');
    }

    addSystem(system) {
        this.systems.push(system);
    }

    addEntity(entity) {
        this.entities.add(entity);
        // Add to all systems
        this.systems.forEach(system => {
            system.addEntity(entity);
        });
    }

    removeEntity(entity) {
        this.entities.delete(entity);
        // Remove from all systems
        this.systems.forEach(system => {
            system.removeEntity(entity);
        });

        // Remove visual
        const visual = entity.getComponent('visual');
        if (visual && visual.div && visual.div.parentNode) {
            visual.div.parentNode.removeChild(visual.div);
        }
    }

    async loadMap(mapName) {
        console.log(`🗺️ [GameVSSimple] Loading map: ${mapName}`);

        const response = await fetch(`/assets/maps/${mapName}.json`);
        const mapData = await response.json();
        this.currentMap = mapData;

        // Create tiles from map data
        if (mapData.tiles) {
            this.createTilesFromData(mapData.tiles);
        }

        console.log(`🗺️ [GameVSSimple] Map loaded, entities: ${this.entities.size}`);
    }

    createTilesFromData(tilesData) {
        let tileCount = 0;

        // tilesData is an array of strings like "111111111111111111111111"
        tilesData.forEach((row, y) => {
            for (let x = 0; x < row.length; x++) {
                const char = row[x];

                // '1' means solid tile, '0' means empty
                if (char === '1') {
                    // createTile expects (gridX, gridY, tilesetX, tilesetY, properties)
                    const tileEntity = createTile(x, y, 0, 0, { solid: true });
                    this.addEntity(tileEntity);
                    tileCount++;
                }
            }
        });

        console.log(`🗺️ [GameVSSimple] Created ${tileCount} tiles`);
    }

    loop(currentTime) {
        if (this.isPaused) {
            requestAnimationFrame(this.loop.bind(this));
            return;
        }

        const deltaTime = (currentTime - this.lastTime) / 1000;
        this.lastTime = currentTime;

        // Cap deltaTime to prevent huge jumps
        const cappedDelta = Math.min(deltaTime, 0.05);

        // Update all systems
        this.systems.forEach(system => {
            system.update(cappedDelta);
        });

        requestAnimationFrame(this.loop.bind(this));
    }

    // === Network Methods ===
    //
    // Wire protocol (see server/player.go). Every frame is an envelope:
    //   { type: string, data: { ... }, timestamp: number }
    // Payload fields are camelCase (roomCode, playerId, playerName).

    /**
     * A session id persisted in localStorage lets this client reclaim its
     * player slot after navigating from the lobby to the arena, which tears
     * down the WebSocket. Without it the server would treat the arriving
     * client as a brand new player in a brand new room.
     */
    getSessionId() {
        return getVsSessionId();
    }

    /**
     * Reports an action on behalf of a given fighter.
     *
     * Online there is only ever one possible actor - you - and the server
     * infers it from the connection. Against the computer both fighters are
     * driven from this machine, so the actor has to be named, and the whole
     * exchange is short-circuited to the local arbiter instead of a socket.
     *
     * Combat code (VSBow, VSArrow) goes through here rather than send(), which
     * is what lets a bot's swings and arrows follow exactly the same rules as
     * a player's.
     */
    sendFrom(playerId, type, data = {}) {
        if (this.arbiter) {
            this.arbiter.fromClient(playerId, type, data);
            return true;
        }
        if (!playerId || playerId === this.localPlayerId) return this.send(type, data);

        // A bot this client runs: name it so the server credits the action to
        // the bot rather than to us. It refuses any id we do not control.
        if (this.bots.has(playerId)) {
            return this.send(type, { ...data, asPlayerId: playerId });
        }
        return false;
    }

    send(type, data = {}) {
        if (this.arbiter) return this.sendFrom(this.localPlayerId, type, data);
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
        this.ws.send(JSON.stringify({
            type,
            data,
            timestamp: Date.now()
        }));
        return true;
    }

    /**
     * Connects, joins the room and resolves once the server confirms.
     */
    connectToServer(roomCode, playerName, serverUrl = 'ws://localhost:8080/ws') {
        this.roomId = roomCode;
        this.playerName = playerName;
        this.sessionId = this.getSessionId();

        console.log(`🌐 [GameVSSimple] Connecting to ${serverUrl} (room ${roomCode}, session ${this.sessionId})`);

        return new Promise((resolve, reject) => {
            this.ws = new WebSocket(serverUrl);

            const timeout = setTimeout(() => reject(new Error('Connection timeout')), 8000);
            this._onJoined = () => {
                clearTimeout(timeout);
                resolve();
            };

            this.ws.onopen = () => {
                console.log('🌐 [GameVSSimple] WebSocket connected, joining room...');
                this.send('lobby_join', {
                    roomCode: roomCode,
                    playerName: playerName,
                    sessionId: this.sessionId
                });
            };

            this.ws.onmessage = (event) => {
                let message;
                try {
                    message = JSON.parse(event.data);
                } catch (e) {
                    console.warn('🌐 [GameVSSimple] Malformed message', e);
                    return;
                }
                this.handleServerMessage(message);
            };

            this.ws.onclose = () => {
                console.log('🌐 [GameVSSimple] WebSocket disconnected');
                clearTimeout(timeout);
            };

            this.ws.onerror = (error) => {
                console.error('🌐 [GameVSSimple] WebSocket error:', error);
                clearTimeout(timeout);
                reject(new Error('WebSocket error'));
            };
        });
    }

    handleServerMessage(message) {
        const data = message.data || {};

        switch (message.type) {
            case 'lobby_joined':
                this.handleLobbyJoined(data);
                break;
            case 'room_state':
                this.handleRoomState(data);
                break;
            case 'player_joined':
                this.handlePlayerJoined(data);
                break;
            case 'player_left':
                this.handlePlayerLeft(data);
                break;
            case 'player_disconnected':
                console.log(`🎮 [GameVSSimple] Player ${data.playerId} went offline (slot held)`);
                break;
            case 'player_reconnected':
                console.log(`🎮 [GameVSSimple] Player ${data.playerName} is back`);
                break;
            case 'match_start':
                console.log('🎮 [GameVSSimple] MATCH START');
                this.matchOver = false;
                break;

            // === Combat ===
            case 'player_attack':
                this.handleRemoteAttack(data);
                // Lets a bot start the reflex that may turn into a parry.
                this.botSystem?.onAttackObserved(data);
                break;
            case 'player_hit':
                this.handlePlayerHit(data);
                break;
            case 'parry':
                this.handleParry(data);
                break;
            case 'player_death':
                this.handlePlayerDeath(data);
                break;
            case 'player_respawn':
                this.handlePlayerRespawn(data);
                break;
            case 'match_end':
                this.handleMatchEnd(data);
                break;

            // === Arrows ===
            case 'arrow_spawned':
                this.spawnArrowEntity(data.arrowId, data.ownerId, data.x, data.y, data.dirX,
                    false, data.speed, data.range, data.dirY);
                break;
            case 'arrow_stuck':
                this.handleArrowStuck(data);
                break;
            case 'arrow_picked':
                this.handleArrowPicked(data);
                break;
            case 'arrow_deflected':
                this.handleArrowDeflected(data);
                break;
            case 'arrow_dropped':
                this.handleArrowDropped(data);
                break;
            case 'arrow_removed':
                this.destroyArrow(data.arrowId);
                break;
            case 'quiver_update':
                this.applyQuiver(data);
                break;
            // === Spectres ===
            case 'spectre_spawned':
                this.spawnSpectreEntity({
                    spectreId: data.spectreId,
                    ownerId: data.ownerId,
                    targetId: data.targetId,
                    x: data.x,
                    y: data.y,
                    dirX: data.dirX
                });
                break;
            case 'spectre_ended':
                this.destroySpectre(data.spectreId);
                break;

            case 'arrow_registry':
                (data.arrows || []).forEach(a => {
                    this.spawnArrowEntity(a.arrowId, a.ownerId, a.x, a.y, a.dirX, a.stuck,
                        a.speed, a.range, a.dirY);
                });
                break;
            case 'game_state_sync':
                this.handleGameStateSync(data);
                break;
            case 'position_correction':
                this.applyPositionCorrection(data);
                break;
            case 'error':
                console.error('🌐 [GameVSSimple] Server error:', data.message);
                break;
            // Lobby chatter the arena does not care about
            case 'chat_message':
            case 'player_ready':
            case 'countdown_tick':
            case 'countdown_started':
            case 'countdown_cancelled':
            case 'wait_timer_started':
            case 'game_starting':
            case 'match_countdown':
            case 'host_changed':
            case 'pong':
                break;
            default:
                console.log('🌐 [GameVSSimple] Unhandled message:', message.type);
        }
    }

    handleLobbyJoined(data) {
        this.localPlayerId = data.playerId;
        console.log(`🎮 [GameVSSimple] Joined room ${data.roomCode} as ${data.playerName} (id ${data.playerId}, reconnected: ${!!data.reconnected})`);

        // The roster usually arrives first (server/room.go sends room_state
        // from AddPlayer, before handleLobbyJoin gets to confirm who we are),
        // so it was held back until this moment.
        if (this.pendingRoomState) {
            const pending = this.pendingRoomState;
            this.pendingRoomState = null;
            this.handleRoomState(pending);
        }

        if (this._onJoined) {
            this._onJoined();
            this._onJoined = null;
        }
    }

    /**
     * room_state carries the authoritative roster. The server builds it from a
     * Go map, whose iteration order is random, so indices (and therefore
     * colours) are derived from a sort on playerId to stay identical on every
     * client.
     */
    handleRoomState(data) {
        // Until lobby_joined tells us our own id, every entry in the roster
        // looks like somebody else - including us. Acting on it early made the
        // second player to join spawn a ghost copy of themselves, which then
        // collided with the real one.
        if (!this.localPlayerId) {
            this.pendingRoomState = data;
            return;
        }

        const players = data.players || [];
        console.log(`🎮 [GameVSSimple] Room state: ${players.length} player(s)`);

        const ordered = [...players].sort((a, b) => String(a.playerId).localeCompare(String(b.playerId)));

        this.teamMode = data.teamMode || this.teamMode;

        ordered.forEach((playerData, index) => {
            const id = playerData.playerId;
            if (playerData.team !== undefined) this.teams.set(id, playerData.team);

            if (id === this.localPlayerId) {
                if (this.localPlayer) this.applyPalette(this.localPlayer, index);
                else this.createLocalPlayerEntity(index);
                return;
            }

            const existing = this.entityForPlayer(id);
            if (existing) {
                this.applyPalette(existing, index);
                return;
            }

            // A bot is only simulated by the client that runs it. Everyone
            // else receives its position over the wire and treats it exactly
            // like a human opponent - which is why nothing downstream has to
            // know the difference.
            if (playerData.isBot && playerData.controllerId === this.localPlayerId) {
                this.createNetworkedBotEntity(id, playerData, index);
            } else {
                this.createRemotePlayerEntity(id, playerData.playerName, index);
            }
        });

        this.startBotStreaming();

        this.refreshPlayerCount();
        this.buildHud();
    }

    /**
     * Someone arrived. The entity is built from the room_state that follows.
     *
     * Nothing is created here on purpose. A fighter's slot decides its spawn
     * point and the colours it wears, and that slot comes from a sort over the
     * whole roster - which only room_state carries. Guessing it from how many
     * opponents happened to be known yet gave a different answer on different
     * machines, so the same fighter could be wearing crimson on one screen and
     * teal on another.
     */
    handlePlayerJoined(data) {
        if (!data.playerId || data.playerId === this.localPlayerId) return;
        console.log(`🎮 [GameVSSimple] Player joined: ${data.playerName}`);
    }

    /**
     * Re-dresses a fighter in the colours of the slot it now occupies.
     *
     * Slots come from a sort over the roster, so they move as the roster
     * grows: the first player in an empty room holds slot 0 until somebody
     * with a lower id arrives and takes it. Colours were fixed at the moment
     * an entity was built and never revisited, so that first player kept
     * wearing crimson while everybody else had already moved them to teal -
     * two players looking at the same fighter and seeing different clothes.
     *
     * Cheap and idempotent: it does nothing at all unless the slot changed.
     */
    applyPalette(entity, playerIndex) {
        const palette = entity.getComponent('palette');
        if (palette && palette.index === playerIndex) return;

        const colour = paletteFor(playerIndex);

        if (palette) {
            palette.index = playerIndex;
            palette.id = colour.id;
            palette.name = colour.name;
            palette.primary = colour.primary;
            palette.accent = colour.accent;
            palette.glow = colour.glow;
        }

        const nickname = entity.getComponent('nickname');
        if (nickname) nickname.color = colour.primary;

        const animation = entity.getComponent('animation');
        if (!animation || !animation.spriteSheet) return;
        if (animation.spriteSheet.src.endsWith(colour.sheet.replace('../', ''))) return;

        // A fresh Image rather than a new src on the old one: VSRender waits
        // on `initialized` before painting, and swapping the source underneath
        // a sheet it thinks is ready would show one frame of the wrong sprite.
        const sheet = new Image();
        sheet.src = colour.sheet;
        animation.spriteSheet = sheet;
        animation.initialized = false;
    }

    /**
     * Keeps the "N Players Alive" HUD honest. It was hardcoded to 4 in
     * vs_game.html and never updated, so a 2-player match still claimed four.
     */
    refreshPlayerCount() {
        const el = document.getElementById('players-alive');
        if (!el) return;

        let count = this.fighterEntities().size;

        // Once the match is running the server tells us who is still alive.
        if (this.lastAliveCount !== null && this.lastAliveCount !== undefined) {
            count = this.lastAliveCount;
        }

        el.textContent = `${count} Player${count === 1 ? '' : 's'} Alive`;
    }

    handlePlayerLeft(data) {
        const playerId = data.playerId;
        const entity = this.remotePlayers.get(playerId);

        if (entity) {
            console.log(`🎮 [GameVSSimple] Player left: ${playerId}`);
            this.audio?.forgetEntity(entity);
            this.removeEntity(entity);
            this.remotePlayers.delete(playerId);
            this.refreshPlayerCount();
            this.buildHud();
        }
    }

    /**
     * Authoritative 20Hz state broadcast.
     *
     * Remote players feed the interpolation buffer. States are stamped with the
     * local clock on purpose: the buffer compares against Date.now(), so using
     * the server clock would break interpolation whenever the two machines
     * disagree.
     */
    handleGameStateSync(data) {
        const players = data.players || [];

        let hudDirty = false;

        const alive = players.filter(p => p.isAlive !== false).length;
        if (alive !== this.lastAliveCount) {
            this.lastAliveCount = alive;
            this.refreshPlayerCount();
        }

        players.forEach(playerData => {
            const id = playerData.playerId;
            if (playerData.team !== undefined) this.teams.set(id, playerData.team);

            if (id === this.localPlayerId) {
                this.reconcileLocalPlayer(playerData);

                if (this.localPlayer && playerData.health !== undefined) {
                    const health = this.localPlayer.getComponent('health');
                    if (health && health.currentHealth !== playerData.health) {
                        health.currentHealth = playerData.health;
                        hudDirty = true;
                    }
                }
                return;
            }

            // A bot is simulated here: take the referee's word on its health
            // and whether it is alive, but never on where it is.
            const bot = this.bots.get(id);
            if (bot) {
                const botHealth = bot.getComponent('health');
                if (botHealth && playerData.health !== undefined
                    && botHealth.currentHealth !== playerData.health) {
                    botHealth.currentHealth = playerData.health;
                    hudDirty = true;
                }
                const botProperty = bot.getComponent('property');
                if (botProperty && playerData.isAlive !== undefined) {
                    botProperty.isAlive = playerData.isAlive;
                }
                return;
            }

            const entity = this.remotePlayers.get(id);
            if (!entity) return;

            const interp = entity.getComponent('interpolation');
            if (interp) {
                interp.addState({
                    x: playerData.x,
                    y: playerData.y,
                    vx: playerData.vx || 0,
                    vy: playerData.vy || 0,
                    timestamp: Date.now()
                });
            }

            const animation = entity.getComponent('animation');
            if (animation && playerData.facingRight !== undefined) {
                animation.isFlipped = !playerData.facingRight;
            }

            const health = entity.getComponent('health');
            if (health && playerData.health !== undefined && health.currentHealth !== playerData.health) {
                health.currentHealth = playerData.health;
                hudDirty = true;
            }
        });

        if (hudDirty) this.refreshHud();
    }

    /**
     * The local player is client-predicted. The server only owns the spawn
     * point, so snap to it once and then trust local physics.
     */
    reconcileLocalPlayer(playerData) {
        if (this.spawnApplied || !this.localPlayer) return;

        const pos = this.localPlayer.getComponent('position');
        if (pos) {
            pos.x = playerData.x;
            pos.y = playerData.y;
            console.log(`🎮 [GameVSSimple] Local player snapped to server spawn (${pos.x}, ${pos.y})`);
        }
        this.spawnApplied = true;
    }

    applyPositionCorrection(data) {
        if (!this.localPlayer) return;
        const pos = this.localPlayer.getComponent('position');
        const vel = this.localPlayer.getComponent('velocity');
        if (pos) { pos.x = data.x; pos.y = data.y; }
        if (vel) { vel.vx = data.vx || 0; vel.vy = data.vy || 0; }
        console.warn('🌐 [GameVSSimple] Position corrected by server');
    }

    createLocalPlayerEntity(playerIndex) {
        const spawn = this.getSpawnPoint(playerIndex);
        console.log(`🎮 [GameVSSimple] Creating local player at (${spawn.x}, ${spawn.y})`);

        const player = createLocalPlayer({
            x: spawn.x,
            y: spawn.y,
            playerName: this.playerName || 'You',
            playerId: this.localPlayerId
        }, playerIndex);

        this.addEntity(player);
        this.localPlayer = player;

        console.log('🎮 [GameVSSimple] Local player components:',
            Array.from(player.components.keys()));
    }

    /**
     * Builds a bot this client is responsible for driving.
     *
     * Same entity as an offline bot - VSBot moves it, VSBow arms it, the
     * physics systems run it - but its actions go out over the socket under
     * its own name instead of to a local arbiter. To every other client it is
     * simply another opponent.
     */
    createNetworkedBotEntity(playerId, playerData, playerIndex) {
        const spawn = this.getSpawnPoint(playerIndex);
        const bot = createBot({
            x: spawn.x,
            y: spawn.y,
            playerId,
            levelId: playerData.botLevel || 'soldier',
            name: playerData.playerName
        }, playerIndex);

        this.addEntity(bot);
        this.bots.set(playerId, bot);

        console.log(`🤖 [GameVSSimple] Running bot ${playerData.playerName} (${playerData.botLevel})`);
    }

    /**
     * Streams our bots' poses at the same rate as our own.
     *
     * The server validates them exactly as it validates a human's movement,
     * so a bot cannot be used to smuggle a position past the anti-cheat.
     */
    startBotStreaming() {
        if (this.botStreamInterval || this.arbiter) return;
        if (this.bots.size === 0) return;

        this.botStreamInterval = setInterval(() => {
            this.bots.forEach((entity, playerId) => {
                const position = entity.getComponent('position');
                const velocity = entity.getComponent('velocity');
                const animation = entity.getComponent('animation');
                if (!position || !velocity) return;

                this.send('bot_state', {
                    asPlayerId: playerId,
                    x: position.x,
                    y: position.y,
                    vx: velocity.vx,
                    vy: velocity.vy,
                    animation: animation ? (animation.currentState || 'idle') : 'idle',
                    facingRight: animation ? !animation.isFlipped : true
                });
            });
        }, 50);
    }

    /** Whether two fighters are on the same side. Nobody is, in free-for-all. */
    areAllies(a, b) {
        if (!a || !b || a === b) return false;
        const teamA = this.teams.get(a);
        const teamB = this.teams.get(b);
        return !!teamA && teamA === teamB;
    }

    createRemotePlayerEntity(playerId, playerName, playerIndex) {
        const spawn = this.getSpawnPoint(playerIndex);
        console.log(`🎮 [GameVSSimple] Creating remote player ${playerName} at (${spawn.x}, ${spawn.y})`);

        const player = createRemotePlayer({
            x: spawn.x,
            y: spawn.y,
            playerName: playerName || 'Player',
            playerId: playerId
        }, playerIndex);

        this.addEntity(player);
        this.remotePlayers.set(playerId, player);
    }

    /**
     * Mirrors initializePlayerSpawnPositions() in server/room.go so the
     * predicted spawn matches the authoritative one.
     */
    getSpawnPoint(playerIndex) {
        // Mirrors assets/maps/pvp_arena_compact.json spawnpoints (tiles x 64)
        const spawns = [
            { x: 2 * 64, y: 2 * 64 },   // P1 (128, 128)
            { x: 21 * 64, y: 2 * 64 },  // P2 (1344, 128)
            { x: 2 * 64, y: 11 * 64 },  // P3 (128, 704)
            { x: 21 * 64, y: 11 * 64 }  // P4 (1344, 704)
        ];
        return spawns[playerIndex % spawns.length];
    }

    // === Combat ===

    /** Plays another player's swing locally. Damage is the server's call. */
    handleRemoteAttack(data) {
        if (data.attackerId === this.localPlayerId) return;

        const entity = this.entityForPlayer(data.attackerId);
        if (!entity) return;

        const animation = entity.getComponent('animation');
        if (!animation) return;

        if (data.facingRight !== undefined) animation.isFlipped = !data.facingRight;

        // Which of the three sword blows it was travels with the attack, so
        // the swing everyone sees is the one the attacker actually threw -
        // and so the parry rule below has something to compare.
        const state = data.attackType === 'arrow' ? 'arrowShoot'
            : data.attackType === 'magic' ? 'magicAttack'
            : (data.swing || 'attack1');
        if (data.attackType === 'melee') entity._swingVariant = state;
        animation.setState(state);
        animation.currentFrame = 0;
        animation.frameTimer = 0;

        // Remote animation state is otherwise driven by velocity, which would
        // snap straight back to idle; hold the swing long enough to be seen.
        entity._attackHoldUntil = performance.now() + 400;
    }

    /** Applies a damage event from the server to whoever took it. */
    handlePlayerHit(data) {
        const entity = this.entityForPlayer(data.victimId);
        if (!entity) return;

        const health = entity.getComponent('health');
        if (health && data.health !== undefined) health.currentHealth = data.health;

        this.flashHit(entity);
        this.refreshHud();

        // Nothing sets a 'hurt' animation state in VS, so the sound is
        // triggered from the damage event rather than from the animation.
        if (data.victimId === this.localPlayerId) this.audio?.playHurt();

        if (data.victimId === this.localPlayerId) {
            console.log(`💥 [GameVSSimple] Took ${data.damage} damage (${data.health} HP left)`);
        }
    }

    /**
     * Two blades met inside the parry window: nobody takes damage, both
     * fighters get sparks and a metallic ring.
     *
     * The server sends the midpoint between the two attackers, which are
     * sprite origins, so lift it to roughly blade height.
     */
    handleParry(data) {
        const x = (data.x ?? 0) + 55;
        const y = (data.y ?? 0) + 45;

        this.separateSwings(data.attackerId, data.defenderId);

        spawnSparks(x, y);
        this.audio?.playClash();

        console.log('⚔️ [GameVSSimple] Parry!');
    }

    /**
     * Two blades meeting must not be the same blade twice.
     *
     * A parry is the moment worth looking at in a sword fight, and two
     * fighters frozen in an identical pose reads as a rendering fault rather
     * than a clash. Whoever's blow was answered switches to another of the
     * three, so the two silhouettes always differ.
     *
     * Every client runs this on the same pair of variants and reaches the same
     * answer, so nothing has to be sent about it.
     */
    separateSwings(attackerId, defenderId) {
        const attacker = this.entityForPlayer(attackerId);
        const defender = this.entityForPlayer(defenderId);
        if (!attacker || !defender) return;

        const theirs = attacker._swingVariant;
        const mine = defender._swingVariant;
        if (!theirs || !mine || theirs !== mine) return;

        const swapped = differentSwing(mine, theirs);
        defender._swingVariant = swapped;

        const animation = defender.getComponent('animation');
        if (!animation) return;

        animation.setState(swapped);
        animation.currentFrame = 0;
        animation.frameTimer = 0;
        defender._attackHoldUntil = performance.now() + 450;
    }

    handlePlayerDeath(data) {
        const entity = this.entityForPlayer(data.victimId);
        if (entity) {
            const property = entity.getComponent('property');
            if (property) {
                property.isAlive = false;
                property.movable = false; // VSInput stops driving them
            }

            const animation = entity.getComponent('animation');
            if (animation) animation.setState('death');

            const visual = entity.getComponent('visual');
            if (visual && visual.div) visual.div.style.opacity = '0.45';
        }

        console.log(`☠️ [GameVSSimple] ${data.victimName} killed by ${data.killerName}`);
        this.refreshHud();
    }

    handlePlayerRespawn(data) {
        const entity = this.entityForPlayer(data.playerId);
        if (!entity) return;

        const property = entity.getComponent('property');
        if (property) {
            property.isAlive = true;
            property.movable = true;
        }

        const health = entity.getComponent('health');
        if (health) health.currentHealth = data.health ?? 100;

        const position = entity.getComponent('position');
        if (position) { position.x = data.x; position.y = data.y; }

        const visual = entity.getComponent('visual');
        if (visual && visual.div) visual.div.style.opacity = '1';

        this.refreshHud();
    }

    handleMatchEnd(data) {
        if (this.matchOver) return;
        this.matchOver = true;

        const screen = document.getElementById('game-over-screen');
        const label = document.getElementById('winner-name');
        if (label) {
            label.textContent = data.winnerName ? `${data.winnerName} Wins!` : 'Draw!';
        }
        if (screen) screen.style.display = 'flex';

        console.log('🏁 [GameVSSimple] Match over:', data);
    }

    /** Brief red flash so a hit is readable without a damage number. */
    flashHit(entity) {
        const visual = entity.getComponent('visual');
        if (!visual || !visual.div) return;

        visual.div.style.filter = 'brightness(2.2) sepia(1) hue-rotate(-50deg) saturate(6)';
        clearTimeout(entity._hitFlashTimer);
        entity._hitFlashTimer = setTimeout(() => {
            visual.div.style.filter = '';
        }, 140);
    }

    entityForPlayer(playerId) {
        if (playerId === this.localPlayerId) return this.localPlayer;
        return this.remotePlayers.get(playerId) || this.bots.get(playerId) || null;
    }

    /**
     * Every fighter in the arena, keyed by player id.
     *
     * Systems that used to walk `remotePlayers` go through here instead, so a
     * bot is picked up by the same passes as a networked opponent without any
     * of them having to know the difference.
     */
    fighterEntities() {
        const all = new Map();
        if (this.localPlayerId && this.localPlayer) all.set(this.localPlayerId, this.localPlayer);
        this.remotePlayers.forEach((entity, id) => all.set(id, entity));
        this.bots.forEach((entity, id) => all.set(id, entity));
        return all;
    }

    /** Whether this machine runs the physics and decisions for a fighter. */
    simulatesFighter(playerId) {
        if (!playerId) return false;
        if (playerId === this.localPlayerId) return true;
        return this.bots.has(playerId);
    }

    /** Arrows lying on the ground, for pickup logic and for the AI to fetch. */
    plantedArrows() {
        const out = [];
        this.arrows.forEach((entity, arrowId) => {
            const arrow = entity.getComponent('arrow');
            const position = entity.getComponent('position');
            if (!arrow || !position) return;
            if (arrow.state !== 'stuck' || !arrow.isRecoverable) return;
            out.push({ arrowId, x: position.x, y: position.y, ownerId: arrow.ownerPlayerId });
        });
        return out;
    }

    // === HUD ===

    /**
     * Builds one card per player. vs_game.html ships the styles but leaves
     * #player-hud empty with a "will be dynamically generated" comment - this
     * is what generates them.
     */
    buildHud() {
        const host = document.getElementById('player-hud');
        if (!host) return;

        const ids = this.orderedPlayerIds();
        host.innerHTML = '';
        this.hudCards = new Map();

        ids.forEach((id, index) => {
            const entity = this.entityForPlayer(id);
            if (!entity) return;

            const np = entity.getComponent('networkPlayer');
            const isLocal = id === this.localPlayerId;

            const card = document.createElement('div');
            card.className = `player-card player-${index + 1}`;

            const name = document.createElement('div');
            name.className = 'player-name';
            name.textContent = (np && np.playerName) || 'Player';
            if (isLocal) name.textContent += ' (You)';
            card.appendChild(name);

            const stats = document.createElement('div');
            stats.className = 'player-stats';

            const hpRow = document.createElement('div');
            hpRow.className = 'stat-row';
            hpRow.innerHTML = '<span class="stat-label">HP</span><span class="hp-value">100</span>';
            stats.appendChild(hpRow);

            const bar = document.createElement('div');
            bar.className = 'health-bar';
            const fill = document.createElement('div');
            fill.className = 'health-fill';
            fill.style.width = '100%';
            bar.appendChild(fill);
            stats.appendChild(bar);

            let quiver = null;
            let spirit = null;
            if (isLocal) {
                quiver = document.createElement('div');
                quiver.className = 'stat-row';
                quiver.innerHTML = '<span class="stat-label">Arrows</span><span class="quiver-value">0</span>';
                stats.appendChild(quiver);

                // The spirit gauge. Only yours is shown: knowing how close an
                // opponent is to a spectre would give away the one thing that
                // makes channelling a gamble.
                const spiritRow = document.createElement('div');
                spiritRow.className = 'stat-row';
                spiritRow.innerHTML = '<span class="stat-label">Spirit</span><span class="spirit-value">0%</span>';
                stats.appendChild(spiritRow);

                const spiritBar = document.createElement('div');
                spiritBar.className = 'spirit-bar';
                spirit = document.createElement('div');
                spirit.className = 'spirit-fill';
                spirit.style.width = '0%';
                spiritBar.appendChild(spirit);
                stats.appendChild(spiritBar);

                spirit._label = spiritRow.querySelector('.spirit-value');
            }

            // The fighter's own colours, so the card and the sprite in the
            // arena are recognisably the same person.
            const paletteComponent = entity.getComponent('palette');
            if (paletteComponent) {
                card.style.borderColor = paletteComponent.primary;
                name.style.color = paletteComponent.primary;
                fill.style.backgroundColor = paletteComponent.primary;
            }

            card.appendChild(stats);
            host.appendChild(card);

            this.hudCards.set(id, { card, fill, hp: hpRow.querySelector('.hp-value'), quiver, spirit });
        });

        this.refreshHud();
    }

    refreshHud() {
        if (!this.hudCards) return;

        this.hudCards.forEach((ui, id) => {
            const entity = this.entityForPlayer(id);
            if (!entity) return;

            const health = entity.getComponent('health');
            const property = entity.getComponent('property');

            const current = health ? Math.max(0, health.currentHealth) : 0;
            const max = health ? health.maxHealth || 100 : 100;
            const pct = Math.max(0, Math.min(100, (current / max) * 100));

            ui.fill.style.width = `${pct}%`;
            ui.hp.textContent = String(current);
            ui.card.classList.toggle('dead', property ? property.isAlive === false : false);
        });

        this.refreshQuiverHud();
        this.refreshSpectreHud();
        this.refreshPlayerCount();
    }

    /**
     * Paints the spirit gauge.
     *
     * A full gauge is called out plainly - it is a resource that does nothing
     * at all until it is spent, so the player has to be told the moment it is
     * worth spending.
     */
    refreshSpectreHud() {
        if (!this.hudCards || !this.localPlayer) return;

        const ui = this.hudCards.get(this.localPlayerId);
        if (!ui || !ui.spirit) return;

        const state = this.localPlayer.getComponent('spectre_state');
        if (!state) return;

        const pct = Math.round(Math.max(0, Math.min(1, state.charge)) * 100);
        ui.spirit.style.width = `${pct}%`;
        ui.spirit.classList.toggle('ready', state.ready);

        if (ui.spirit._label) {
            ui.spirit._label.textContent = state.ready ? 'READY' : `${pct}%`;
            ui.spirit._label.style.color = state.ready ? '#9b59b6' : '#ecf0f1';
        }
    }

    refreshQuiverHud() {
        if (!this.hudCards || !this.localPlayer) return;

        const ui = this.hudCards.get(this.localPlayerId);
        if (!ui || !ui.quiver) return;

        const bowState = this.localPlayer.getComponent('bow_state');
        if (!bowState) return;

        const value = ui.quiver.querySelector('.quiver-value');
        if (value) {
            value.textContent = `${bowState.currentArrows} / ${bowState.maxArrows}`;
            value.style.color = bowState.currentArrows === 0 ? '#e74c3c' : '#ecf0f1';
        }
    }

    /** Stable ordering shared with spawn/colour assignment. */
    orderedPlayerIds() {
        return [...this.fighterEntities().keys()]
            .sort((a, b) => String(a).localeCompare(String(b)));
    }

    // === Arrows ===

    /**
     * Creates an arrow entity. Called both for our own shots and for the
     * arrow_spawned broadcasts of other players, so every client simulates
     * the same projectiles.
     */
    spawnArrowEntity(arrowId, ownerId, x, y, dirX, alreadyStuck = false, speed, range, dirY = 0) {
        if (!arrowId || this.arrows.has(arrowId)) return null;

        // The aim arrives as a vector, not a side: the arena's bow shoots up,
        // down and diagonally. An older message carrying only dirX still
        // works - dirY defaults to a flat shot.
        const direction = normaliseAim(dirX, dirY);
        // Speed and range come from how long the shooter held the draw. They
        // travel with the spawn so every client simulates the same flight.
        const entity = createArrow(x, y, direction, ownerId, speed, range);

        const arrow = entity.getComponent('arrow');
        arrow.arrowId = arrowId;
        arrow.ownerPlayerId = ownerId;

        if (alreadyStuck) {
            arrow.state = 'stuck';
            arrow.isRecoverable = true;
            const velocity = entity.getComponent('velocity');
            if (velocity) { velocity.vx = 0; velocity.vy = 0; }
        }

        this.addEntity(entity);
        this.arrows.set(arrowId, entity);
        return entity;
    }

    /**
     * Mirrors the server's quiver count.
     *
     * The client predicts a shot locally so firing feels instant, but the
     * server is the record of truth: it survives reconnections and refuses
     * shots from an empty quiver, so its number always wins.
     */
    applyQuiver(data) {
        if (data.arrows === undefined) return;

        // The server only ever addresses the recipient, so an absent playerId
        // means "you". The local arbiter names the fighter, because it manages
        // the bot's quiver too.
        const playerId = data.playerId || this.localPlayerId;
        const entity = this.entityForPlayer(playerId);
        if (!entity) return;

        const bowState = entity.getComponent('bow_state');
        if (!bowState) return;

        bowState.currentArrows = data.arrows;
        if (data.max !== undefined) bowState.maxArrows = data.max;

        if (playerId === this.localPlayerId) this.refreshQuiverHud();
    }

    /** The owner decided where its arrow landed; everyone else follows. */
    handleArrowStuck(data) {
        const entity = this.arrows.get(data.arrowId);
        if (!entity) {
            this.spawnArrowEntity(data.arrowId, null, data.x, data.y, 1, true);
            return;
        }

        const arrow = entity.getComponent('arrow');
        const position = entity.getComponent('position');
        const velocity = entity.getComponent('velocity');

        arrow.state = 'stuck';
        arrow.isRecoverable = true;
        if (position) { position.x = data.x; position.y = data.y; }
        if (velocity) { velocity.vx = 0; velocity.vy = 0; }
    }

    /**
     * Turns a live arrow into one that is dropping out of the air.
     *
     * Shared by the two ways an arrow stops flying without being consumed:
     * a sword knocking it down, and it burying itself in someone. Either way
     * it keeps falling until it finds the floor, and is then just another
     * arrow lying around.
     */
    dropArrowEntity(arrowId, x, y) {
        const entity = this.arrows.get(arrowId);
        if (!entity) return null;

        const arrow = entity.getComponent('arrow');
        const velocity = entity.getComponent('velocity');
        const position = entity.getComponent('position');
        if (!arrow || arrow.state === 'stuck') return null;

        arrow.state = 'falling';
        arrow.isRecoverable = true;
        if (position && x !== undefined && y !== undefined) { position.x = x; position.y = y; }
        if (velocity) { velocity.vx = 0; velocity.vy = 0; }

        return entity;
    }

    /**
     * The referee confirmed an arrow struck someone. It falls where it hit.
     */
    handleArrowDropped(data) {
        this.dropArrowEntity(data.arrowId, data.x, data.y);
    }

    /**
     * A sword caught an arrow in flight: it loses its momentum and drops.
     *
     * Ownership passes to whoever swatted it down, because from here on it is
     * their client that decides where it lands - the same rule that makes a
     * shooter authoritative over the arrow it fired.
     */
    handleArrowDeflected(data) {
        const entity = this.arrows.get(data.arrowId);
        if (!entity) return;

        const arrow = entity.getComponent('arrow');
        const velocity = entity.getComponent('velocity');
        const position = entity.getComponent('position');
        if (!arrow) return;

        arrow.state = 'falling';
        arrow.isRecoverable = true;
        if (data.ownerId) arrow.ownerPlayerId = data.ownerId;
        if (velocity) { velocity.vx = 0; velocity.vy = 0; }

        // Steel on steel: the same burst and ring as a parried blade.
        if (position) {
            const visual = entity.getComponent('visual');
            spawnSparks(
                position.x + (visual ? visual.width / 2 : 0),
                position.y + (visual ? visual.height / 2 : 0),
                { count: 12, spread: 70 }
            );
        }
        this.audio?.playClash();

        console.log('🏹 [GameVSSimple] Arrow knocked down');
    }

    /**
     * The server picked a winner for a contested arrow. The quiver only moves
     * here, never optimistically when walking over it.
     */
    handleArrowPicked(data) {
        this.destroyArrow(data.arrowId);

        // The quiver itself is updated by the server's quiver_update; doing
        // it here as well would count the arrow twice.
    }

    destroyArrow(arrowId) {
        const entity = this.arrows.get(arrowId);
        if (!entity) return;

        this.removeEntity(entity);
        this.arrows.delete(arrowId);

        // Let the arrow system drop its pending-pickup bookkeeping
        this.systems.forEach(sys => sys.forgetArrow && sys.forgetArrow(arrowId));
    }

    // === Spectres ===

    /**
     * Creates a spirit, for our own cast and for everyone else's.
     *
     * Like arrows, spectres are not streamed: each client builds the same one
     * from the same spawn message and homes it on the same quarry, so they
     * move in step for free. Only the caster's client rules on contact.
     */
    spawnSpectreEntity({ spectreId, ownerId, targetId, x, y, dirX }) {
        if (!spectreId || this.spectres.has(spectreId)) return null;

        const index = this.orderedPlayerIds().indexOf(ownerId);
        const palette = paletteFor(index < 0 ? 0 : index);

        const entity = createSpectre({
            spectreId,
            ownerId,
            targetId,
            x,
            y,
            dirX: dirX >= 0 ? 1 : -1,
            glow: palette.glow
        });

        this.addEntity(entity);
        this.spectres.set(spectreId, entity);
        return entity;
    }

    destroySpectre(spectreId) {
        const entity = this.spectres.get(spectreId);
        if (!entity) return;

        this.removeEntity(entity);
        this.spectres.delete(spectreId);
    }

    // === Match against the computer ===

    /**
     * Starts an offline match against an AI opponent.
     *
     * No WebSocket is involved: a VSLocalArbiter takes the server's place and
     * speaks the same protocol, so damage, the parry window, the arrow economy
     * and match end all behave exactly as they do online. The bot is an
     * ordinary fighter entity that happens to be simulated here and driven by
     * VSBot rather than by a keyboard.
     */
    startBotMatch({ levelId = 'soldier', playerName = 'You', botCount = 1 } = {}) {
        const level = getBotLevel(levelId);

        this.playerName = playerName;
        // Ids are chosen so the sort used for HUD order and colours puts the
        // human first: you are always P1 (red).
        this.localPlayerId = 'vs-p1-you';

        this.createLocalPlayerEntity(0);
        this.spawnApplied = true; // Nobody else owns our spawn

        this.teamMode = 'ffa';
        this.teams.set(this.localPlayerId, 1);

        this.arbiter = new VSLocalArbiter(this);
        this.arbiter.addFighter(this.localPlayerId, playerName, this.localPlayer);

        const count = Math.max(1, Math.min(botCount, 3));
        for (let i = 0; i < count; i++) {
            const index = i + 1;
            const spawn = this.getSpawnPoint(index);
            const botId = `vs-p${index + 1}-bot`;

            const bot = createBot({
                x: spawn.x,
                y: spawn.y,
                playerId: botId,
                levelId: level.id
            }, index);

            this.addEntity(bot);
            this.bots.set(botId, bot);
            this.teams.set(botId, index + 1);

            const np = bot.getComponent('networkPlayer');
            this.arbiter.addFighter(botId, np ? np.playerName : 'Computer', bot);
        }

        this.arbiter.start();

        console.log(`🤖 [GameVSSimple] Bot match started (${level.label})`);
    }

    /** Tells the server this client finished loading and can receive the game loop. */
    signalGameReady() {
        console.log('🎮 [GameVSSimple] Sending game_ready');
        this.send('game_ready', {});
    }

    sendPlayerState() {
        if (!this.localPlayer) return;

        // Team layouts change where everyone starts, so wait for the server's
        // spawn rather than reporting a predicted one it would reject as a
        // teleport.
        if (!this.spawnApplied) return;

        const pos = this.localPlayer.getComponent('position');
        const vel = this.localPlayer.getComponent('velocity');
        if (!pos || !vel) return;

        const animation = this.localPlayer.getComponent('animation');

        this.send('player_state', {
            x: pos.x,
            y: pos.y,
            vx: vel.vx,
            vy: vel.vy,
            animation: animation ? (animation.currentState || 'idle') : 'idle',
            facingRight: animation ? !animation.isFlipped : true
        });
    }

    /** Start streaming local state at 20Hz. */
    startNetworkSync() {
        if (this.syncInterval) clearInterval(this.syncInterval);
        this.syncInterval = setInterval(() => this.sendPlayerState(), 50);
    }

    cleanup() {
        // The arena's controls listen on the document, so they outlive the
        // game object unless they are taken down with it.
        const input = this.localPlayer && this.localPlayer.getComponent('input');
        if (input && typeof input.dispose === 'function') input.dispose();

        if (this.syncInterval) clearInterval(this.syncInterval);
        if (this.botStreamInterval) clearInterval(this.botStreamInterval);
        if (this.arbiter) this.arbiter.stop();
        if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.close();
    }
}

/**
 * Turns a reported aim into a unit vector.
 *
 * Shots used to be a side - left or right - so the wire carried dirX alone and
 * clients snapped it to +/-1. Now that the bow aims in eight directions the
 * pair has to survive the trip intact, while a message from an older client
 * carrying only dirX still means a flat shot.
 */
function normaliseAim(dirX, dirY = 0) {
    const x = Number(dirX) || 0;
    const y = Number(dirY) || 0;
    const length = Math.hypot(x, y);

    if (!length) return { x: 1, y: 0 };
    return { x: x / length, y: y / length };
}

// Export for use
window.GameVSSimple = GameVSSimple;
