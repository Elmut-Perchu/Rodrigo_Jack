package main

import (
	"log"
	"sort"
	"sync"
	"time"
)

// Room represents a game lobby/room
type Room struct {
	Code               string                   `json:"code"`
	Players            map[string]*Player       `json:"players"`
	MaxPlayers         int                      `json:"maxPlayers"`
	Host               *Player                  `json:"-"`
	IsGameActive       bool                     `json:"isGameActive"`
	WaitTimer          *time.Timer              `json:"-"`
	CountdownTimer     *time.Timer              `json:"-"`
	CountdownActive    bool                     `json:"countdownActive"`
	CountdownRemaining int                      `json:"countdownRemaining"`
	TeamMode           string                   `json:"teamMode"` // ffa | 2v2 | 3v1 (see bots.go)
	RoundWins          map[int]int              `json:"roundWins"` // team number -> rounds won this match
	countdownCancel    chan struct{}            // Channel to cancel countdown goroutine
	Arrows             map[string]*ArenaArrow   `json:"-"` // Arrows lying in the arena (see combat_vs.go)
	Spectres           map[string]string        `json:"-"` // Spirit id -> caster id (see spectre.go)
	pendingSwings      map[string]*PendingSwing // Sword blows inside their parry window (see parry.go)
	// Game loop fields
	currentTick  uint64        // Server tick counter
	stopGameLoop chan struct{} // Channel to stop game loop
	mu           sync.RWMutex
}

// RoomManager manages all active rooms
type RoomManager struct {
	Rooms map[string]*Room
	mu    sync.RWMutex
}

// NewRoomManager creates a new room manager
func NewRoomManager() *RoomManager {
	return &RoomManager{
		Rooms: make(map[string]*Room),
	}
}

// JoinRoom joins or creates a room
func (rm *RoomManager) JoinRoom(code string, player *Player) *Room {
	log.Printf("[RoomManager] JoinRoom called for %s by player %s", code, player.ID)
	rm.mu.Lock()
	defer rm.mu.Unlock()

	// Get or create room
	room, exists := rm.Rooms[code]
	if !exists {
		room = NewRoom(code)
		rm.Rooms[code] = room
		log.Printf("[RoomManager] Created new room: %s", code)
	} else {
		log.Printf("[RoomManager] Found existing room: %s", code)
	}

	// Check if room is full
	room.mu.RLock()
	currentPlayers := len(room.Players)
	isFull := currentPlayers >= room.MaxPlayers
	room.mu.RUnlock()

	log.Printf("[RoomManager] Room %s has %d/%d players, full=%v", code, currentPlayers, room.MaxPlayers, isFull)

	if isFull {
		log.Printf("[RoomManager] Room %s is full, rejecting player %s", code, player.ID)
		return nil
	}

	// Add player to room
	log.Printf("[RoomManager] Calling AddPlayer for %s in room %s", player.ID, code)
	room.AddPlayer(player)
	log.Printf("[RoomManager] AddPlayer completed for %s", player.ID)

	return room
}

// RemoveRoom removes an empty room
func (rm *RoomManager) RemoveRoom(code string) {
	rm.mu.Lock()
	defer rm.mu.Unlock()

	delete(rm.Rooms, code)
	log.Printf("[RoomManager] Removed room: %s", code)
}

// NewRoom creates a new room
func NewRoom(code string) *Room {
	return &Room{
		Code:               code,
		Players:            make(map[string]*Player),
		Arrows:             make(map[string]*ArenaArrow),
		Spectres:           make(map[string]string),
		pendingSwings:      make(map[string]*PendingSwing),
		MaxPlayers:         4,
		IsGameActive:       false,
		CountdownActive:    false,
		CountdownRemaining: 0,
		TeamMode:           TeamModeFFA,
		RoundWins:          make(map[int]int),
	}
}

// AddPlayer adds a player to the room
// CRITICAL FIX: Support player reconnection (reuse ID if same name)
func (r *Room) AddPlayer(player *Player) {
	r.mu.Lock()
	defer r.mu.Unlock()

	// Reconnection is handled earlier, in handleLobbyJoin, keyed on the
	// client's session id (see session.go). Matching on display name was
	// tried here before: it let two players sharing a nickname steal each
	// other's slot, and it double-unlocked r.mu (an explicit Unlock ahead of
	// a return that still ran the deferred Unlock), which crashed the server
	// with "Unlock of unlocked RWMutex".

	// NEW PLAYER (not reconnection) - use code below

	// Set as host if first player
	if len(r.Players) == 0 {
		player.IsHost = true
		r.Host = player
		log.Printf("[Room] %s is now host of room %s", player.ID, r.Code)
	}

	r.Players[player.ID] = player
	player.Room = r
	r.assignTeamsLocked() // Sides shown in the lobby from the moment they join
	log.Printf("[Room] Player %s joined room %s (count: %d/%d)", player.ID, r.Code, len(r.Players), r.MaxPlayers)

	// Broadcast player_joined to all other players
	r.broadcastLocked("player_joined", map[string]interface{}{
		"playerId":    player.ID,
		"playerName":  player.Name,
		"isHost":      player.IsHost,
		"playerCount": len(r.Players),
	}, player)

	// Send system message: player joined
	r.broadcastLocked("chat_message", map[string]interface{}{
		"playerId":   "system",
		"playerName": "System",
		"message":    player.Name + " joined the room",
		"timestamp":  time.Now().UnixMilli(),
		"isSystem":   true,
	}, nil)

	// Send the roster to EVERYONE, not just the arrival.
	//
	// The clients derive a fighter's slot - and therefore its spawn point and
	// the colours it wears - from a sort over the roster, so every client has
	// to be working from the same roster. Told only that somebody joined, an
	// existing client had to guess a slot, and two players could end up seeing
	// the same fighter in different colours.
	for _, p := range r.Players {
		r.sendRoomStateLocked(p)
	}

	// Start wait timer if this is the second player
	if len(r.Players) == 2 {
		r.startWaitTimer()
	}
}

// RemovePlayer removes a player from the room
func (r *Room) RemovePlayer(player *Player) {
	log.Printf("🚪 [RemovePlayer] START - Removing player %s (%s) from room %s", player.ID, player.Name, r.Code)

	r.mu.Lock()
	defer r.mu.Unlock()

	delete(r.Players, player.ID)
	r.assignTeamsLocked()
	log.Printf("🚪 [RemovePlayer] Player %s removed, remaining count: %d/%d", player.ID, len(r.Players), r.MaxPlayers)

	// If room is empty, cleanup and remove
	if len(r.Players) == 0 {
		log.Printf("⚠️ [RemovePlayer] Room %s is now EMPTY - calling cleanup()", r.Code)
		// Cleanup room resources
		r.cleanup()
		// Room will be cleaned up by room manager
		go roomManager.RemoveRoom(r.Code)
		return
	}

	log.Printf("🚪 [RemovePlayer] Room %s still has %d players", r.Code, len(r.Players))

	// Reassign host if necessary
	if player.IsHost {
		r.reassignHost()
	}

	// Broadcast player_left to remaining players
	r.broadcastLocked("player_left", map[string]interface{}{
		"playerId":    player.ID,
		"playerCount": len(r.Players),
	}, nil)

	// Send system message: player left
	r.broadcastLocked("chat_message", map[string]interface{}{
		"playerId":   "system",
		"playerName": "System",
		"message":    player.Name + " left the room",
		"timestamp":  time.Now().UnixMilli(),
		"isSystem":   true,
	}, nil)
}

/*
reassignHost picks a new host from the remaining players.

Only a human can take it: a bot has no client of its own, so making one host
would leave the room with nobody able to move it - or to run any of the other
bots, which are handed over at the same time.
*/
func (r *Room) reassignHost() {
	oldHostID := ""
	if r.Host != nil {
		oldHostID = r.Host.ID
	}

	// Deterministic pick, so every client agrees on who took over.
	ids := make([]string, 0, len(r.Players))
	for id, p := range r.Players {
		if !p.IsBot {
			ids = append(ids, id)
		}
	}
	sort.Strings(ids)

	if len(ids) == 0 {
		// Only machines left, and nobody to run them.
		for _, id := range r.dropBotsLocked() {
			r.broadcastLocked("player_left", map[string]interface{}{"playerId": id}, nil)
		}
		r.Host = nil
		return
	}

	newHost := r.Players[ids[0]]
	newHost.IsHost = true
	r.Host = newHost
	log.Printf("[Room] %s is now host of room %s", newHost.ID, r.Code)

	r.adoptBotsLocked(oldHostID, newHost)

	r.broadcastLocked("host_changed", map[string]interface{}{
		"playerId": newHost.ID,
	}, nil)
}

// Broadcast sends a message to all players in the room
func (r *Room) Broadcast(msgType string, data map[string]interface{}, exclude *Player) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	r.broadcastLocked(msgType, data, exclude)
}

// broadcastLocked sends a message to all players (assumes lock is already held)
func (r *Room) broadcastLocked(msgType string, data map[string]interface{}, exclude *Player) {
	// Copy player list to avoid holding lock during send
	playersCopy := make([]*Player, 0, len(r.Players))
	for _, player := range r.Players {
		if exclude == nil || player.ID != exclude.ID {
			playersCopy = append(playersCopy, player)
		}
	}

	// Send to all players (outside of lock to avoid blocking)
	for _, player := range playersCopy {
		player.sendMessage(msgType, data)
	}
}

// sendRoomState sends current room state to a player
func (r *Room) sendRoomState(player *Player) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	r.sendRoomStateLocked(player)
}

// sendRoomStateLocked sends current room state to a player (assumes lock is already held)
func (r *Room) sendRoomStateLocked(player *Player) {
	// Build player list
	playerList := make([]map[string]interface{}, 0)
	for _, p := range r.Players {
		playerList = append(playerList, map[string]interface{}{
			"playerId":   p.ID,
			"playerName": p.Name,
			"isHost":     p.IsHost,
			"isReady":    p.IsReady,
			"isBot":      p.IsBot,
			"botLevel":   p.BotLevel,
			// Whose client runs it. That client simulates the bot for real;
			// everyone else just watches an ordinary opponent.
			"controllerId": p.ControllerID,
			"team":         p.Team,
		})
	}

	player.sendMessage("room_state", map[string]interface{}{
		"roomCode":    r.Code,
		"players":     playerList,
		"playerCount": len(r.Players),
		"maxPlayers":  r.MaxPlayers,
		"teamMode":    r.TeamMode,
	})
}

// BroadcastRoomState sends the roster to everyone, after it changes.
func (r *Room) BroadcastRoomState() {
	r.mu.RLock()
	defer r.mu.RUnlock()

	for _, player := range r.Players {
		r.sendRoomStateLocked(player)
	}
}

// canStartGameLocked checks if the game can start (assumes lock already held)
func (r *Room) canStartGameLocked() bool {
	log.Printf("[CAN_START] Checking if game can start...")
	log.Printf("[CAN_START] Player count: %d (need >= 2)", len(r.Players))

	// Need at least 2 players
	if len(r.Players) < 2 {
		log.Printf("[CAN_START] NOT ENOUGH PLAYERS - returning false")
		return false
	}

	// All players must be ready
	allReady := true
	for _, player := range r.Players {
		log.Printf("[CAN_START] Player %s (%s) IsReady: %v", player.ID, player.Name, player.IsReady)
		if !player.IsReady {
			log.Printf("[CAN_START] Player %s NOT READY - returning false", player.Name)
			allReady = false
			return false
		}
	}

	if allReady {
		log.Printf("[CAN_START] ALL PLAYERS READY - returning true!")
	}
	return true
}

// CanStartGame checks if the game can start (public API with locking)
func (r *Room) CanStartGame() bool {
	r.mu.RLock()
	defer r.mu.RUnlock()

	return r.canStartGameLocked()
}

// StartGame initiates the game
func (r *Room) StartGame() {
	r.mu.Lock()
	defer r.mu.Unlock()

	r.startGameLocked()
}

// startGameLocked initiates the game (assumes lock is already held)
func (r *Room) startGameLocked() {
	r.IsGameActive = true
	log.Printf("[Room] Starting game in room %s", r.Code)

	r.broadcastLocked("game_starting", map[string]interface{}{
		"roomCode": r.Code,
	}, nil)

	// Game loop is now started in startMatchCountdown() after 3-2-1-GO countdown
	// Do NOT start it here (was causing double game loops!)
}

// GetAllPlayerStates returns all player states for sync
func (r *Room) GetAllPlayerStates() []map[string]interface{} {
	r.mu.RLock()
	defer r.mu.RUnlock()

	states := make([]map[string]interface{}, 0, len(r.Players))
	for _, player := range r.Players {
		states = append(states, map[string]interface{}{
			"playerId":    player.ID,
			"x":           player.X,
			"y":           player.Y,
			"vx":          player.VX,
			"vy":          player.VY,
			"animation":   player.Animation,
			"facingRight": player.FacingRight,
			"health":      player.Health,
			"isAlive":     player.IsAlive,
		})
	}
	return states
}

// startWaitTimer starts the 20-second wait timer
func (r *Room) startWaitTimer() {
	log.Printf("[Room] Starting 20-second wait timer in room %s", r.Code)

	r.WaitTimer = time.AfterFunc(20*time.Second, func() {
		r.mu.Lock()
		defer r.mu.Unlock()

		// Check if we still have enough players and all are ready
		if r.canStartGameLocked() {
			log.Printf("[Room] Wait timer expired, starting countdown in room %s", r.Code)
			r.startCountdown()
		} else {
			log.Printf("[Room] Wait timer expired but conditions not met in room %s", r.Code)
		}
	})

	r.broadcastLocked("wait_timer_started", map[string]interface{}{
		"duration": 20,
	}, nil)
}

// stopWaitTimer stops the wait timer if active
func (r *Room) stopWaitTimer() {
	if r.WaitTimer != nil {
		r.WaitTimer.Stop()
		r.WaitTimer = nil
		log.Printf("[Room] Stopped wait timer in room %s", r.Code)
	}
}

// startCountdown starts the 10-second countdown
func (r *Room) startCountdown() {
	if r.CountdownActive {
		return
	}

	r.CountdownActive = true
	r.CountdownRemaining = 10
	r.countdownCancel = make(chan struct{})

	log.Printf("[Room] Starting 10-second countdown in room %s", r.Code)

	r.broadcastLocked("countdown_started", map[string]interface{}{
		"remaining": r.CountdownRemaining,
	}, nil)

	// Countdown ticker - FIXED: No deadlock, proper cleanup
	go func() {
		ticker := time.NewTicker(1 * time.Second)
		defer ticker.Stop()

		for {
			select {
			case <-ticker.C:
				r.mu.Lock()

				if !r.CountdownActive {
					r.mu.Unlock()
					return
				}

				r.CountdownRemaining--
				remaining := r.CountdownRemaining
				shouldStart := remaining <= 0

				// Copy players list BEFORE releasing lock
				playersCopy := make([]*Player, 0, len(r.Players))
				for _, p := range r.Players {
					playersCopy = append(playersCopy, p)
				}

				r.mu.Unlock() // CRITICAL: Release lock BEFORE sending messages

				if shouldStart {
					log.Printf("[Room] Countdown finished in room %s, starting game", r.Code)

					// Broadcast game_starting WITHOUT lock
					for _, p := range playersCopy {
						p.sendMessage("game_starting", map[string]interface{}{
							"roomCode": r.Code,
						})
					}

					// Mark game active and start game loop
					r.mu.Lock()
					r.CountdownActive = false
					r.IsGameActive = true
					r.mu.Unlock()

					// Broadcast match_start to signal game has begun
					for _, p := range playersCopy {
						p.sendMessage("match_start", map[string]interface{}{
							"timestamp": time.Now().UnixMilli(),
						})
					}

					// CRITICAL FIX: DO NOT start game loop here!
					// Wait for ALL players to send "game_ready" message
					// This ensures clients are loaded and connected before broadcasting game_state_sync
					log.Printf("[Room] Match started, waiting for all players to send game_ready...")

					return
				}

				log.Printf("[Room] Countdown: %d seconds remaining in room %s", remaining, r.Code)

				// Broadcast countdown_tick WITHOUT lock
				for _, p := range playersCopy {
					p.sendMessage("countdown_tick", map[string]interface{}{
						"remaining": remaining,
					})
				}

			case <-r.countdownCancel:
				// Countdown cancelled externally
				log.Printf("[Room] Countdown cancelled via channel in room %s", r.Code)
				return
			}
		}
	}()
}

// stopCountdown stops the countdown if active
func (r *Room) stopCountdown() {
	if r.CountdownActive {
		r.CountdownActive = false
		r.CountdownRemaining = 0
		log.Printf("[Room] Stopped countdown in room %s", r.Code)

		// Cancel the countdown goroutine
		if r.countdownCancel != nil {
			close(r.countdownCancel)
			r.countdownCancel = nil
		}

		r.broadcastLocked("countdown_cancelled", nil, nil)
	}
}

// checkReadyState checks if all players are ready and triggers countdown
func (r *Room) checkReadyState() {
	log.Printf("[CHECK_READY] ========== START ==========")
	log.Printf("[CHECK_READY] Room: %s", r.Code)

	r.mu.Lock()
	defer r.mu.Unlock()

	log.Printf("[CHECK_READY] Player count: %d", len(r.Players))
	for _, p := range r.Players {
		log.Printf("[CHECK_READY] Player %s (%s) - IsReady: %v", p.ID, p.Name, p.IsReady)
	}

	// Stop countdown if not all ready
	canStart := r.canStartGameLocked()
	log.Printf("[CHECK_READY] CanStartGame: %v", canStart)

	if !canStart {
		log.Printf("[CHECK_READY] Cannot start game, stopping countdown")
		r.stopCountdown()
		log.Printf("[CHECK_READY] ========== END (not ready) ==========")
		return
	}

	// Start countdown if conditions met and not already active
	log.Printf("[CHECK_READY] CountdownActive: %v", r.CountdownActive)
	if !r.CountdownActive && len(r.Players) >= 2 {
		log.Printf("[CHECK_READY] Starting countdown NOW!")
		r.startCountdown()
	} else {
		log.Printf("[CHECK_READY] Countdown already active or not enough players")
	}
	log.Printf("[CHECK_READY] ========== END ==========")
}

// cleanup cleans up room resources (timers, goroutines)
func (r *Room) cleanup() {
	log.Printf("🧹 [cleanup] START - Cleaning up room %s", r.Code)
	log.Printf("🧹 [cleanup] IsGameActive before cleanup: %v", r.IsGameActive)

	// Stop game loop if active
	if r.IsGameActive {
		log.Printf("🧹 [cleanup] Stopping game loop for room %s", r.Code)
		r.StopGameLoop()
	}

	// Stop wait timer if active
	if r.WaitTimer != nil {
		log.Printf("🧹 [cleanup] Stopping wait timer")
		r.WaitTimer.Stop()
		r.WaitTimer = nil
	}

	// Stop countdown timer if active
	if r.CountdownTimer != nil {
		log.Printf("🧹 [cleanup] Stopping countdown timer")
		r.CountdownTimer.Stop()
		r.CountdownTimer = nil
	}

	// Cancel countdown goroutine if active
	if r.countdownCancel != nil {
		log.Printf("🧹 [cleanup] Cancelling countdown goroutine")
		close(r.countdownCancel)
		r.countdownCancel = nil
	}

	r.CountdownActive = false
	r.CountdownRemaining = 0
	r.IsGameActive = false
	log.Printf("🧹 [cleanup] Set IsGameActive = FALSE (THIS STOPS handlePlayerState from working!)")

	log.Printf("🧹 [cleanup] Room %s cleaned up successfully", r.Code)
}

// checkGameReady checks if all players have loaded their game clients and are ready for game loop
func (r *Room) checkGameReady() {
	r.mu.Lock()
	defer r.mu.Unlock()

	log.Printf("[CHECK_GAME_READY] ========== START ==========")
	log.Printf("[CHECK_GAME_READY] Room: %s", r.Code)
	log.Printf("[CHECK_GAME_READY] Player count: %d", len(r.Players))
	log.Printf("[CHECK_GAME_READY] IsGameActive: %v", r.IsGameActive)
	log.Printf("[CHECK_GAME_READY] stopGameLoop != nil (running): %v", r.stopGameLoop != nil)

	// CRITICAL FIX: Check if game loop is already running
	// stopGameLoop != nil means StartGameLoop() was called and channel created
	if r.IsGameActive && r.stopGameLoop != nil {
		log.Printf("[CHECK_GAME_READY] ✅ Game loop already running, ignoring")
		return
	}

	// Count how many players are game-ready.
	// Only connected players count: a slot still held for a player inside its
	// reconnection grace period must not block the match from starting.
	readyCount := 0
	connectedCount := 0
	for _, player := range r.Players {
		log.Printf("[CHECK_GAME_READY] Player %s (%s) - GameReady: %v, Connected: %v", player.ID, player.Name, player.GameReady, player.Connected)
		if !player.Connected {
			continue
		}
		connectedCount++
		if player.GameReady {
			readyCount++
		}
	}

	log.Printf("[CHECK_GAME_READY] %d/%d connected players game-ready", readyCount, connectedCount)

	// If ALL connected players are game-ready, start the game loop!
	if readyCount == connectedCount && connectedCount >= 2 {
		log.Printf("[CHECK_GAME_READY] ✅ ALL PLAYERS READY! Starting countdown...")

		// CRITICAL: Initialize player spawn positions BEFORE countdown!
		// Otherwise all players will be at (0, 0)
		r.initializePlayerSpawnPositions()

		// Arrows from a previous match must not litter the new one, and
		// everyone starts the round with a full starting quiver.
		r.clearArrowsLocked()
		r.clearSwingsLocked()
		r.clearSpectresLocked()
		for _, player := range r.Players {
			player.Quiver = StartingArrows
		}

		// CRITICAL: Set IsGameActive = true BEFORE countdown!
		// Otherwise game loop will immediately stop when it checks IsGameActive
		r.IsGameActive = true
		log.Printf("[CHECK_GAME_READY] Set IsGameActive = true")

		// Start 3-second countdown before game loop
		// This gives all clients time to stabilize connections
		go r.startMatchCountdown()
		log.Printf("[CHECK_GAME_READY] Match countdown started for room %s", r.Code)
	} else {
		log.Printf("[CHECK_GAME_READY] Waiting for more players to be ready...")
	}

	log.Printf("[CHECK_GAME_READY] ========== END ==========")
}

// initializePlayerSpawnPositions sets initial spawn positions for all players
// Assumes lock is already held by caller (checkGameReady)
func (r *Room) initializePlayerSpawnPositions() {
	// Spawn points taken from assets/maps/pvp_arena_compact.json "spawnpoints"
	// (tile coordinates x 64). Map is 24x14 tiles of 64px = 1536x896.
	//
	// The previous hardcoded corners (300/1200 x 200/650) all landed INSIDE
	// solid platform tiles on rows 3 and 10, so players spawned stuck in
	// geometry and collision resolution shoved them around forever.
	type spawn struct {
		X float64
		Y float64
	}

	// Free-for-all: one corner each.
	spawnPoints := []spawn{
		{X: 2 * 64, Y: 2 * 64},   // P1 top-left     (128, 128)
		{X: 21 * 64, Y: 2 * 64},  // P2 top-right    (1344, 128)
		{X: 2 * 64, Y: 11 * 64},  // P3 bottom-left  (128, 704)
		{X: 21 * 64, Y: 11 * 64}, // P4 bottom-right (1344, 704)
	}

	// Team play puts each side on its own half, so a 2v2 really is two on the
	// left against two on the right rather than four scattered corners. The
	// third entry of each column covers 3v1, where one side fields three.
	leftSpawns := []spawn{
		{X: 2 * 64, Y: 2 * 64},  // (128, 128)
		{X: 2 * 64, Y: 11 * 64}, // (128, 704)
		{X: 2 * 64, Y: 6 * 64},  // (128, 384) - drops onto the row-8 ledge
	}
	rightSpawns := []spawn{
		{X: 21 * 64, Y: 2 * 64},  // (1344, 128)
		{X: 21 * 64, Y: 11 * 64}, // (1344, 704)
		{X: 21 * 64, Y: 6 * 64},  // (1344, 384)
	}

	// Settle sides before anything reads them. A fighter left on team 0 would
	// count as sharing a side with every other team-0 fighter, which in
	// free-for-all made aliveTeamsLocked() see a single team from the start
	// and end the match on the first death.
	r.assignTeamsLocked()

	log.Printf("[SPAWN_INIT] ========== START ==========")
	log.Printf("[SPAWN_INIT] Initializing spawn positions for %d players", len(r.Players))

	// Assign spawns in sorted player-id order. Ranging over r.Players directly
	// uses Go's randomised map order, so the server and the clients (which
	// order by playerId) disagreed on who owns which corner: every client
	// predicted the wrong spawn and its first state update was rejected as a
	// 1216px teleport. Sorting makes the mapping identical everywhere, which
	// also keeps player colours consistent across clients.
	ids := make([]string, 0, len(r.Players))
	for id := range r.Players {
		ids = append(ids, id)
	}
	sort.Strings(ids)

	teamed := r.TeamMode != TeamModeFFA && r.TeamMode != ""
	usedLeft, usedRight := 0, 0

	playerIndex := 0
	for _, id := range ids {
		player := r.Players[id]

		// Free-for-all keeps the corner-per-player layout; team play draws
		// from the side that fighter belongs to.
		point := spawnPoints[playerIndex%len(spawnPoints)]
		if teamed {
			if player.Team == 1 {
				point = leftSpawns[usedLeft%len(leftSpawns)]
				usedLeft++
			} else {
				point = rightSpawns[usedRight%len(rightSpawns)]
				usedRight++
			}
		}

		// Set player position
		player.X = point.X
		player.Y = point.Y
		player.VX = 0
		player.VY = 0

		log.Printf("[SPAWN_INIT] Player %s (%s) spawned at (%.1f, %.1f)",
			player.ID, player.Name, player.X, player.Y)

		playerIndex++
	}

	log.Printf("[SPAWN_INIT] ========== END ==========")
}

// startMatchCountdown performs 3-second countdown before starting game loop
// Gives all clients time to stabilize connections and prepare for match
func (r *Room) startMatchCountdown() {
	log.Printf("[COUNTDOWN] ========== START ==========")
	log.Printf("[COUNTDOWN] Starting 3-second countdown for room %s", r.Code)

	// Lock is not held during countdown to allow other operations
	// We broadcast countdown messages to all players

	// 3
	r.mu.Lock()
	r.broadcastLocked("match_countdown", map[string]interface{}{
		"count":   3,
		"message": "3",
	}, nil)
	r.mu.Unlock()
	log.Printf("[COUNTDOWN] 3...")
	time.Sleep(1 * time.Second)

	// 2
	r.mu.Lock()
	r.broadcastLocked("match_countdown", map[string]interface{}{
		"count":   2,
		"message": "2",
	}, nil)
	r.mu.Unlock()
	log.Printf("[COUNTDOWN] 2...")
	time.Sleep(1 * time.Second)

	// 1
	r.mu.Lock()
	r.broadcastLocked("match_countdown", map[string]interface{}{
		"count":   1,
		"message": "1",
	}, nil)
	r.mu.Unlock()
	log.Printf("[COUNTDOWN] 1...")
	time.Sleep(1 * time.Second)

	// GO!
	r.mu.Lock()
	r.broadcastLocked("match_countdown", map[string]interface{}{
		"count":   0,
		"message": "GO!",
	}, nil)
	r.mu.Unlock()
	log.Printf("[COUNTDOWN] GO!")

	// Small delay to let "GO!" message reach clients
	time.Sleep(200 * time.Millisecond)

	// Start the authoritative game loop (20Hz tick rate)
	go r.StartGameLoop()
	log.Printf("[COUNTDOWN] Game loop started for room %s", r.Code)
	log.Printf("[COUNTDOWN] ========== END ==========")
}

// resetForNextRound respawns everyone and starts the next round's countdown.
// Mirrors checkGameReady's opening moves (spawn positions, cleared arrows/
// swings/spectres, full health and quiver) minus the "wait for everyone to
// be ready" gate - the room already proved every client loads fine when the
// match itself started. Called from a delayed goroutine (see handleRoundEnd)
// so every client's slow-motion victory beat has time to play out first.
func (r *Room) resetForNextRound() {
	r.mu.Lock()

	r.initializePlayerSpawnPositions()
	r.clearArrowsLocked()
	r.clearSwingsLocked()
	r.clearSpectresLocked()
	for _, player := range r.Players {
		player.Health = MAX_HEALTH
		player.IsAlive = true
		player.Quiver = StartingArrows
	}

	r.IsGameActive = true
	r.mu.Unlock()

	go r.startMatchCountdown()
}
