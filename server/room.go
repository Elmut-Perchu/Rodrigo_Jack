package main

import (
	"log"
	"sync"
	"time"
)

// Room represents a game lobby/room
type Room struct {
	Code               string             `json:"code"`
	Players            map[string]*Player `json:"players"`
	MaxPlayers         int                `json:"maxPlayers"`
	Host               *Player            `json:"-"`
	IsGameActive       bool               `json:"isGameActive"`
	WaitTimer          *time.Timer        `json:"-"`
	CountdownTimer     *time.Timer        `json:"-"`
	CountdownActive    bool               `json:"countdownActive"`
	CountdownRemaining int                `json:"countdownRemaining"`
	countdownCancel    chan struct{}      // Channel to cancel countdown goroutine
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
		Code:              code,
		Players:           make(map[string]*Player),
		MaxPlayers:        4,
		IsGameActive:      false,
		CountdownActive:   false,
		CountdownRemaining: 0,
	}
}

// AddPlayer adds a player to the room
// CRITICAL FIX: Support player reconnection (reuse ID if same name)
func (r *Room) AddPlayer(player *Player) {
	r.mu.Lock()
	defer r.mu.Unlock()

	// CRITICAL FIX: Check if player with same name already exists (reconnection)
	// This handles page navigation (lobby → game) where WebSocket disconnects/reconnects
	for existingID, existingPlayer := range r.Players {
		if existingPlayer.Name == player.Name {
			log.Printf("🔄 [Room] Player %s reconnecting, reusing ID %s", player.Name, existingID)

			// Reuse existing ID instead of creating new one
			player.ID = existingID
			player.IsHost = existingPlayer.IsHost
			player.IsReady = existingPlayer.IsReady
			player.GameReady = existingPlayer.GameReady

			// Preserve game state (position, health, etc.)
			player.X = existingPlayer.X
			player.Y = existingPlayer.Y
			player.VX = existingPlayer.VX
			player.VY = existingPlayer.VY
			player.Health = existingPlayer.Health
			player.IsAlive = existingPlayer.IsAlive

			// Close old connection (if still open)
			go existingPlayer.Conn.Close()

			// Replace with new connection
			r.Players[existingID] = player
			player.Room = r

			log.Printf("✅ [Room] Player %s reconnected with preserved state (x=%.1f, y=%.1f, health=%d)",
				player.Name, player.X, player.Y, player.Health)

			// Broadcast player_reconnected (not player_joined)
			r.broadcastLocked("player_reconnected", map[string]interface{}{
				"playerId":    player.ID,
				"playerName":  player.Name,
				"isHost":      player.IsHost,
				"playerCount": len(r.Players),
			}, nil)

			// Send current room state to reconnected player
			r.sendRoomStateLocked(player)

			// Release lock (defer will NOT unlock because we return)
			r.mu.Unlock()

			// CRITICAL FIX: Check if all players are now game-ready!
			// If this was the last player to reconnect and everyone has GameReady=true,
			// we need to start the game loop
			log.Printf("🔍 [Room] Checking if game should start after %s reconnection...", player.Name)
			r.checkGameReady()
			return
		}
	}

	// NEW PLAYER (not reconnection) - use code below

	// Set as host if first player
	if len(r.Players) == 0 {
		player.IsHost = true
		r.Host = player
		log.Printf("[Room] %s is now host of room %s", player.ID, r.Code)
	}

	r.Players[player.ID] = player
	player.Room = r
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

	// Send current room state to new player
	r.sendRoomStateLocked(player)

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

// reassignHost assigns a new host from remaining players
func (r *Room) reassignHost() {
	// Pick first available player as new host
	for _, p := range r.Players {
		p.IsHost = true
		r.Host = p
		log.Printf("[Room] %s is now host of room %s", p.ID, r.Code)

		// Notify all players of new host
		r.broadcastLocked("host_changed", map[string]interface{}{
			"playerId": p.ID,
		}, nil)
		break
	}
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
		})
	}

	player.sendMessage("room_state", map[string]interface{}{
		"roomCode":    r.Code,
		"players":     playerList,
		"playerCount": len(r.Players),
		"maxPlayers":  r.MaxPlayers,
	})
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

	// Count how many players are game-ready
	readyCount := 0
	for _, player := range r.Players {
		log.Printf("[CHECK_GAME_READY] Player %s (%s) - GameReady: %v", player.ID, player.Name, player.GameReady)
		if player.GameReady {
			readyCount++
		}
	}

	log.Printf("[CHECK_GAME_READY] %d/%d players game-ready", readyCount, len(r.Players))

	// If ALL players are game-ready, start the game loop!
	if readyCount == len(r.Players) && len(r.Players) >= 2 {
		log.Printf("[CHECK_GAME_READY] ✅ ALL PLAYERS READY! Starting countdown...")

		// CRITICAL: Initialize player spawn positions BEFORE countdown!
		// Otherwise all players will be at (0, 0)
		r.initializePlayerSpawnPositions()

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
	// Spawn points positioned in visible corners of arena
	// Map dimensions: 1536x896 pixels
	// Spawn points at 20% and 80% of dimensions for good spacing
	spawnPoints := []struct {
		X float64
		Y float64
	}{
		{X: 300, Y: 200},   // Top-left (20% from edges)
		{X: 1200, Y: 200},  // Top-right (80% horizontal)
		{X: 300, Y: 650},   // Bottom-left (75% vertical)
		{X: 1200, Y: 650},  // Bottom-right
	}

	log.Printf("[SPAWN_INIT] ========== START ==========")
	log.Printf("[SPAWN_INIT] Initializing spawn positions for %d players", len(r.Players))

	playerIndex := 0
	for _, player := range r.Players {
		// Assign spawn point (cycle through available points if more than 4 players)
		spawn := spawnPoints[playerIndex%len(spawnPoints)]

		// Set player position
		player.X = spawn.X
		player.Y = spawn.Y
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
