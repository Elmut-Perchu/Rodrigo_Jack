// game_vs_simple.js - Simplified VS Mode Game (Independent from Adventure)
import { WS_SERVER_URL } from './core/config.js';
import { createLocalPlayer, createRemotePlayer } from './create/remote_player_create.js';
import { createTile } from './create/tile_create.js';
import { TILE_CONSTANTS } from './constants/tile_constants.js';
import { pickTile } from './constants/vs_tileset.js';
import { isArena, DEFAULT_ARENA } from './constants/vs_arenas.js';

// Import VS-specific systems
import { VSInput } from './core/systems_vs/vs_input_system.js';
import { VSGravity } from './core/systems_vs/vs_gravity_system.js';
import { VSMovement } from './core/systems_vs/vs_movement_system.js';
import { VSWrap } from './core/systems_vs/vs_wrap_system.js';
import { VSCollision } from './core/systems_vs/vs_collision_system.js';
import { VSInterpolate } from './core/systems_vs/interpolation_system.js';
import { VSRender } from './core/systems_vs/vs_render_system.js';
import { VSFighterHud } from './core/systems_vs/vs_fighter_hud_system.js';
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
import { differentSwing, HEARTS, HALVES_PER_HEART, MAX_HEALTH } from './constants/vs_combat_constants.js';
import { VS_SPECTRE } from './constants/vs_spectre_constants.js';
import { heartIcon, trophyIcon } from './core/vs_pixel_icons.js';

// Drawn once and reused by every card: the same two images for all four
// fighters, so the browser decodes them once.
const FULL_HEART = heartIcon('#e0464c');
const EMPTY_HEART = heartIcon('#3a2430');
const TROPHY_GOLD = trophyIcon('#f39c12');
// The same silhouette in slate, for a round still up for grabs: an empty row
// of these is what makes "first to six" readable at a glance.
const TROPHY_EMPTY = trophyIcon('#4a5a66');
import { paletteFor } from './constants/vs_palette.js';
import { getBotLevel } from './constants/bot_constants.js';

// Shared with the lobby so both pages present the same session identity
import { getVsSessionId } from './core/network/websocket_client.js';
import { FIXED_STEP, MAX_SUBSTEPS } from './constants/vs_movement_constants.js';

export class GameVSSimple {
    constructor() {
        this.entities = new Set();
        this.systems = [];
        this.mode = 'vs';
        this.isPaused = false;
        this.lastTime = 0;

        // Physics time owed but not yet stepped, carried between frames.
        this.accumulator = 0;

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

        // Round score. A match is a race to roundsToWin round wins, not a
        // single life - see handleRoundEnd/handleMatchEnd.
        this.roundWins = {};   // team number -> rounds won this match
        this.roundsToWin = 6;
        // Brief slow-motion beat on the round/match-deciding kill. 1 = normal
        // speed; loop() scales every system's deltaTime by this.
        this.timeScale = 1.0;
        this._slowMoTimer = null;
        this._roundBannerKeyHandler = null;
        // Has this client asked for the next round yet, and how many of the
        // others have? The score screen waits for every player, so it has to
        // know both to say anything useful.
        this.roundReadySent = false;
        this._roundReadyCount = 0;
        this._roundReadyTotal = 0;
        // Server clock -> local clock, for the interpolation timeline. Learnt
        // from the state broadcasts themselves (see serverToLocal).
        this._serverClockOffset = null;
        // The round score as the referee states it: rounds won per player id,
        // and the ids on the winning side (see absorbScore).
        this._playerWins = null;
        this._winnerIds = null;
        this._countdownHideTimer = null;
        this._freezeReleaseTimer = null;

        // Map data
        this.currentMap = null;

        console.log('🎮 [GameVSSimple] Created');
    }

    /**
     * @param {object} options  { arena } - which battlefield to load. Left
     *                          out, the default one is used; see
     *                          constants/vs_arenas.js for how the caller
     *                          decides, which matters online because every
     *                          client has to pick the same one.
     */
    async init(options = {}) {
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
        // Between the two on purpose: a body that left the arena is put back
        // in on the far side before the tiles there are consulted.
        this.addSystem(new VSWrap(this));
        this.addSystem(new VSCollision(this));
        this.arrowSystem = new VSArrow(this); // Arrow flight, impact, pickup
        this.addSystem(this.arrowSystem);
        // Opponents are placed from their buffer here, on the frame cadence
        // rather than the physics step, and so immediately before the frame
        // that draws them.
        this.addSystem(new VSInterpolate(this));
        this.addSystem(new VSRender(this));
        // After the render pass: it draws on top of the fighters, using the
        // positions that pass has just settled.
        this.addSystem(new VSFighterHud(this));
        this.audio = new VSAudio(this);       // Reads the states VSRender just set
        this.addSystem(this.audio);

        console.log('🎮 [GameVSSimple] Systems added:', this.systems.length);

        // Load the VS map
        this.arenaId = options.arena && isArena(options.arena)
            ? options.arena
            : DEFAULT_ARENA;
        await this.loadMap(this.arenaId);

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

        // The span a body travels before it comes back where it started.
        // Read from the map rather than hard-coded so a second arena of a
        // different size wraps at its own edges.
        const meta = mapData.metadata || {};
        const tileSize = meta.tileSize || TILE_CONSTANTS.SCALED_SIZE;
        this.arena = {
            width: (meta.width || 0) * tileSize,
            height: (meta.height || 0) * tileSize
        };

        // Create tiles from map data
        if (mapData.tiles) {
            this.createTilesFromData(mapData.tiles);
        }

        console.log(`🗺️ [GameVSSimple] Map loaded, entities: ${this.entities.size}`);
    }

    createTilesFromData(tilesData) {
        let tileCount = 0;

        // Reading the grid rather than the entities being built: the tile a
        // cell needs depends on its neighbours, which do not exist yet.
        const solidAt = (x, y) => {
            const row = tilesData[y];
            return !!row && row[x] === '1';
        };

        // tilesData is an array of strings like "111111111111111111111111"
        tilesData.forEach((row, y) => {
            for (let x = 0; x < row.length; x++) {
                const char = row[x];

                // '1' means solid tile, '0' means empty
                if (char === '1') {
                    // Which piece of the sheet to draw is decided by what
                    // this cell is joined to, so a ledge gets capped ends and
                    // a wall reads as a column (see constants/vs_tileset.js).
                    const [tileCol, tileRow] = pickTile(
                        solidAt(x - 1, y), solidAt(x + 1, y),
                        solidAt(x, y - 1), solidAt(x, y + 1)
                    );
                    const tileEntity = createTile(x, y, tileCol, tileRow, { solid: true });
                    this.addEntity(tileEntity);
                    tileCount++;
                }
            }
        });

        console.log(`🗺️ [GameVSSimple] Created ${tileCount} tiles`);
    }

    /**
     * One displayed frame: several physics steps, then one pass of drawing.
     *
     * Physics is stepped at a fixed rate rather than against the frame time
     * because semi-implicit Euler is not frame-rate independent - the same
     * jump measured 95px at 120fps and 84px at 20fps, an 11px spread on an
     * arena that asks for 128px steps. Whatever time is left over is carried
     * into the next frame rather than rounded away, so the simulation keeps
     * real time without its arcs depending on the screen it is played on.
     *
     * Rendering and audio sit outside the inner loop (they set fixedStep to
     * false): drawing the same sprite twice between two refreshes is work
     * nobody can see.
     */
    loop(currentTime) {
        if (this.isPaused) {
            // Time spent paused is not time the simulation owes. Without
            // this, resuming handed the physics the whole length of the pause
            // at once and the fighter lurched forward on the first frame back.
            this.lastTime = currentTime;
            this.accumulator = 0;
            requestAnimationFrame(this.loop.bind(this));
            return;
        }

        const deltaTime = (currentTime - this.lastTime) / 1000;
        this.lastTime = currentTime;

        // Cap deltaTime to prevent huge jumps
        const cappedDelta = Math.min(deltaTime, 0.05) * this.timeScale;

        this.accumulator += cappedDelta;

        let steps = 0;
        while (this.accumulator >= FIXED_STEP && steps < MAX_SUBSTEPS) {
            for (const system of this.systems) {
                if (system.fixedStep !== false) system.update(FIXED_STEP);
            }
            this.accumulator -= FIXED_STEP;
            steps++;
        }

        // Hit the ceiling: the machine is losing badly, and working through
        // the backlog would only make the next frame later still.
        if (steps === MAX_SUBSTEPS) this.accumulator = 0;

        for (const system of this.systems) {
            if (system.fixedStep === false) system.update(cappedDelta);
        }

        requestAnimationFrame(this.loop.bind(this));
    }

    /**
     * Brief slow-motion beat on the kill that decides a round or the match.
     * Scales every system's deltaTime in loop() down to `scale` for
     * `durationMs` of real time, then snaps back - a real setTimeout, so the
     * slowdown it creates cannot extend its own duration.
     */
    triggerVictorySlowMo(scale = 0.4, durationMs = 1400, onDone = null) {
        this.timeScale = scale;

        // At the instant the round is decided almost nothing this owns is
        // still moving - the loser has no knockback, remote fighters are
        // placed from a buffer stamped with the server clock, and the server
        // has already stopped its loop - so scaling time alone reads as a
        // stutter rather than a slow-motion beat. The desaturation is what
        // actually announces it.
        const world = document.querySelector('.game-world');
        if (world) world.style.filter = 'saturate(0.35) contrast(1.15)';

        clearTimeout(this._slowMoTimer);
        this._slowMoTimer = setTimeout(() => {
            this.timeScale = 1.0;
            if (world) world.style.filter = '';
            if (onDone) onDone();
        }, durationMs);
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
    connectToServer(roomCode, playerName, serverUrl = WS_SERVER_URL) {
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
            case 'round_end':
                this.handleRoundEnd(data);
                break;
            case 'round_ready_state':
                this.handleRoundReadyState(data);
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
                this.destroySpectre(data.spectreId, data.cut);
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
            case 'host_changed':
            case 'pong':
                break;
            case 'match_countdown':
                this.handleCountdown(data);
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
     * Turns a server timestamp into a local one, on a timeline that does not
     * wobble.
     *
     * States used to be stamped on arrival instead. That is defensible - the
     * two clocks are unrelated, and the buffer compares against Date.now() -
     * but it writes every hiccup of the network straight into the animation:
     * two states sent 50ms apart and arriving 5ms apart get stamped 5ms
     * apart, so the fighter is asked to cover 50ms of ground in 5ms and does
     * it in one visible hop. Those are the little jumps.
     *
     * The offset is tracked as the smallest difference seen, because the
     * least-delayed packet is the one carrying the least queueing and so the
     * closest reading of the true offset. It is allowed to creep back up very
     * slowly so that two drifting clocks are followed rather than latched
     * onto one lucky early packet for the rest of the match.
     */
    serverToLocal(serverTimestamp) {
        if (!(serverTimestamp > 0)) return Date.now();

        const sample = Date.now() - serverTimestamp;

        if (this._serverClockOffset === null || this._serverClockOffset === undefined) {
            this._serverClockOffset = sample;
        } else if (sample < this._serverClockOffset) {
            this._serverClockOffset = sample;
        } else {
            this._serverClockOffset += (sample - this._serverClockOffset) * 0.01;
        }

        return serverTimestamp + this._serverClockOffset;
    }

    /**
     * Authoritative 20Hz state broadcast.
     *
     * Remote players feed the interpolation buffer, on the server's own
     * timeline rather than on arrival times (see serverToLocal).
     */
    handleGameStateSync(data) {
        const players = data.players || [];
        const stamp = this.serverToLocal(data.timestamp);

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
                    timestamp: stamp
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

            // Their spirit gauge. Repainted only when it moved by a whole
            // percent, which is all the HUD can show anyway - at 20Hz for the
            // length of a match, the rest would be DOM writes nobody sees.
            if (playerData.spirit !== undefined) {
                const previous = entity._spirit || 0;
                entity._spirit = playerData.spirit;
                if (Math.round(previous * 100) !== Math.round(playerData.spirit * 100)) {
                    hudDirty = true;
                }
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

        // Their crossings have to be drawn the short way round, or a wrap
        // reads as a sprint back across the whole arena (see Interpolation).
        const interpolation = player.getComponent('interpolation');
        if (interpolation && this.arena) {
            interpolation.wrapWidth = this.arena.width;
            interpolation.wrapHeight = this.arena.height;
        }

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
        if (health) health.currentHealth = data.health ?? MAX_HEALTH;

        const position = entity.getComponent('position');
        if (position) { position.x = data.x; position.y = data.y; }

        const visual = entity.getComponent('visual');
        if (visual && visual.div) visual.div.style.opacity = '1';

        // setState() treats death as terminal, so without this the fighter
        // comes back still pinned on its last death frame - upright play, a
        // corpse sprite (see Animation.revive).
        const animation = entity.getComponent('animation');
        if (animation) animation.revive();
        // Killed mid-swing, the pose hold would otherwise outlive the respawn.
        entity._attackHoldUntil = 0;

        const velocity = entity.getComponent('velocity');
        if (velocity) { velocity.vx = 0; velocity.vy = 0; }

        // Remote fighters are drawn from the interpolation buffer, which still
        // holds where the body was before it fell: left alone it would glide
        // the corpse back across the arena before snapping to the new spawn.
        // reset() drops that history and pins them on the spawn until the
        // first real state arrives.
        const interp = entity.getComponent('interpolation');
        if (interp && typeof interp.reset === 'function') interp.reset(data.x, data.y);

        this.refreshHud();
    }

    /**
     * A side being reduced to nobody standing ends the round, not
     * necessarily the match (see server/game_logic.go handleRoundEnd) - the
     * match is a race to this.roundsToWin round wins. Plays the same
     * slow-motion beat as the final match-winning kill, then a transient
     * banner with the running score, and lets the server's own pause
     * (RoundIntermissionDelay) respawn everyone for the next round.
     */
    handleRoundEnd(data) {
        this.absorbScore(data);

        // The banner waits for the beat to finish: raised immediately it takes
        // the eye off the very moment the slow-motion exists to show.
        // The score screen now waits to be dismissed rather than timing out,
        // so the survivor would otherwise spend it running around an arena
        // that stopped being broadcast the moment the round ended. Held for
        // longer than any countdown, because there is no telling how long the
        // players will take; the next countdown re-arms its own short hold.
        this.freezeFighters(true, 10 * 60 * 1000);

        const title = data.reason === 'draw' ? 'Round Draw - replaying...' : `${data.winnerName} wins the round!`;
        this.triggerVictorySlowMo(0.4, 1400, () => this.showRoundBanner(title, data.winnerTeam));
    }

    handleMatchEnd(data) {
        if (this.matchOver) return;
        this.matchOver = true;

        this.absorbScore(data);

        const label = document.getElementById('winner-name');
        if (label) {
            label.textContent = data.winnerName ? `${data.winnerName} Wins the Match!` : 'Draw!';
        }
        this.renderScoreboard('match-scoreboard', data.winnerTeam);

        // The game-over panel is a near-opaque full-screen overlay: raised
        // straight away it hides the very blow the beat exists to show.
        this.triggerVictorySlowMo(0.4, 1400, () => {
            const screen = document.getElementById('game-over-screen');
            if (screen) screen.style.display = 'flex';
        });

        console.log('🏁 [GameVSSimple] Match over:', data);
    }

    /**
     * Takes the round score off a round_end or match_end message.
     *
     * Both carry the same three things: the tally per team, the same tally
     * restated per player, and who won. The per-player form is what the
     * scoreboard draws from - see renderScoreboard for why the team form is
     * no longer trusted to reach it intact.
     */
    absorbScore(data) {
        this.roundWins = data.roundWins || this.roundWins;
        if (data.roundsToWin) this.roundsToWin = data.roundsToWin;
        if (data.playerWins) this._playerWins = data.playerWins;
        this._winnerIds = data.winnerIds || null;
    }

    /**
     * The round result, and the gate to the next round.
     *
     * It does not time out. A round that restarted on a clock took the score
     * away while it was still being read, and dropped you back into the arena
     * looking at the wrong thing - so the next round now starts when the
     * players ask for it (server/room.go beginRoundIntermission), and this
     * banner is where they ask.
     */
    showRoundBanner(title, winnerTeam) {
        const banner = document.getElementById('round-banner');
        const titleEl = document.getElementById('round-banner-title');
        if (!banner || !titleEl) return;

        titleEl.textContent = title;
        this.renderScoreboard('round-scoreboard', winnerTeam);
        banner.classList.add('visible');

        this.roundReadySent = false;
        this.paintRoundHint();

        const button = document.getElementById('round-banner-continue');
        if (button) {
            button.disabled = false;
            button.onclick = () => this.askNextRound();
        }

        if (this._roundBannerKeyHandler) {
            window.removeEventListener('keydown', this._roundBannerKeyHandler);
        }

        // Movement keys auto-repeat, so a key held at the moment of the kill
        // would answer for the player before the banner had been drawn once.
        const acceptFrom = performance.now() + 400;

        const onKey = (event) => {
            if (performance.now() < acceptFrom) return;
            // Escape belongs to the pause menu even here.
            if (event.key === 'Escape') return;
            this.askNextRound();
        };

        this._roundBannerKeyHandler = onKey;
        window.addEventListener('keydown', onKey);
    }

    /** Tells the server this client has finished with the round score. */
    askNextRound() {
        if (this.roundReadySent) return;
        this.roundReadySent = true;

        const button = document.getElementById('round-banner-continue');
        if (button) button.disabled = true;

        if (this._roundBannerKeyHandler) {
            window.removeEventListener('keydown', this._roundBannerKeyHandler);
            this._roundBannerKeyHandler = null;
        }

        this.paintRoundHint();
        this.send('round_ready', {});
    }

    /**
     * How many players are still reading. Sent by the server every time one
     * of them answers, so nobody is left wondering whether the match is stuck
     * or simply waiting for someone slower.
     *
     * Recorded even when the banner is not up yet: this arrives the moment the
     * round ends, while the slow-motion beat is still playing.
     */
    handleRoundReadyState(data) {
        this._roundReadyCount = data.ready || 0;
        this._roundReadyTotal = data.total || 0;

        const banner = document.getElementById('round-banner');
        if (banner && banner.classList.contains('visible')) this.paintRoundHint();
    }

    /** The line under the button, in whichever of its four states applies. */
    paintRoundHint() {
        const ready = this._roundReadyCount || 0;
        const total = this._roundReadyTotal || 0;
        // Alone against the computer there is nobody to be counted against,
        // and a tally of one would only state the obvious.
        const others = total > 1;

        if (this.roundReadySent) {
            this.setRoundHint(others ? `Waiting for the other players... (${ready}/${total})` : 'Ready!', true);
        } else {
            this.setRoundHint(others ? `Press any key to continue (${ready}/${total} ready)` : 'Press any key to continue', false);
        }
    }

    setRoundHint(text, waiting) {
        const hint = document.getElementById('round-banner-hint');
        if (!hint) return;
        hint.textContent = text;
        hint.classList.toggle('waiting', !!waiting);
    }

    hideRoundBanner() {
        const banner = document.getElementById('round-banner');
        if (banner) banner.classList.remove('visible');

        if (this._roundBannerKeyHandler) {
            window.removeEventListener('keydown', this._roundBannerKeyHandler);
            this._roundBannerKeyHandler = null;
        }
        const button = document.getElementById('round-banner-continue');
        if (button) button.onclick = null;
    }

    /**
     * One row per present player: name, and a trophy per round they have
     * won so far. The round that was just decided highlights its winner's
     * row, on top of the running tally everyone already sees.
     */
    renderScoreboard(containerId, winnerTeam) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = '';

        // The server states the score one entry per player, and names the
        // winning side by id (see decorateScore). Looking each fighter's team
        // up in this client's own roster instead was a second copy of
        // something the referee already knew, and on the first round of a
        // match - before many state broadcasts had gone by - it credited the
        // wrong fighter. The team route is kept only for a server too old to
        // send the direct answer.
        const playerWins = this._playerWins;
        const winnerIds = this._winnerIds;

        this.orderedPlayerIds().forEach(id => {
            const entity = this.entityForPlayer(id);
            if (!entity) return;

            const np = entity.getComponent('networkPlayer');
            const name = (np && np.playerName) || 'Player';
            const team = this.teams.get(id);

            const wins = (playerWins && playerWins[id] !== undefined)
                ? playerWins[id]
                : (this.roundWins[team] || 0);

            const won = winnerIds
                ? winnerIds.indexOf(id) !== -1
                : (winnerTeam !== undefined && team === winnerTeam);

            const row = document.createElement('div');
            row.className = 'scoreboard-row';
            if (won) row.classList.add('winner');

            const label = document.createElement('span');
            label.className = 'scoreboard-name';
            label.textContent = name + (id === this.localPlayerId ? ' (You)' : '');
            row.appendChild(label);

            // One slot per round it takes to win the match, filled in as they
            // are won. Drawing only the trophies already earned told you the
            // score but not the distance left to run, which is the thing worth
            // seeing while the match is still open.
            const trophies = document.createElement('span');
            trophies.className = 'scoreboard-trophies';
            for (let i = 0; i < this.roundsToWin; i++) {
                const slot = document.createElement('span');
                const won = i < wins;
                slot.className = won ? 'trophy-icon' : 'trophy-icon empty';
                slot.style.backgroundImage = won ? TROPHY_GOLD : TROPHY_EMPTY;
                trophies.appendChild(slot);
            }
            row.appendChild(trophies);

            container.appendChild(row);
        });
    }

    /** Big "3, 2, 1, GO!" beat before a round starts - the very first one included. */
    handleCountdown(data) {
        // The next round is starting, so the score screen has done its job -
        // including for anyone whose answer arrived last.
        this.hideRoundBanner();

        // A countdown nobody has to wait for is only a decoration: until this,
        // fighters were free to run, jump and shoot all through "3, 2, 1",
        // so a round was already half-played by the time it started and no
        // two clients agreed on where anyone was standing at "GO!".
        this.freezeFighters(data.count !== 0);

        const overlay = document.getElementById('countdown-overlay');
        const number = document.getElementById('countdown-number');
        if (!overlay || !number) return;

        number.textContent = data.message;
        overlay.classList.add('visible');

        clearTimeout(this._countdownHideTimer);
        if (data.count === 0) {
            this._countdownHideTimer = setTimeout(() => overlay.classList.remove('visible'), 700);
        }
    }

    /**
     * Holds every fighter simulated here - the local player and any bot - in
     * place for the countdown.
     *
     * Gravity is deliberately left on: dropping onto the platform under the
     * spawn point during "3, 2, 1" is exactly what should happen, and it means
     * everyone is standing still on solid ground by "GO!" rather than still
     * falling through the first tick of the round.
     */
    freezeFighters(frozen, holdMs = 1500) {
        this.fighterEntities().forEach((entity) => {
            const network = entity.getComponent('networkPlayer');
            if (!network || !network.simulated) return;

            const property = entity.getComponent('property');
            if (!property) return;

            // A corpse stays a corpse: only handlePlayerRespawn hands movement
            // back, and it has its own reasons for when.
            property.movable = frozen ? false : property.isAlive !== false;

            if (!frozen) return;

            const velocity = entity.getComponent('velocity');
            if (velocity) velocity.vx = 0;

            // Otherwise a key held through the countdown is still buffered at
            // "GO!" and spends the first jump nobody asked for.
            const input = entity.getComponent('input');
            if (input) input.jump = 0;
            property.jumpBufferedAt = 0;
        });

        // Belt and braces: the thaw rides on the "GO!" beat, so a countdown
        // whose last message never arrives must not leave the arena frozen.
        clearTimeout(this._freezeReleaseTimer);
        if (frozen) {
            this._freezeReleaseTimer = setTimeout(() => this.freezeFighters(false), holdMs);
        }
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
     * One line per fighter: colour, hearts, spirit gauge - two down the left
     * edge of the arena and two down the right.
     *
     * Boxed cards said the same thing in a sixth of the screen each, and four
     * of them walled in the battlefield they were meant to be read against.
     * The line is identified by the fighter's palette rather than by their
     * nickname, because the nickname is already floating over their head in
     * the arena (see NicknameRenderSystem) while the colour is what actually
     * distinguishes four palette swaps of one sprite mid-brawl.
     */
    buildHud() {
        const columns = [
            document.getElementById('hud-left'),
            document.getElementById('hud-right')
        ];
        if (!columns[0] || !columns[1]) return;

        const ids = this.orderedPlayerIds();
        columns.forEach(column => { column.innerHTML = ''; });
        this.hudCards = new Map();

        // Split down the middle of the same stable order the spawns and the
        // palettes use, so a two-player match is one line facing another.
        const perColumn = Math.max(1, Math.ceil(ids.length / 2));

        ids.forEach((id, index) => {
            const entity = this.entityForPlayer(id);
            if (!entity) return;

            const isLocal = id === this.localPlayerId;
            const palette = entity.getComponent('palette');

            const row = document.createElement('div');
            row.className = 'hud-row';

            const colour = document.createElement('span');
            colour.className = 'hud-colour';
            // A single mark for your own line: at 10px there is no room for
            // "(You)" beside a colour name and a gauge.
            colour.textContent = (isLocal ? '▸ ' : '') + ((palette && palette.name) || `P${index + 1}`);
            if (palette) colour.style.color = palette.primary;
            row.appendChild(colour);

            // Four hearts, each of which can be half spent. A row of hearts
            // is read at a glance from across the screen; a number is not,
            // and in a fight nobody has the time to.
            const heartRow = document.createElement('div');
            heartRow.className = 'heart-row';
            const hearts = [];
            for (let i = 0; i < HEARTS; i++) {
                const heart = document.createElement('div');
                heart.className = 'heart';
                heart.style.backgroundImage = EMPTY_HEART;

                const heartFill = document.createElement('div');
                heartFill.className = 'heart-fill';
                heartFill.style.backgroundImage = FULL_HEART;
                heart.appendChild(heartFill);

                heartRow.appendChild(heart);
                hearts.push(heartFill);
            }
            row.appendChild(heartRow);

            // The quiver is not here: it is drawn above the fighter's own head
            // (see VSFighterHud), because counting your arrows is something you
            // do while aiming, and that is the worst possible moment to look
            // away at a corner of the screen.
            const spiritBar = document.createElement('div');
            spiritBar.className = 'spirit-bar';
            const spirit = document.createElement('div');
            spirit.className = 'spirit-fill';
            spirit.style.width = '0%';
            spiritBar.appendChild(spirit);
            row.appendChild(spiritBar);

            columns[index < perColumn ? 0 : 1].appendChild(row);

            this.hudCards.set(id, { card: row, hearts, spirit });
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

            // Health is carried in half-hearts, so each heart is worth two
            // and the remainder after the full ones decides the half.
            const halves = health ? Math.max(0, health.currentHealth) : 0;

            ui.hearts.forEach((heartFill, index) => {
                const left = Math.max(0, Math.min(HALVES_PER_HEART, halves - index * HALVES_PER_HEART));
                heartFill.style.width = `${(left / HALVES_PER_HEART) * 100}%`;
            });

            ui.card.classList.toggle('dead', property ? property.isAlive === false : false);
        });

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
        if (!this.hudCards) return;

        this.hudCards.forEach((ui, id) => {
            if (!ui.spirit) return;

            const entity = this.entityForPlayer(id);
            if (!entity) return;

            // A fighter simulated here - you, or a bot - carries the real
            // gauge. A networked opponent's arrives on the wire instead (see
            // sendPlayerState), because a gauge that always read zero would be
            // worse than no gauge at all.
            const state = entity.getComponent('spectre_state');
            const charge = state ? state.charge : (entity._spirit || 0);
            const ready = state ? state.ready : charge >= 1;

            const pct = Math.round(Math.max(0, Math.min(1, charge)) * 100);
            ui.spirit.style.width = `${pct}%`;
            ui.spirit.classList.toggle('ready', !!ready);
        });
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

        // Live from the first frame, unlike Adventure's arrows.
        //
        // The shared component holds a 100ms grace period so a shot does not
        // stick to the shooter's own feet. In the arena that grace is worth
        // 90 to 160px of flight - a tile and a half - during which the arrow
        // ignored everything: it slid through walls at close quarters, and a
        // shot pressed against an opponent came out the far side of them
        // without ever registering. Neither is needed here, because VSArrow
        // never lets an arrow hit the fighter who loosed it.
        arrow.collisionDelay = 0;

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

        // The quiver is drawn above the fighter by VSFighterHud, which reads
        // the count every frame, so nothing has to be repainted here.
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

    /**
     * Clears a spirit away.
     *
     * A spectre that simply ran out of time goes quietly. One that was cut
     * down bursts and rings, because somebody earned that: it is the same
     * burst and the same steel note as a parried blade, which is exactly what
     * it is - a blow answered rather than taken.
     */
    destroySpectre(spectreId, cut = false) {
        const entity = this.spectres.get(spectreId);
        if (!entity) return;

        if (cut) {
            const position = entity.getComponent('position');
            if (position) {
                spawnSparks(
                    position.x + VS_SPECTRE.DISPLAY_SIZE / 2,
                    position.y + VS_SPECTRE.DISPLAY_SIZE / 2,
                    { count: 16, spread: 90 }
                );
            }
            this.audio?.playClash();
        }

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
        // The spirit gauge travels with the position so the HUD can show a
        // real figure on every line rather than a permanent zero for anyone
        // this machine does not simulate. It does mean an opponent can watch
        // yours fill, which is a deliberate trade: a gauge you cannot trust is
        // worth less than the bluff it used to protect.
        const spectre = this.localPlayer.getComponent('spectre_state');

        this.send('player_state', {
            x: pos.x,
            y: pos.y,
            vx: vel.vx,
            vy: vel.vy,
            animation: animation ? (animation.currentState || 'idle') : 'idle',
            facingRight: animation ? !animation.isFlipped : true,
            spirit: spectre ? Math.max(0, Math.min(1, spectre.charge)) : 0
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

        // The audio system follows the volume preference for as long as it
        // lives; a finished match should stop being told about it.
        if (this.audio && typeof this.audio.dispose === 'function') this.audio.dispose();

        if (this.syncInterval) clearInterval(this.syncInterval);
        if (this.botStreamInterval) clearInterval(this.botStreamInterval);
        if (this.arbiter) this.arbiter.stop();
        if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.close();

        // Leaving mid-beat must not strand the arena desaturated.
        clearTimeout(this._slowMoTimer);
        this.timeScale = 1.0;
        const world = document.querySelector('.game-world');
        if (world) world.style.filter = '';

        if (this._roundBannerKeyHandler) {
            window.removeEventListener('keydown', this._roundBannerKeyHandler);
            this._roundBannerKeyHandler = null;
        }
        clearTimeout(this._countdownHideTimer);
        clearTimeout(this._freezeReleaseTimer);
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
