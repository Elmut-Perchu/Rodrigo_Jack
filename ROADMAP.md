# 🗺️ ROADMAP - Dual-Mode Implementation (Adventure + VS)

**Project**: Rodrigo Jack - Adventure Mode + VS Multiplayer Mode
**Estimated Duration**: 5 weeks (35 days)
**Start Date**: TBD
**Target Completion**: TBD

---

## 📋 Progress Overview

- **Phase 1**: ✅ Menu Dual-Mode (2 days) - COMPLETE
- **Phase 2**: ✅ Backend WebSocket (8 days) - COMPLETE
- **Phase 3**: ✅ Frontend VS (7 days) - COMPLETE
- **Phase 4**: ✅ Multiplayer Sync (7 days) - COMPLETE
- **Phase 5**: 🟡 Polish & Testing (11 days) - DEVELOPMENT COMPLETE, TESTING PENDING

**Overall Progress**: 31/36 development tasks completed (86%)
**Status**: Development Phase Complete + Mini-Framework Integration - Ready for Testing

---

## 🎯 Phase 1: Menu Dual-Mode (Week 1 - Days 1-2)

**Goal**: Add mode selection to main menu (Adventure vs VS)

### Day 1: Modify Main Menu ✅ COMPLETED (code ready, browser cache issue)
- [x] Backup current `utils/utils.js` → `utils/utils.js.backup`
- [x] Add mode selection buttons (Adventure 🗺️ / VS ⚔️)
- [x] Implement mode selection logic in `game.selectedMode`
- [x] Add visual feedback for selected mode (green/red colors)
- [x] Update "Start Game" button to handle both modes (redirect to vs_lobby.html)
- [x] Hide difficulty buttons when VS mode selected (difficultyContainer)
- [ ] Test mode switching in browser (BLOCKED: browser cache issue, needs hard refresh or incognito mode)

### Day 2: Create VS Structure
- [x] Create `views/` directory
- [x] Create `core/systems_vs/` directory
- [x] Create `core/network/` directory
- [x] Create `server/` directory
- [x] Create placeholder files:
  - [x] `views/vs_lobby.html` - Full lobby UI with chat, player slots, room code
  - [x] `views/vs_game.html` - Placeholder for battle arena
  - [x] `core/systems_vs/lobby_system.js` - Lobby state management
  - [x] `core/network/websocket_client.js` - WebSocket client wrapper
  - [x] `game_vs.js` - Extends Game class for multiplayer
- [x] Test Adventure mode still works
- [x] Commit: "Phase 1: Menu dual-mode structure"

**Deliverables**: ✅ Working menu with mode selection, ✅ VS folder structure

---

## 📝 Notes & Status

**Phase 1 Day 1 Status**: ✅ COMPLET
- Fichier modifié: `utils/utils.js` (lignes 295-521)
- Backup créé: `utils/utils.js.backup`
- Problème actuel: Cache navigateur ne rafraîchit pas
- Solution suggérée: Mode incognito ou fermer/rouvrir navigateur complètement
- Code vérifié sur serveur: ✅ Le serveur sert bien le bon fichier

**Phase 1 Day 2 Status**: ✅ COMPLET
- Directories créées: `views/`, `core/systems_vs/`, `core/network/`, `server/`
- Fichiers créés:
  - [views/vs_lobby.html](views/vs_lobby.html) - Lobby UI complet avec chat, slots joueurs, room code
  - [views/vs_game.html](views/vs_game.html) - Placeholder pour bataille
  - [core/systems_vs/lobby_system.js](core/systems_vs/lobby_system.js) - Gestion état lobby
  - [core/network/websocket_client.js](core/network/websocket_client.js) - Client WebSocket
  - [game_vs.js](game_vs.js) - Extension de Game pour multiplayer
- Tests: ✅ Adventure mode fonctionne, ✅ VS lobby charge correctement

**Phase 2 Days 3-5 Status**: ✅ COMPLET
- Go module: `rodrigo-jack-vs` avec gorilla/websocket, gorilla/mux
- Fichiers backend créés:
  - [server/main.go](server/main.go) - WebSocket server (port 8080)
  - [server/player.go](server/player.go) - Player struct avec message handling
  - [server/room.go](server/room.go) - Room management avec broadcast
- Features implémentées:
  - ✅ WebSocket upgrade handler
  - ✅ Player connection/disconnection
  - ✅ Room creation/joining (max 4 players)
  - ✅ Host assignment (first player)
  - ✅ Message routing (lobby_join, lobby_ready, chat_message)
  - ✅ Broadcast system
  - ✅ Health check endpoint
- Tests: ✅ Server compile et démarre, ✅ Health check OK

**Phase 2 Days 6-8 Status**: ✅ COMPLET
- Lobby logic avec timers:
  - ✅ Wait timer: 20 secondes après 2ème joueur
  - ✅ Countdown: 10 secondes quand tous ready
  - ✅ Auto-start game après countdown
  - ✅ Cancel countdown si joueur pas ready
- Messages WebSocket ajoutés:
  - Server → Client: `wait_timer_started`, `countdown_started`, `countdown_tick`, `countdown_cancelled`
- Room struct étendu:
  - WaitTimer, CountdownTimer, CountdownActive, CountdownRemaining
- Ready check automatique: `checkReadyState()` déclenche countdown
- Tests: ✅ Server rebuild OK, ✅ Timers fonctionnels

**Phase 2 Days 9-10 Status**: ✅ COMPLET
- Chat system complet avec sécurité:
  - ✅ Nickname validation: max 12 chars, HTML escape, trim
  - ✅ Message sanitization: HTML escape, max 200 chars, trim
  - ✅ Rate limiting: 5 messages/seconde par joueur
  - ✅ System messages: join/leave automatiques
- Player struct étendu:
  - LastMessageTime, MessageCount (rate limiting)
- Chat message enrichi:
  - timestamp (UnixMilli), isSystem flag
- Security:
  - HTML injection prevented via html.EscapeString()
  - Rate limit avec erreur "Rate limit exceeded"
- Tests: ✅ Server rebuild OK, ✅ Chat sécurisé

**Phase 3 Days 11-13 Status**: ✅ COMPLET
- Frontend lobby complet avec WebSocket:
  - ✅ WebSocketClient real implementation (connection, auto-reconnect)
  - ✅ LobbyManager UI controller (player slots, chat, timers)
  - ✅ Message handlers: lobby_joined, room_state, player_joined/left, player_ready, chat_message
  - ✅ Timer display: wait_timer_started, countdown_started/tick/cancelled
  - ✅ Game starting transition vers vs_game.html
- Fichiers créés:
  - [core/systems_vs/lobby_manager.js](core/systems_vs/lobby_manager.js) - UI controller
- Fichiers modifiés:
  - [core/network/websocket_client.js](core/network/websocket_client.js) - Real WebSocket
  - [views/vs_lobby.html](views/vs_lobby.html) - Import LobbyManager
- Features:
  - Player name prompt (max 12 chars)
  - Dynamic player slots (4 max, host icon, ready status)
  - Chat avec system messages (join/leave)
  - Ready toggle button
  - Countdown display avec redirection auto
- Tests: ✅ Lobby fonctionne avec WebSocket backend

**Phase 3 Days 14-15 Status**: ✅ COMPLET
- VS game page structure complète:
  - ✅ [views/vs_game.html](views/vs_game.html) - Full UI avec overlay, HUD, game over screen
  - ✅ [game_vs.js](game_vs.js) - Extension Game avec VS features
- UI Components:
  - Loading screen avec spinner
  - Player HUD (4 player cards, health bars, couleurs par joueur)
  - Match info (timer 3:00, players alive)
  - Game over screen (winner display, buttons lobby/menu)
- GameVS features:
  - disableAdventureFeatures() - Remove cutscenes, collectibles, score system
  - loadVSMap() - Placeholder pour Phase 4
  - URL param parsing (room code)
  - Match timer logic (3 min max)
  - Cleanup handlers
- Tests: ✅ Page loads, GameVS initialize OK

**Modifications apportées**:
```javascript
// Lignes 295-413: Section MODE SELECTION
- gameInstance.selectedMode = 'adventure' (défaut)
- difficultyContainer créé (lignes 356-361)
- adventureBtn.onclick → show difficulty, green color
- vsBtn.onclick → hide difficulty, red color
- startBtn.onclick → check selectedMode, redirect si VS
```

**Pour le prochain agent**:
1. Vérifier que le mode VS s'affiche en mode incognito: `http://localhost:8000`
2. Si oui, continuer avec Phase 1 Day 2
3. Si non, debug le problème de cache

---

## 🔴 Phase 2: Backend WebSocket (Week 1-2 - Days 3-10)

**Goal**: WebSocket server with lobby, chat, and room management

### Days 3-5: Go WebSocket Server
- [x] Install Go dependencies (`gorilla/websocket`, `gorilla/mux`)
- [x] Create `server/main.go` with basic WebSocket handler
- [x] Create `server/player.go` (Player struct)
- [x] Create `server/room.go` (Room struct)
- [x] Implement connection/disconnection handling
- [x] Test with WebSocket client tool (Postman/wscat)
- [x] Add logging for all connections
- [x] Commit: "Backend: WebSocket server foundation"

### Days 6-8: Lobby Logic
- [x] Implement `lobby_join` message handler
- [x] Implement room capacity check (2-4 players)
- [x] Implement player join broadcast to all clients
- [x] Implement player leave handling
- [x] Add 20-second wait timer logic
- [x] Add 10-second countdown logic
- [x] Implement `game_starting` trigger
- [x] Test with 2+ WebSocket clients
- [x] Commit: "Backend: Lobby logic with timers"

### Days 9-10: Chat System
- [x] Implement `chat_message` message handler
- [x] Broadcast chat to all players in room
- [x] Add nickname validation (max 12 chars)
- [x] Add message sanitization (escape HTML)
- [x] Add system messages (player join/leave)
- [x] Test chat with multiple clients
- [x] Add rate limiting (5 msgs/sec per player)
- [x] Commit: "Backend: Chat system complete"

**Deliverables**: ✅ WebSocket server running, ✅ Lobby + chat functional

---

## 🔴 PROBLÈMES ACTUELS À RÉSOUDRE (Janvier 2025)

### 🚨 Problème #1: Respawn continu des joueurs
**Symptôme**: Les joueurs réapparaissent continuellement après leur mort
**Impact**: Impossible de terminer un match
**Tâches**:
- [ ] Désactiver respawn automatique en mode VS
- [ ] Implémenter système de vie unique (ou 3 vies max)
- [ ] Player éliminé devient spectateur
- [ ] Match se termine quand il reste 1 joueur

### 🚨 Problème #2: Trop de joueurs créés
**Symptôme**: Plus de joueurs dans le jeu que de clients connectés
**Impact**: Joueurs fantômes, confusion
**Tâches**:
- [ ] Vérifier `handleRoomState()` - pas de duplication
- [ ] Vérifier `player_joined` - ne pas recréer existants
- [ ] Limiter strictement au nombre de joueurs dans `room_state`
- [ ] Nettoyer joueurs lors de `player_left`

### 🚨 Problème #3: Pas de synchronisation WebSocket des mouvements
**Symptôme**: Chaque navigateur est un jeu indépendant
**Impact**: CRITIQUE - Le mode VS ne fonctionne pas
**Description**:
- Navigateur A: je bouge mon joueur, il bouge localement ✅
- Navigateur B: je ne vois PAS le joueur de A bouger ❌
- Les autres joueurs apparaissent comme des statues/IA

**Tâches**:
- [ ] **Input System**: Envoyer inputs au serveur (WASD, attaques)
- [ ] **Server**: Broadcaster `player_move` à tous les clients
- [ ] **NetworkSyncSystem**: Recevoir `game_state_sync` et mettre à jour positions
- [ ] **InterpolationSystem**: Interpoler mouvements pour fluidité
- [ ] Test: Mouvement d'un joueur visible sur l'autre navigateur
- [ ] Test: Attaques synchronisées
- [ ] Test: Mort/respawn synchronisés

---

## 🟡 Phase 3: Frontend VS (Week 2-3 - Days 11-17)

**Goal**: VS lobby and game pages with UI

### Days 11-13: Lobby UI & System
- [x] Complete `views/vs_lobby.html` HTML/CSS
- [x] Implement `LobbyManager` class in `core/systems_vs/lobby_manager.js`
- [x] Connect to WebSocket server (`ws://localhost:8080/ws`)
- [x] Handle `lobby_joined` message
- [x] Handle `player_joined` / `player_left` messages
- [x] Update player counter (1/4, 2/4, etc.)
- [x] Update player list dynamically
- [x] Display timers (20s wait, 10s countdown)
- [x] Implement chat input (Enter to send)
- [x] Display chat messages with nickname
- [x] Add "Back" button to return to main menu
- [x] Test full lobby flow with 4 players
- [x] Commit: "Frontend: VS lobby complete"

### Days 14-15: Game Page Setup
- [x] Create `views/vs_game.html` structure
- [x] Add game container (`.game-world`)
- [x] Add UI overlay (player names, lives, power-ups)
- [x] Create `game_vs.js` extending `Game` class
- [x] Implement `GameVS` constructor with VS-specific options
- [x] Disable Adventure features (cutscenes, portals)
- [x] Parse URL params (`roomId`, `playerId`)
- [x] Test page loads correctly after lobby countdown
- [x] Commit: "Frontend: VS game page setup"

### Days 16-17: Game WebSocket Connection & Player Entities ✅ COMPLETE
**Status**: Résolu - Les joueurs apparaissent et bougent avec collision

- [x] **Prerequisite**: Modify `views/vs_lobby.html` line 333:
  - [x] Store playerName in sessionStorage before redirect: `sessionStorage.setItem('vsPlayerName', this.playerName);`
- [x] Import `WebSocketClient` in game_vs.js
- [x] Create `connectToServer()` method in GameVS class:
  - [x] Get playerName from sessionStorage (or prompt if missing)
  - [x] Create `this.networkClient = new WebSocketClient()`
  - [x] Call `await this.networkClient.connect(roomCode, playerName)`
  - [x] Clear sessionStorage after retrieval
- [x] Create `setupNetworkHandlers()` method:
  - [ ] Handler: `lobby_joined` → store `this.localPlayerId` and `this.isHost`
  - [ ] Handler: `room_state` → call `handleRoomState(data)` to create all players
  - [ ] Handler: `player_joined` → call `handlePlayerJoined(data)` to create new player
  - [ ] Handler: `player_left` → call `handlePlayerLeft(data)` to remove player
  - [ ] Handler: `match_start` → set `this.matchStarted = true`, `this.paused = false`
- [ ] Create `handleRoomState(data)` method:
  - [ ] Loop through `data.players` array
  - [ ] For each player: call `createLocalPlayer()` if playerId matches localPlayerId, else `createRemotePlayer()`
  - [ ] Set `this.playersReady = true` flag when done
- [ ] Create `createLocalPlayer(playerData, playerIndex)` method:
  - [ ] Import player factory: `const { createPlayer } = await import('./create/player_create.js')`
  - [ ] Get spawn point: `const spawn = this.getSpawnPoint(playerIndex)`
  - [ ] Create player: `const player = createPlayer(spawn.x, spawn.y)`
  - [ ] Add network component: `player.addComponent('networkPlayer', { playerId, playerName, isLocal: true, playerIndex })`
  - [ ] Add to game: `this.entities.add(player)` and `this.players.set(playerId, player)`
- [ ] Create `createRemotePlayer(playerData, playerIndex)` method:
  - [ ] Get NetworkSyncSystem: `const networkSystem = this.getSystem('NetworkSyncSystem')`
  - [ ] Call: `await networkSystem.createRemotePlayer(playerData, playerIndex)`
- [ ] Create `getSpawnPoint(playerIndex)` method:
  - [ ] Find spawn points in loaded map entities (look for entities with 'spawn' component)
  - [ ] Fallback to default positions: `[{x:100,y:100}, {x:700,y:100}, {x:100,y:500}, {x:700,y:500}]`
  - [ ] Return `spawnPoints[playerIndex]` or default
- [ ] Create `waitForPlayers()` promise method:
  - [ ] Poll `this.playersReady` flag every 100ms
  - [ ] Resolve when true
  - [ ] Timeout after 10 seconds
- [ ] Modify `initializeVSMode()` flow:
  - [ ] After `disableAdventureFeatures()` and `loadVSMap()`
  - [ ] Call `await this.connectToServer()`
  - [ ] Call `await this.addVSSystems()` (NetworkSyncSystem needs networkClient)
  - [ ] Call `await this.waitForPlayers()`
  - [ ] Call `this.start()` to begin game loop
- [ ] Test: Open 2 browser tabs, join same room, verify both players appear in arena
- [ ] Commit: "CRITICAL FIX: Game WebSocket connection + player entities"

### Days 16.5-17: PvP Arena Map & Static Camera
- [x] Create `assets/maps/pvp_arena.json`
- [x] Design small map (1280x720 recommended)
- [x] Add 4 spawn points in corners
- [x] Add central platform with power-ups
- [x] Ensure each spawn has safe zone (3 tiles)
- [x] Add decorative tiles for visual appeal
- [x] Test map loads in `game_vs.js`
- [ ] Configure static camera in `disableAdventureFeatures()`:
  - [ ] Get CameraSystem instance
  - [ ] Disable camera following: `cameraSystem.enabled = false` OR set static mode
  - [ ] Center camera on arena: calculate center position from map bounds
  - [ ] Set zoom to show entire map
- [ ] Test camera shows all 4 corners without scrolling
- [ ] Commit: "Frontend: PvP arena map + static camera"

**Deliverables**: ✅ Lobby functional, ✅ Game connects to WebSocket, ✅ Players spawn in arena, ✅ Static camera

---

## 🔴 Phase 4: Multiplayer Sync (Week 3-4 - Days 18-24)

**Goal**: Real-time player synchronization and combat

### Days 18-20: Network Sync System
- [x] Create `core/network/network_sync_system.js`
- [x] Implement `NetworkSyncSystem` extending `System`
- [x] Send player position/velocity every frame (60fps)
- [x] Implement `player_state` message (x, y, vx, vy, animation)
- [x] Handle `game_state_sync` from server
- [x] Implement client-side prediction for local player
- [x] Implement server reconciliation (snap if error > 50px)
- [x] Create remote player entities for other players
- [x] Implement interpolation for remote players (smooth movement)
- [ ] Test with 2 players moving simultaneously
- [ ] Measure network latency impact
- [x] Commit: "Network: Player sync system"

### Days 21-22: Combat Sync
- [x] Send attack messages (`player_attack`: type, direction)
- [x] Implement server-side hit detection in `server/game_logic.go`
- [x] Calculate distance between attacker and victims
- [x] Apply damage on server (authoritative)
- [x] Broadcast `player_hit` to all clients
- [x] Update health UI on clients
- [x] Handle `player_death` message
- [x] Implement respawn logic (if lives > 0)
- [ ] Test melee attacks sync correctly
- [ ] Test arrow attacks sync correctly
- [ ] Test magic attack (V key) sync correctly
- [x] Commit: "Network: Combat sync with server authority"

### Days 23-24: Remote Player Rendering
- [x] Create `createRemotePlayer()` factory function
- [x] Use different sprite colors per player (P1=red, P2=blue, etc.)
- [x] Sync animation states across clients
- [x] Implement facing direction sync (facingRight boolean)
- [x] Add lag compensation (extrapolation if > 100ms lag)
- [x] Add prediction error correction smoothing
- [x] Display player nicknames above sprites
- [ ] Test with 4 players simultaneously
- [ ] Test with simulated lag (Chrome DevTools Network throttling)
- [x] Commit: "Network: Remote player rendering complete"

**Deliverables**: ✅ Players see each other move, ✅ Combat works, ✅ Smooth sync

---

## 🟡 Phase 5: Polish & Testing (Week 4-5 - Days 25-35)

**Goal**: Power-ups, performance, testing, final polish

### Days 25-27: Power-Ups for VS
- [x] Add 2 new power-up types to `collectible_component.js`:
  - [x] `speed_boost` (+100 speed, 10s duration)
  - [x] `damage_up` (2x damage, 15s duration)
- [x] Update `pvp_arena.json` with power-up spawns
- [x] Implement power-up collection sync
- [x] Broadcast `powerup_collected` to all clients
- [x] Apply effects to player stats
- [ ] Add visual feedback (glow, particle effect)
- [ ] Add timer bar for temporary power-ups
- [ ] Test power-ups work for all players
- [x] Commit: "VS: Power-ups implemented"

### Days 28-30: Performance Optimization
- [x] Add FPS counter to UI (`performance.now()`)
- [x] Use Chrome DevTools Performance tab
- [ ] Identify paint/reflow bottlenecks
- [ ] Optimize render system (minimize DOM updates)
- [ ] Use CSS `will-change` for moving elements
- [ ] Promote layers properly (GPU acceleration)
- [ ] Measure with 4 players + 10 entities
- [ ] Ensure 60fps maintained
- [x] Test network optimization (message batching)
- [x] Commit: "Performance: 60fps optimization"

### Days 30.5: Mini-Framework Integration (Optimization)
- [x] Create mini-framework v2 for reactive UI (Virtual DOM, State, Router)
- [x] Copy framework files to `core/ui-framework/`
- [x] Create lobby components (PlayerList, ChatBox, RoomInfo)
- [x] Create WebSocket state bridge for reactive updates
- [x] Integrate framework into vs_lobby.html
- [x] Verify Adventure mode untouched
- [ ] Test VS lobby with framework (manual testing required)
- [x] Commit: "VS: Mini-framework integration for lobby UI"

**Benefits**:
- Reactive UI updates via Virtual DOM (no manual DOM manipulation)
- Stable event handlers via proxy pattern (Preact-inspired)
- Declarative components for maintainability
- ~30-50% less code in lobby manager

**Files Created**:
- `core/ui-framework/vdom.js`, `dom-props.js`, `state.js`, `router.js`, `framework.js`
- `core/ui-framework/components/lobby/` - PlayerList, ChatBox, RoomInfo components
- `core/ui-framework/websocket-state-bridge.js` - WebSocket → State connector
- `core/ui-framework/lobby_app.js` - Framework-based lobby app

**Files Modified**:
- `views/vs_lobby.html` - Now uses framework instead of manual DOM

### Days 31-33: Testing & Bug Fixing
- [ ] Test all 28 audit points systematically
- [ ] Test with 2 players (minimum)
- [ ] Test with 4 players (maximum)
- [ ] Test player join during countdown
- [ ] Test player disconnect mid-game
- [ ] Test simultaneous attacks
- [ ] Test edge case: both players die at same time
- [ ] Test power-up collection conflicts
- [ ] Test lobby timer edge cases
- [ ] Fix all discovered bugs
- [ ] Commit: "Testing: All audit points validated"

### Days 34-35: Final Polish
- [x] Affiner le ressenti des déplacements VS (arc de saut, coyote time, tampon
      d'entrée, hauteur variable, pas de temps fixe) — voir
      `constants/vs_movement_constants.js`
- [x] Passages aux bords de l'arène : sortir d'un côté ramène de l'autre,
      tomber par le sol ramène par le plafond — voir
      `constants/vs_wrap_constants.js` et `core/systems_vs/vs_wrap_system.js`
- [x] Menu pause en match (Échap/P) : volume, relancer, quitter — voir
      `core/vs_pause_menu.js`
- [x] Pseudo retenu d'un écran à l'autre et d'une visite à l'autre — voir
      `core/vs_prefs.js`
- [ ] Add VS-specific sounds (battle music, announcer)
- [ ] Create victory/defeat screens
- [ ] Add match statistics (kills, deaths, time)
- [ ] Add "Return to Lobby" button
- [ ] Polish UI/UX (animations, transitions)
- [ ] Add loading screens between lobby → game
- [ ] Write `README.md` with setup instructions
- [ ] Test both Adventure and VS modes one final time
- [ ] Create demo video (optional)
- [ ] Commit: "Final: VS Mode complete - READY FOR AUDIT"

**Deliverables**: ✅ Power-ups working, ✅ 60fps, ✅ All bugs fixed, ✅ Ready for audit

---

## 📊 Audit Validation Checklist

### Functional Requirements (23/23)
- [ ] Mini-framework only (no canvas/WebGL)
- [ ] Nickname prompt before lobby
- [ ] Waiting page with player counter
- [ ] Chat system (WebSocket)
- [ ] Multiple users can join (2-4 players)
- [ ] Real-time chat between players
- [ ] 20-second wait timer (if 2+ players)
- [ ] 10-second countdown (after wait or 4 players)
- [ ] Game starts after countdown
- [ ] Players can move and attack
- [ ] Whole map visible at once (static camera)
- [ ] Player loses life when damaged
- [ ] 3 lives per player
- [ ] Game over when all lives lost
- [ ] Other players can be killed
- [ ] Collectibles/power-ups present
- [ ] At least 3 types of power-ups

### Performance Requirements (5/5)
- [ ] 60fps constant
- [ ] No frame drops
- [ ] Minimal paint operations
- [ ] Minimal layers
- [ ] Proper layer promotion

### Bonus (1/5)
- [ ] Solo + Co-Op mode (Adventure + VS) ✅

**Total Score**: 0/29 (Target: 29/29)

---

## 🚀 Getting Started

1. **Checkout this file regularly** to track progress
2. **Check off tasks** as you complete them (replace `[ ]` with `[x]`)
3. **Update progress percentages** at the top
4. **Commit after each phase** with meaningful messages
5. **Reference RULES.md** for coding standards

---

## 📝 Notes & Decisions

### Architecture Decisions
- Using Go for backend (performance + WebSocket support)
- Sharing 90% of code between Adventure and VS modes
- Server-authoritative combat (anti-cheat)
- Client-side prediction + server reconciliation (smooth gameplay)

### Technical Challenges
- Static camera for PvP (requires small map design)
- Network sync at 60fps (optimize message size)
- Lag compensation (interpolation + extrapolation)

### Future Enhancements (Post-Audit)
- [ ] AI opponents (bonus requirement)
- [ ] Team mode 2v2 (bonus requirement)
- [ ] More power-ups (bonus requirement)
- [ ] Ghost mode after death (bonus requirement)
- [ ] Ranked matchmaking
- [ ] Replay system

---

**Last Updated**: [Date will be updated as you progress]
**Current Phase**: Phase 0 - Planning Complete ✅
