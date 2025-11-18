package main

import (
	"log"
	"sync"
	"time"
)

// TestPlayer represents a simple test player
type TestPlayer struct {
	ID        string  `json:"playerId"`
	SessionID string  `json:"sessionId"`     // Persistent session ID
	Name      string  `json:"playerName"`
	X         float64 `json:"x"`
	Y         float64 `json:"y"`
	VX        float64 `json:"vx"`
	VY        float64 `json:"vy"`
	Index     int     `json:"playerIndex"`
	Connected bool    `json:"connected"`      // Track connection status
	ConnID    string  `json:"-"`              // Current connection ID (not sent to client)
}

// TestRoom manages test sync mode
type TestRoom struct {
	Code        string
	Players     map[string]*TestPlayer
	mu          sync.RWMutex
	stopChan    chan bool // Signal to stop state update goroutine
	isRunning   bool      // Track if goroutine is running
	runningMu   sync.Mutex
}

var (
	testRooms = make(map[string]*TestRoom)
	testMu    sync.RWMutex
)

// handleTestMessage processes test sync messages
func handleTestMessage(p *Player, msgType string, data map[string]interface{}) {
	switch msgType {
	case "test_join":
		handleTestJoin(p, data)
	case "test_update":
		handleTestUpdate(p, data)
	case "test_leave":
		handleTestLeave(p)
	}
}

func handleTestJoin(p *Player, data map[string]interface{}) {
	roomCode := getString(data, "roomCode")
	playerId := getString(data, "playerId")
	playerName := getString(data, "playerName")
	sessionId := getString(data, "sessionId")
	isReconnect := getBool(data, "isReconnect")

	if roomCode == "" || playerId == "" {
		log.Printf("[TEST] Invalid join data from %s", p.ID)
		return
	}

	log.Printf("[TEST] Player %s (session %s) joining room %s (reconnect: %v)", playerName, sessionId, roomCode, isReconnect)

	// Get or create room
	testMu.Lock()
	room, exists := testRooms[roomCode]
	if !exists {
		room = &TestRoom{
			Code:      roomCode,
			Players:   make(map[string]*TestPlayer),
			stopChan:  make(chan bool),
			isRunning: false,
		}
		testRooms[roomCode] = room
		log.Printf("[TEST] Created new test room: %s", roomCode)
	}
	testMu.Unlock()

	// Add or update player in room
	room.mu.Lock()

	var testPlayer *TestPlayer
	var playerIndex int
	var alreadyConnected bool

	// Check if this is a reconnection (player with same sessionId exists)
	existingPlayer := findPlayerBySession(room, sessionId)

	if existingPlayer != nil {
		// Reconnection or duplicate join
		testPlayer = existingPlayer
		playerIndex = testPlayer.Index

		// Check if already connected with same connection ID
		if testPlayer.Connected && testPlayer.ConnID == p.ID {
			log.Printf("[TEST] Player %s is ALREADY CONNECTED with same ConnID, ignoring duplicate join", playerName)
			alreadyConnected = true
			// Don't update anything, just skip
		} else {
			// Real reconnection (different ConnID or was disconnected)
			log.Printf("[TEST] Player %s reconnecting with existing session", playerName)
			testPlayer.Connected = true
			testPlayer.ConnID = p.ID
			testPlayer.Name = playerName // Update name if changed

			// Keep existing position for reconnected player
			log.Printf("[TEST] Reconnected at position (%.0f, %.0f)", testPlayer.X, testPlayer.Y)
		}
	} else {
		// New player
		playerCount := countConnectedPlayers(room)
		spawnX := 200.0 + float64(playerCount * 300)
		spawnY := 200.0 + float64(playerCount * 100)
		playerIndex = getNextAvailableIndex(room)

		testPlayer = &TestPlayer{
			ID:        playerId,
			SessionID: sessionId,
			Name:      playerName,
			X:         spawnX,
			Y:         spawnY,
			VX:        0,
			VY:        0,
			Index:     playerIndex,
			Connected: true,
			ConnID:    p.ID,
		}
		room.Players[playerId] = testPlayer
		log.Printf("[TEST] New player spawned at (%.0f, %.0f) with index %d", spawnX, spawnY, playerIndex)
	}

	room.mu.Unlock()

	// Early return if already connected - don't send duplicate test_joined
	if alreadyConnected {
		return
	}

	// Store test info in player
	p.testRoomCode = roomCode
	p.testPlayerId = playerId

	// Get actual spawn position (use existing if reconnecting)
	spawnX := testPlayer.X
	spawnY := testPlayer.Y

	// Send join confirmation with player index for unique color
	log.Printf("[TEST] Sending test_joined with playerIndex=%d, x=%.0f, y=%.0f", playerIndex, spawnX, spawnY)
	p.sendMessage("test_joined", map[string]interface{}{
		"playerId":    playerId,
		"playerName":  playerName,
		"roomCode":    roomCode,
		"x":           spawnX,
		"y":           spawnY,
		"playerIndex": playerIndex,  // For color assignment
	})

	// Start room state broadcaster if not already running
	room.runningMu.Lock()
	if !room.isRunning {
		log.Printf("[TEST] Starting state broadcast goroutine for room %s", roomCode)
		room.isRunning = true
		go broadcastRoomState(room)
	}
	room.runningMu.Unlock()

	log.Printf("[TEST] Player %s successfully joined room %s", playerName, roomCode)
}

func handleTestUpdate(p *Player, data map[string]interface{}) {
	if p.testRoomCode == "" || p.testPlayerId == "" {
		return
	}

	playerId := getString(data, "playerId")
	x := getFloat(data, "x")
	y := getFloat(data, "y")
	vx := getFloat(data, "vx")
	vy := getFloat(data, "vy")

	// Get room
	testMu.RLock()
	room, exists := testRooms[p.testRoomCode]
	testMu.RUnlock()

	if !exists {
		log.Printf("[TEST] Room %s not found for player %s", p.testRoomCode, playerId)
		return
	}

	// Update player position
	room.mu.Lock()
	if player, ok := room.Players[playerId]; ok {
		player.X = x
		player.Y = y
		player.VX = vx
		player.VY = vy
	} else {
		log.Printf("[TEST] Player %s not found in room %s", playerId, p.testRoomCode)
	}
	room.mu.Unlock()
}

func handleTestLeave(p *Player) {
	if p.testRoomCode == "" || p.testPlayerId == "" {
		return
	}

	// Get room
	testMu.RLock()
	room, exists := testRooms[p.testRoomCode]
	testMu.RUnlock()

	if !exists {
		return
	}

	// Mark player as disconnected (don't delete, allows reconnection)
	room.mu.Lock()
	if player, ok := room.Players[p.testPlayerId]; ok {
		player.Connected = false
		player.ConnID = ""
		log.Printf("[TEST] Player %s disconnected from room %s (keeping state for reconnection)", player.Name, p.testRoomCode)
	}

	// Count active players
	activeCount := countConnectedPlayers(room)
	totalCount := len(room.Players)
	room.mu.Unlock()

	log.Printf("[TEST] Room %s status: %d active, %d total", p.testRoomCode, activeCount, totalCount)

	// Only delete room if no players at all (not even disconnected ones)
	// You might want to add a timeout to clean up old disconnected players
	if totalCount == 0 {
		testMu.Lock()
		delete(testRooms, p.testRoomCode)
		testMu.Unlock()
		log.Printf("[TEST] Deleted empty room %s", p.testRoomCode)
	}

	p.testRoomCode = ""
	p.testPlayerId = ""
}

// broadcastRoomState broadcasts game state to all connected players in a room
func broadcastRoomState(room *TestRoom) {
	ticker := time.NewTicker(50 * time.Millisecond) // 20Hz
	defer ticker.Stop()

	logOnce := true

	for {
		select {
		case <-ticker.C:
			// Get all connected players
			room.mu.RLock()
			players := make([]map[string]interface{}, 0)
			connectedPlayerObjects := make([]*Player, 0)

			for _, player := range room.Players {
				if player.Connected {
					players = append(players, map[string]interface{}{
						"playerId":    player.ID,
						"playerName":  player.Name,
						"x":           player.X,
						"y":           player.Y,
						"vx":          player.VX,
						"vy":          player.VY,
						"playerIndex": player.Index,
						"sessionId":   player.SessionID,
					})

					// Find the Player connection object to send to
					// We need to look up by ConnID
					if p := findPlayerConnection(player.ConnID); p != nil {
						connectedPlayerObjects = append(connectedPlayerObjects, p)
					} else {
						log.Printf("[TEST] WARNING: Could not find player connection for ConnID=%s, player=%s", player.ConnID, player.Name)
					}
				}
			}
			room.mu.RUnlock()

			// Debug log once
			if logOnce && len(players) > 0 {
				log.Printf("[TEST] Broadcasting state with %d players to %d connections", len(players), len(connectedPlayerObjects))
				logOnce = false
			}

			// Send state to all connected players
			stateMsg := map[string]interface{}{
				"players": players,
			}
			for _, p := range connectedPlayerObjects {
				p.sendMessage("test_state", stateMsg)
			}

			// Stop if no more connected players
			if len(connectedPlayerObjects) == 0 {
				log.Printf("[TEST] No connected players in room %s, stopping broadcast", room.Code)
				room.runningMu.Lock()
				room.isRunning = false
				room.runningMu.Unlock()
				return
			}

		case <-room.stopChan:
			log.Printf("[TEST] Stopping broadcast for room %s", room.Code)
			return
		}
	}
}

// Helper to find Player connection by ID (uses global map from player.go)
func findPlayerConnection(connID string) *Player {
	allPlayersMu.RLock()
	defer allPlayersMu.RUnlock()
	return allPlayers[connID]
}

// Helper functions
func getString(data map[string]interface{}, key string) string {
	if val, ok := data[key]; ok {
		if str, ok := val.(string); ok {
			return str
		}
	}
	return ""
}

func getFloat(data map[string]interface{}, key string) float64 {
	if val, ok := data[key]; ok {
		switch v := val.(type) {
		case float64:
			return v
		case int:
			return float64(v)
		}
	}
	return 0
}

func getBool(data map[string]interface{}, key string) bool {
	if val, ok := data[key]; ok {
		if b, ok := val.(bool); ok {
			return b
		}
	}
	return false
}

// Find player by session ID
func findPlayerBySession(room *TestRoom, sessionId string) *TestPlayer {
	if sessionId == "" {
		return nil
	}
	for _, player := range room.Players {
		if player.SessionID == sessionId {
			return player
		}
	}
	return nil
}

// Count connected players
func countConnectedPlayers(room *TestRoom) int {
	count := 0
	for _, player := range room.Players {
		if player.Connected {
			count++
		}
	}
	return count
}

// Get next available index for new player
func getNextAvailableIndex(room *TestRoom) int {
	maxIndex := -1
	for _, player := range room.Players {
		if player.Index > maxIndex {
			maxIndex = player.Index
		}
	}
	return maxIndex + 1
}