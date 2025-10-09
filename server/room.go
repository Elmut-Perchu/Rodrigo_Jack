package main

import (
	"log"
	"sync"
)

// Room represents a game lobby/room
type Room struct {
	Code         string             `json:"code"`
	Players      map[string]*Player `json:"players"`
	MaxPlayers   int                `json:"maxPlayers"`
	Host         *Player            `json:"-"`
	IsGameActive bool               `json:"isGameActive"`
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
		Code:         code,
		Players:      make(map[string]*Player),
		MaxPlayers:   4,
		IsGameActive: false,
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

	// Send current room state to new player
	r.sendRoomState(player)
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
