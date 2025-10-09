# 🗺️ ROADMAP - Dual-Mode Implementation (Adventure + VS)

**Project**: Rodrigo Jack - Adventure Mode + VS Multiplayer Mode
**Estimated Duration**: 5 weeks (35 days)
**Start Date**: TBD
**Target Completion**: TBD

---

## 📋 Progress Overview

- **Phase 1**: 🟡 Menu Dual-Mode (2 days) - IN PROGRESS
- **Phase 2**: ⬜ Backend WebSocket (8 days)
- **Phase 3**: ⬜ Frontend VS (7 days)
- **Phase 4**: ⬜ Multiplayer Sync (7 days)
- **Phase 5**: ⬜ Poll & Testing (11 days)

**Overall Progress**: 6/35 tasks completed (17%)

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
- [ ] Implement `chat_message` message handler
- [ ] Broadcast chat to all players in room
- [ ] Add nickname validation (max 12 chars)
- [ ] Add message sanitization (escape HTML)
- [ ] Add system messages (player join/leave)
- [ ] Test chat with multiple clients
- [ ] Add rate limiting (5 msgs/sec per player)
- [ ] Commit: "Backend: Chat system complete"

**Deliverables**: ✅ WebSocket server running, ✅ Lobby + chat functional

---

## 🟡 Phase 3: Frontend VS (Week 2-3 - Days 11-17)

**Goal**: VS lobby and game pages with UI

### Days 11-13: Lobby UI & System
- [ ] Complete `views/vs_lobby.html` HTML/CSS
- [ ] Implement `LobbyManager` class in `core/systems_vs/lobby_system.js`
- [ ] Connect to WebSocket server (`ws://localhost:8080/ws`)
- [ ] Handle `lobby_joined` message
- [ ] Handle `player_joined` / `player_left` messages
- [ ] Update player counter (1/4, 2/4, etc.)
- [ ] Update player list dynamically
- [ ] Display timers (20s wait, 10s countdown)
- [ ] Implement chat input (Enter to send)
- [ ] Display chat messages with nickname
- [ ] Add "Back" button to return to main menu
- [ ] Test full lobby flow with 4 players
- [ ] Commit: "Frontend: VS lobby complete"

### Days 14-15: Game Page Setup
- [ ] Create `views/vs_game.html` structure
- [ ] Add game container (`.game-world`)
- [ ] Add UI overlay (player names, lives, power-ups)
- [ ] Create `game_vs.js` extending `Game` class
- [ ] Implement `GameVS` constructor with VS-specific options
- [ ] Disable Adventure features (cutscenes, portals)
- [ ] Parse URL params (`roomId`, `playerId`)
- [ ] Test page loads correctly after lobby countdown
- [ ] Commit: "Frontend: VS game page setup"

### Days 16-17: PvP Arena Map
- [ ] Create `assets/maps/pvp_arena.json`
- [ ] Design small map (1280x720 recommended)
- [ ] Add 4 spawn points in corners
- [ ] Add central platform with power-ups
- [ ] Ensure each spawn has safe zone (3 tiles)
- [ ] Add decorative tiles for visual appeal
- [ ] Test map loads in `game_vs.js`
- [ ] Implement `StaticCamera` system (`core/systems/camera_system_static.js`)
- [ ] Set camera bounds to show entire map
- [ ] Test camera shows all 4 corners
- [ ] Commit: "Frontend: PvP arena map + static camera"

**Deliverables**: ✅ Lobby functional, ✅ Game page ready, ✅ PvP map

---

## 🔴 Phase 4: Multiplayer Sync (Week 3-4 - Days 18-24)

**Goal**: Real-time player synchronization and combat

### Days 18-20: Network Sync System
- [ ] Create `core/network/network_sync_system.js`
- [ ] Implement `NetworkSyncSystem` extending `System`
- [ ] Send player position/velocity every frame (60fps)
- [ ] Implement `player_state` message (x, y, vx, vy, animation)
- [ ] Handle `game_state_sync` from server
- [ ] Implement client-side prediction for local player
- [ ] Implement server reconciliation (snap if error > 50px)
- [ ] Create remote player entities for other players
- [ ] Implement interpolation for remote players (smooth movement)
- [ ] Test with 2 players moving simultaneously
- [ ] Measure network latency impact
- [ ] Commit: "Network: Player sync system"

### Days 21-22: Combat Sync
- [ ] Send attack messages (`player_attack`: type, direction)
- [ ] Implement server-side hit detection in `server/game_logic.go`
- [ ] Calculate distance between attacker and victims
- [ ] Apply damage on server (authoritative)
- [ ] Broadcast `player_hit` to all clients
- [ ] Update health UI on clients
- [ ] Handle `player_death` message
- [ ] Implement respawn logic (if lives > 0)
- [ ] Test melee attacks sync correctly
- [ ] Test arrow attacks sync correctly
- [ ] Test magic attack (V key) sync correctly
- [ ] Commit: "Network: Combat sync with server authority"

### Days 23-24: Remote Player Rendering
- [ ] Create `createRemotePlayer()` factory function
- [ ] Use different sprite colors per player (P1=red, P2=blue, etc.)
- [ ] Sync animation states across clients
- [ ] Implement facing direction sync (facingRight boolean)
- [ ] Add lag compensation (extrapolation if > 100ms lag)
- [ ] Add prediction error correction smoothing
- [ ] Display player nicknames above sprites
- [ ] Test with 4 players simultaneously
- [ ] Test with simulated lag (Chrome DevTools Network throttling)
- [ ] Commit: "Network: Remote player rendering complete"

**Deliverables**: ✅ Players see each other move, ✅ Combat works, ✅ Smooth sync

---

## 🟡 Phase 5: Polish & Testing (Week 4-5 - Days 25-35)

**Goal**: Power-ups, performance, testing, final polish

### Days 25-27: Power-Ups for VS
- [ ] Add 2 new power-up types to `collectible_component.js`:
  - [ ] `speed_boost` (+100 speed, 10s duration)
  - [ ] `damage_up` (2x damage, 15s duration)
- [ ] Update `pvp_arena.json` with power-up spawns
- [ ] Implement power-up collection sync
- [ ] Broadcast `powerup_collected` to all clients
- [ ] Apply effects to player stats
- [ ] Add visual feedback (glow, particle effect)
- [ ] Add timer bar for temporary power-ups
- [ ] Test power-ups work for all players
- [ ] Commit: "VS: Power-ups implemented"

### Days 28-30: Performance Optimization
- [ ] Add FPS counter to UI (`performance.now()`)
- [ ] Use Chrome DevTools Performance tab
- [ ] Identify paint/reflow bottlenecks
- [ ] Optimize render system (minimize DOM updates)
- [ ] Use CSS `will-change` for moving elements
- [ ] Promote layers properly (GPU acceleration)
- [ ] Measure with 4 players + 10 entities
- [ ] Ensure 60fps maintained
- [ ] Test network optimization (message batching)
- [ ] Commit: "Performance: 60fps optimization"

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
