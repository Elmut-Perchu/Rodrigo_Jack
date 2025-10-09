package main

import (
	"log"
	"sync"
	"time"
)

// Room represents a game lobby/room
type Room struct {
	Code              string             `json:"code"`
	Players           map[string]*Player `json:"players"`
	MaxPlayers        int                `json:"maxPlayers"`
	Host              *Player            `json:"-"`
	IsGameActive      bool               `json:"isGameActive"`
	WaitTimer         *time.Timer        `json:"-"`
	CountdownTimer    *time.Timer        `json:"-"`
	CountdownActive   bool               `json:"countdownActive"`
	CountdownRemaining int                `json:"countdownRemaining"`
	mu                sync.RWMutex
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
	rm.mu.Lock()
	defer rm.mu.Unlock()

	// Get or create room
	room, exists := rm.Rooms[code]
	if !exists {
		room = NewRoom(code)
		rm.Rooms[code] = room
		log.Printf("[RoomManager] Created new room: %s", code)
	}

	// Check if room is full
	room.mu.RLock()
	isFull := len(room.Players) >= room.MaxPlayers
	room.mu.RUnlock()

	if isFull {
		log.Printf("[RoomManager] Room %s is full", code)
		return nil
	}

	// Add player to room
	room.AddPlayer(player)

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
func (r *Room) AddPlayer(player *Player) {
	r.mu.Lock()
	defer r.mu.Unlock()

	// Set as host if first player
	if len(r.Players) == 0 {
		player.IsHost = true
		r.Host = player
		log.Printf("[Room] %s is now host of room %s", player.ID, r.Code)
	}

	r.Players[player.ID] = player
	log.Printf("[Room] Player %s joined room %s (count: %d/%d)", player.ID, r.Code, len(r.Players), r.MaxPlayers)

	// Broadcast player_joined to all other players
	r.Broadcast("player_joined", map[string]interface{}{
		"playerId":    player.ID,
		"playerName":  player.Name,
		"isHost":      player.IsHost,
		"playerCount": len(r.Players),
	}, player)

	// Send system message: player joined
	r.Broadcast("chat_message", map[string]interface{}{
		"playerId":   "system",
		"playerName": "System",
		"message":    player.Name + " joined the room",
		"timestamp":  time.Now().UnixMilli(),
		"isSystem":   true,
	}, nil)

	// Send current room state to new player
	r.sendRoomState(player)

	// Start wait timer if this is the second player
	if len(r.Players) == 2 {
		r.startWaitTimer()
	}
}

// RemovePlayer removes a player from the room
func (r *Room) RemovePlayer(player *Player) {
	r.mu.Lock()
	defer r.mu.Unlock()

	delete(r.Players, player.ID)
	log.Printf("[Room] Player %s left room %s (count: %d/%d)", player.ID, r.Code, len(r.Players), r.MaxPlayers)

	// If room is empty, mark for cleanup
	if len(r.Players) == 0 {
		log.Printf("[Room] Room %s is now empty", r.Code)
		// Room will be cleaned up by room manager
		go roomManager.RemoveRoom(r.Code)
		return
	}

	// Reassign host if necessary
	if player.IsHost {
		r.reassignHost()
	}

	// Broadcast player_left to remaining players
	r.Broadcast("player_left", map[string]interface{}{
		"playerId":    player.ID,
		"playerCount": len(r.Players),
	}, nil)

	// Send system message: player left
	r.Broadcast("chat_message", map[string]interface{}{
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
		r.Broadcast("host_changed", map[string]interface{}{
			"playerId": p.ID,
		}, nil)
		break
	}
}

// Broadcast sends a message to all players in the room
func (r *Room) Broadcast(msgType string, data map[string]interface{}, exclude *Player) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	for _, player := range r.Players {
		if exclude != nil && player.ID == exclude.ID {
			continue
		}
		player.sendMessage(msgType, data)
	}
}

// sendRoomState sends current room state to a player
func (r *Room) sendRoomState(player *Player) {
	r.mu.RLock()
	defer r.mu.RUnlock()

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

// CanStartGame checks if the game can start
func (r *Room) CanStartGame() bool {
	r.mu.RLock()
	defer r.mu.RUnlock()

	// Need at least 2 players
	if len(r.Players) < 2 {
		return false
	}

	// All players must be ready
	for _, player := range r.Players {
		if !player.IsReady {
			return false
		}
	}

	return true
}

// StartGame initiates the game
func (r *Room) StartGame() {
	r.mu.Lock()
	defer r.mu.Unlock()

	r.IsGameActive = true
	log.Printf("[Room] Starting game in room %s", r.Code)

	r.Broadcast("game_starting", map[string]interface{}{
		"roomCode": r.Code,
	}, nil)
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
		if r.CanStartGame() {
			log.Printf("[Room] Wait timer expired, starting countdown in room %s", r.Code)
			r.startCountdown()
		} else {
			log.Printf("[Room] Wait timer expired but conditions not met in room %s", r.Code)
		}
	})

	r.Broadcast("wait_timer_started", map[string]interface{}{
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

	log.Printf("[Room] Starting 10-second countdown in room %s", r.Code)

	r.Broadcast("countdown_started", map[string]interface{}{
		"remaining": r.CountdownRemaining,
	}, nil)

	// Countdown ticker
	go func() {
		ticker := time.NewTicker(1 * time.Second)
		defer ticker.Stop()

		for range ticker.C {
			r.mu.Lock()

			if !r.CountdownActive {
				r.mu.Unlock()
				return
			}

			r.CountdownRemaining--

			if r.CountdownRemaining <= 0 {
				log.Printf("[Room] Countdown finished in room %s, starting game", r.Code)
				r.CountdownActive = false
				r.StartGame()
				r.mu.Unlock()
				return
			}

			log.Printf("[Room] Countdown: %d seconds remaining in room %s", r.CountdownRemaining, r.Code)

			r.Broadcast("countdown_tick", map[string]interface{}{
				"remaining": r.CountdownRemaining,
			}, nil)

			r.mu.Unlock()
		}
	}()
}

// stopCountdown stops the countdown if active
func (r *Room) stopCountdown() {
	if r.CountdownActive {
		r.CountdownActive = false
		r.CountdownRemaining = 0
		log.Printf("[Room] Stopped countdown in room %s", r.Code)

		r.Broadcast("countdown_cancelled", nil, nil)
	}
}

// checkReadyState checks if all players are ready and triggers countdown
func (r *Room) checkReadyState() {
	r.mu.Lock()
	defer r.mu.Unlock()

	// Stop countdown if not all ready
	if !r.CanStartGame() {
		r.stopCountdown()
		return
	}

	// Start countdown if conditions met and not already active
	if !r.CountdownActive && len(r.Players) >= 2 {
		r.startCountdown()
	}
}
