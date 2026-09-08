package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"html"
	"log"
	"math"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

// Player represents a connected client
type Player struct {
	ID        string          `json:"id"`
	Name      string          `json:"name"`
	Conn      *websocket.Conn `json:"-"`
	Room      *Room           `json:"-"`
	IsReady   bool            `json:"isReady"`
	GameReady bool            `json:"gameReady"` // True when game client loaded and ready for game loop
	IsHost    bool            `json:"isHost"`
	// A bot is a fighter with no socket, run by another client (see bots.go).
	IsBot        bool   `json:"isBot"`
	BotLevel     string `json:"botLevel"`
	ControllerID string `json:"-"` // Whose client moves it
	// 0 never occurs once a room has assigned sides; in free-for-all each
	// fighter simply gets a team of their own.
	Team            int         `json:"team"`
	SendChan        chan []byte `json:"-"`
	LastMessageTime time.Time   `json:"-"`
	MessageCount    int         `json:"-"`
	closeChan       chan bool   // For stopping goroutines
	// Game state
	X           float64 `json:"x"`
	Y           float64 `json:"y"`
	VX          float64 `json:"vx"`
	VY          float64 `json:"vy"`
	Animation   string  `json:"animation"`
	FacingRight bool    `json:"facingRight"`
	Health      int     `json:"health"`
	IsAlive     bool    `json:"isAlive"`
	// Spirit gauge, 0..1. Filled entirely on the owner's own machine (see
	// VSSpectre) and relayed here purely so the other clients can draw it on
	// their HUD - the server never reads it to decide anything.
	Spirit float64 `json:"spirit"`
	// Validation tracking
	LastStateUpdate time.Time `json:"-"`      // For rate limiting and movement validation
	Quiver          int       `json:"quiver"` // Arrows carried (see combat_vs.go)
	// Session / reconnection tracking (see session.go)
	SessionID  string      `json:"-"` // Persistent across reconnections
	Connected  bool        `json:"connected"`
	graceTimer *time.Timer // Eviction timer while offline
	sendMu     sync.Mutex  // Guards sendClosed / SendChan
	sendClosed bool        // True once SendChan has been closed
	// Test mode fields
	testRoomCode string
	testPlayerId string
}

// Message represents a WebSocket message
type Message struct {
	Type      string                 `json:"type"`
	Data      map[string]interface{} `json:"data"`
	Timestamp int64                  `json:"timestamp"`
}

// NewPlayer creates a new player instance
func NewPlayer(conn *websocket.Conn) *Player {
	player := &Player{
		ID:              generateUUID(),
		Conn:            conn,
		IsReady:         false,
		IsHost:          false,
		SendChan:        make(chan []byte, 256),
		closeChan:       make(chan bool),
		Animation:       "idle",
		FacingRight:     true,
		Health:          MAX_HEALTH,
		IsAlive:         true,
		LastMessageTime: time.Now(),
		MessageCount:    0,
		LastStateUpdate: time.Now(),
		Connected:       true,
		Quiver:          StartingArrows,
	}

	log.Printf("[Player] New player created: %s", player.ID)

	// Register player in global map for test_handler
	registerPlayer(player)

	// Start write pump
	go player.writePump()

	return player
}

// Global player registry (used by test_handler for broadcasting)
var allPlayers = make(map[string]*Player)
var allPlayersMu sync.RWMutex

// Register/unregister functions
func registerPlayer(p *Player) {
	allPlayersMu.Lock()
	defer allPlayersMu.Unlock()
	allPlayers[p.ID] = p
}

func unregisterPlayer(p *Player) {
	allPlayersMu.Lock()
	defer allPlayersMu.Unlock()
	delete(allPlayers, p.ID)
}

// HandleMessages processes incoming WebSocket messages
func (p *Player) HandleMessages() {
	defer func() {
		p.Close()
	}()

	// Configure connection
	p.Conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	p.Conn.SetPongHandler(func(string) error {
		p.Conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	for {
		// Read message
		_, messageData, err := p.Conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("[Player] Unexpected close error: %v", err)
			}
			break
		}

		// Reset read deadline on ANY message received (not just pongs)
		p.Conn.SetReadDeadline(time.Now().Add(60 * time.Second))

		// Parse message
		var msg Message
		if err := json.Unmarshal(messageData, &msg); err != nil {
			log.Printf("[Player] Failed to parse message: %v", err)
			continue
		}

		// Only log non-routine messages (skip test_update, ping, pong for less spam)
		if msg.Type != "test_update" && msg.Type != "ping" && msg.Type != "pong" && msg.Type != "player_state" {
			log.Printf("[Player] %s received: %s", p.ID, msg.Type)
		}

		// Handle message based on type
		p.handleMessage(&msg)
	}
}

// handleMessage routes messages to appropriate handlers
func (p *Player) handleMessage(msg *Message) {
	switch msg.Type {
	case "lobby_join":
		p.handleLobbyJoin(msg)
	case "lobby_ready":
		p.handleLobbyReady(msg)
	case "game_ready":
		p.handleGameReady(msg)
	case "round_ready":
		p.handleRoundReady(msg)
	case "chat_message":
		p.handleChatMessage(msg)
	case "player_state":
		p.handlePlayerState(msg)
	case "player_attack":
		p.handlePlayerAttack(msg)
	// Arrow lifecycle (see combat_vs.go)
	case "arrow_spawn":
		p.handleArrowSpawn(msg)
	case "arrow_stuck":
		p.handleArrowStuck(msg)
	case "arrow_pickup":
		p.handleArrowPickup(msg)
	case "lobby_add_bot":
		p.handleAddBot(msg)
	case "lobby_remove_bot":
		p.handleRemoveBot(msg)
	case "lobby_set_teams":
		p.handleSetTeams(msg)
	case "lobby_set_player_team":
		p.handleSetPlayerTeam(msg)
	case "bot_state":
		p.handleBotState(msg)
	case "arrow_deflect":
		p.handleArrowDeflect(msg)
	// Spirits (see spectre.go)
	case "spectre_spawn":
		p.handleSpectreSpawn(msg)
	case "spectre_end":
		p.handleSpectreEnd(msg)
	case "spectre_cut":
		p.handleSpectreCut(msg)
	case "arrow_hit":
		p.handleArrowHit(msg)
	case "ping":
		// Send pong with timestamp
		p.sendMessage("pong", map[string]interface{}{
			"timestamp": msg.Data["timestamp"],
		})
	case "pong":
		// Client responded to our ping - just acknowledge, no action needed
		log.Printf("[Player] %s pong received", p.ID)
	case "draw_line":
		// Simple test: broadcast draw command to all other players in room
		p.handleDrawLine(msg)
	case "clear_canvas":
		// Broadcast clear canvas to all players in room
		if p.Room != nil {
			p.Room.Broadcast("clear_canvas", map[string]interface{}{}, nil)
		}
	// Test sync messages
	case "test_join", "test_update", "test_leave":
		handleTestMessage(p, msg.Type, msg.Data)
	default:
		log.Printf("[Player] Unknown message type: %s", msg.Type)
	}
}

// handleLobbyJoin handles lobby join requests
func (p *Player) handleLobbyJoin(msg *Message) {
	roomCode, ok := msg.Data["roomCode"].(string)
	if !ok {
		log.Printf("[Player] Invalid room code in lobby_join")
		return
	}

	playerName, ok := msg.Data["playerName"].(string)
	if !ok {
		playerName = "Player"
	}

	// Validate and sanitize nickname (max 12 chars)
	playerName = strings.TrimSpace(playerName)
	if len(playerName) > 12 {
		playerName = playerName[:12]
	}
	if playerName == "" {
		playerName = "Player"
	}

	p.Name = html.EscapeString(playerName)

	// Persistent session id lets a player reclaim its slot after the lobby ->
	// arena navigation drops the WebSocket (see session.go).
	sessionID, _ := msg.Data["sessionId"].(string)

	log.Printf("[Player] %s attempting to join room: %s (name: %s, session: %s)", p.ID, roomCode, p.Name, sessionID)

	// Reconnection path: adopt the slot we already own in this room.
	if sessionID != "" {
		if existing := roomManager.GetRoom(roomCode); existing != nil {
			if existing.TryReconnect(p, sessionID) {
				p.sendMessage("lobby_joined", map[string]interface{}{
					"roomCode":    roomCode,
					"playerId":    p.ID,
					"playerName":  p.Name,
					"isHost":      p.IsHost,
					"playerCount": len(existing.Players),
					"reconnected": true,
					"gameActive":  existing.IsGameActive,
				})
				existing.sendRoomState(p)
				existing.Broadcast("player_reconnected", map[string]interface{}{
					"playerId":   p.ID,
					"playerName": p.Name,
				}, p)
				log.Printf("[Player] %s reclaimed its slot in room %s", p.Name, roomCode)

				// The player that just came back may be the last one the match
				// was waiting on, so re-evaluate whether the loop can start.
				existing.checkGameReady()
				return
			}
		}
	}

	p.SessionID = sessionID

	// Join or create room
	room := roomManager.JoinRoom(roomCode, p)
	if room == nil {
		p.sendMessage("error", map[string]interface{}{
			"message": "Room is full",
		})
		return
	}

	p.Room = room

	// Send lobby_joined confirmation
	p.sendMessage("lobby_joined", map[string]interface{}{
		"roomCode":    roomCode,
		"playerId":    p.ID,
		"playerName":  p.Name,
		"isHost":      p.IsHost,
		"playerCount": len(room.Players),
	})

	log.Printf("[Player] %s joined room %s successfully", p.ID, roomCode)
}

// handleLobbyReady handles ready status toggle
func (p *Player) handleLobbyReady(msg *Message) {
	log.Printf("[LOBBY_READY] ========== START ==========")
	log.Printf("[LOBBY_READY] Player ID: %s", p.ID)
	log.Printf("[LOBBY_READY] Message data: %+v", msg.Data)

	if p.Room == nil {
		log.Printf("[LOBBY_READY] ERROR: Player %s not in a room", p.ID)
		return
	}
	log.Printf("[LOBBY_READY] Player is in room: %s", p.Room.Code)

	isReady, ok := msg.Data["isReady"].(bool)
	if !ok {
		log.Printf("[LOBBY_READY] ERROR: Invalid isReady value, got type: %T, value: %v", msg.Data["isReady"], msg.Data["isReady"])
		return
	}
	log.Printf("[LOBBY_READY] isReady value: %v", isReady)

	p.IsReady = isReady
	log.Printf("[LOBBY_READY] Player %s ready status set to: %v", p.ID, p.IsReady)

	// Broadcast to room
	log.Printf("[LOBBY_READY] Broadcasting player_ready to room")
	p.Room.Broadcast("player_ready", map[string]interface{}{
		"playerId": p.ID,
		"isReady":  p.IsReady,
	}, nil)

	// Check if all players are ready to start countdown
	log.Printf("[LOBBY_READY] Calling checkReadyState()")
	p.Room.checkReadyState()
	log.Printf("[LOBBY_READY] ========== END ==========")
}

// handleGameReady handles when a player's game client is loaded and ready for game loop
func (p *Player) handleGameReady(msg *Message) {
	log.Printf("[GAME_READY] ========== START ==========")
	log.Printf("[GAME_READY] Player ID: %s (%s)", p.ID, p.Name)

	if p.Room == nil {
		log.Printf("[GAME_READY] ERROR: Player %s not in a room", p.ID)
		return
	}

	log.Printf("[GAME_READY] Player %s in room: %s", p.Name, p.Room.Code)

	// Mark player as game-ready
	p.GameReady = true
	log.Printf("[GAME_READY] Player %s marked as GameReady", p.Name)

	// Tell the arriving client which arrows are already lying around, so a
	// reconnecting player can still see (and collect) them, and how many it
	// is actually carrying (a page reload must not refill the quiver).
	p.Room.sendArrowRegistry(p)
	p.sendQuiver()

	// Check if ALL players are game-ready, if so start the game loop
	p.Room.checkGameReady()
	log.Printf("[GAME_READY] ========== END ==========")
}

// handleRoundReady records that this player has finished reading the round
// score and wants the next round (see Room.beginRoundIntermission).
func (p *Player) handleRoundReady(_ *Message) {
	if p.Room == nil {
		return
	}
	p.Room.markRoundReady(p.ID)
}

// handleChatMessage handles chat messages
func (p *Player) handleChatMessage(msg *Message) {
	if p.Room == nil {
		log.Printf("[Player] %s not in a room", p.ID)
		return
	}

	message, ok := msg.Data["message"].(string)
	if !ok || message == "" {
		return
	}

	// Rate limiting: 5 messages per second
	now := time.Now()
	if now.Sub(p.LastMessageTime) < time.Second {
		p.MessageCount++
		if p.MessageCount > 5 {
			log.Printf("[Chat] Rate limit exceeded for %s", p.Name)
			p.sendMessage("error", map[string]interface{}{
				"message": "Rate limit exceeded. Slow down!",
			})
			return
		}
	} else {
		// Reset counter after 1 second
		p.MessageCount = 1
		p.LastMessageTime = now
	}

	// Sanitize message (escape HTML, trim, max 200 chars)
	message = strings.TrimSpace(message)
	if len(message) > 200 {
		message = message[:200]
	}
	message = html.EscapeString(message)

	if message == "" {
		return
	}

	log.Printf("[Chat] %s: %s", p.Name, message)

	// Broadcast to room
	p.Room.Broadcast("chat_message", map[string]interface{}{
		"playerId":   p.ID,
		"playerName": p.Name,
		"message":    message,
		"timestamp":  now.UnixMilli(),
	}, nil)
}

// handlePlayerState handles player position/state updates with server-side validation
// applyStateUpdate runs the ordinary player-state path.
//
// Bots go through it unchanged, anti-cheat included: a host is trusted with
// its bots' movement exactly as much as with its own.
func (p *Player) applyStateUpdate(msg *Message) {
	p.handlePlayerState(msg)
}

func (p *Player) handlePlayerState(msg *Message) {
	// CRITICAL DEBUG: Log every call to understand why positions don't update
	debugf("🎮 [handlePlayerState] Called for player %s (%s)", p.ID, p.Name)

	if p.Room == nil {
		debugf("❌ [handlePlayerState] Player %s has NO ROOM - returning early", p.Name)
		return
	}

	debugf("🎮 [handlePlayerState] Player %s room: %s, IsGameActive: %v", p.Name, p.Room.Code, p.Room.IsGameActive)

	if !p.Room.IsGameActive {
		debugf("❌ [handlePlayerState] Game NOT ACTIVE in room %s - returning early (THIS IS THE PROBLEM!)", p.Room.Code)
		return
	}

	now := time.Now()

	// Rate limiting: max 60 updates/sec (16ms minimum delta)
	timeSinceLastUpdate := now.Sub(p.LastStateUpdate).Milliseconds()
	if timeSinceLastUpdate < MIN_UPDATE_DELTA {
		// Too fast, ignore this update
		debugf("⏱️ [handlePlayerState] Rate limit: %dms since last update (need %dms) - skipping", timeSinceLastUpdate, MIN_UPDATE_DELTA)
		return
	}

	debugf("✅ [handlePlayerState] Passed rate limit check for %s", p.Name)

	// Extract state data
	x, xOk := msg.Data["x"].(float64)
	y, yOk := msg.Data["y"].(float64)
	vx, vxOk := msg.Data["vx"].(float64)
	vy, vyOk := msg.Data["vy"].(float64)

	if !xOk || !yOk || !vxOk || !vyOk {
		log.Printf("[Validation] Invalid state data from player %s", p.Name)
		return
	}

	// VALIDATION 1: Check velocity bounds
	if math.Abs(vx) > MAX_VELOCITY || math.Abs(vy) > MAX_VELOCITY {
		log.Printf("[CHEAT] Player %s velocity too high: vx=%.2f, vy=%.2f (max: %.2f)",
			p.Name, vx, vy, MAX_VELOCITY)

		// Send correction back to client
		p.sendMessage("position_correction", map[string]interface{}{
			"x":  p.X,
			"y":  p.Y,
			"vx": p.VX,
			"vy": p.VY,
		})
		return
	}

	// VALIDATION 2: Check map bounds
	//
	// Widened by POSITION_MARGIN: the arena's edges are passages, and a body
	// halfway through one reports a corner just outside the map.
	if x < -POSITION_MARGIN || x > MAP_WIDTH+POSITION_MARGIN ||
		y < -POSITION_MARGIN || y > MAP_HEIGHT+POSITION_MARGIN {
		log.Printf("[CHEAT] Player %s out of bounds: (%.2f, %.2f), map: %.2f x %.2f",
			p.Name, x, y, MAP_WIDTH, MAP_HEIGHT)

		// Send correction back to client
		p.sendMessage("position_correction", map[string]interface{}{
			"x":  p.X,
			"y":  p.Y,
			"vx": p.VX,
			"vy": p.VY,
		})
		return
	}

	// VALIDATION 3: Check movement distance (anti-teleportation)
	timeDelta := float64(timeSinceLastUpdate) / 1000.0 // Convert to seconds
	maxAllowedDistance := MAX_MOVEMENT_PER_SEC * timeDelta

	// Measured the short way round each axis, so stepping through a passage
	// counts as the few pixels it really is rather than the arena-wide jump it
	// looks like. A genuine teleport across the middle is still the full
	// distance and is still caught (see server/wrap.go).
	dx := shortestDelta(x-p.X, MAP_WIDTH)
	dy := shortestDelta(y-p.Y, MAP_HEIGHT)
	distance := math.Sqrt(dx*dx + dy*dy)

	if distance > maxAllowedDistance {
		log.Printf("[CHEAT] Player %s moved too far: %.2f pixels in %.3fs (max: %.2f)",
			p.Name, distance, timeDelta, maxAllowedDistance)

		// Send correction back to client
		p.sendMessage("position_correction", map[string]interface{}{
			"x":  p.X,
			"y":  p.Y,
			"vx": p.VX,
			"vy": p.VY,
		})
		return
	}

	// All validations passed, accept the update
	debugf("✅ [handlePlayerState] All validations passed! Updating %s: (%.1f, %.1f) -> (%.1f, %.1f)",
		p.Name, p.X, p.Y, x, y)

	p.X = x
	p.Y = y
	p.VX = vx
	p.VY = vy
	p.LastStateUpdate = now

	// Get optional animation and facing direction
	if animation, ok := msg.Data["animation"].(string); ok {
		p.Animation = animation
	}
	if facingRight, ok := msg.Data["facingRight"].(bool); ok {
		p.FacingRight = facingRight
	}
	if spirit, ok := msg.Data["spirit"].(float64); ok {
		p.Spirit = math.Max(0, math.Min(1, spirit))
	}

	debugf("📊 [handlePlayerState] Position updated successfully for %s at (%.1f, %.1f)", p.Name, p.X, p.Y)

	// NOTE: State broadcasting is handled by game loop (game_loop.go:82)
	// This ensures single source of truth and consistent 20Hz tick rate
	// Removed duplicate broadcast here to avoid message conflicts
}

// handlePlayerAttack handles player attack actions
func (p *Player) handlePlayerAttack(msg *Message) {
	if p.Room == nil || !p.Room.IsGameActive {
		return
	}

	// A host reports its bots' blows from its own connection, naming them in
	// asPlayerId. Anything it does not control falls back to itself.
	actor := p.actor(msg)
	if actor == nil {
		return
	}

	if !actor.IsAlive {
		log.Printf("[Combat] Dead player %s attempted to attack", actor.Name)
		return
	}

	// Extract attack data
	attackType, typeOk := msg.Data["attackType"].(string)
	x, xOk := msg.Data["x"].(float64)
	y, yOk := msg.Data["y"].(float64)
	direction, dirOk := msg.Data["direction"].(string)
	facingRight, facingOk := msg.Data["facingRight"].(bool)
	swing, _ := msg.Data["swing"].(string)

	if !typeOk || !xOk || !yOk || !dirOk || !facingOk {
		log.Printf("[Combat] Invalid attack data from %s", actor.Name)
		return
	}

	// Create attack data
	attackData := AttackData{
		AttackerID:  actor.ID,
		AttackType:  AttackType(attackType),
		X:           x,
		Y:           y,
		Direction:   direction,
		FacingRight: facingRight,
		Swing:       swing,
	}

	// A sword blow is shown at once but lands only after the parry window,
	// so the opponent can answer it with their own blade (see parry.go).
	// Ranged attacks resolve immediately - there is nothing to parry.
	if attackData.AttackType == AttackMelee {
		broadcastAttack(p.Room, attackData)
		p.Room.registerSwing(actor, attackData)
		return
	}

	// Process attack with server authority
	ProcessAttack(p.Room, attackData)
}

// isDroppableMessage returns true if this message type can be safely dropped when buffer is full
func isDroppableMessage(msgType string) bool {
	droppableTypes := []string{
		"player_state",
		"game_state_sync",
	}

	for _, t := range droppableTypes {
		if msgType == t {
			return true
		}
	}
	return false
}

// sendMessage sends a message to the player with improved overflow handling
func (p *Player) sendMessage(msgType string, data map[string]interface{}) {
	// A player kept alive during its reconnection grace period has no socket
	// left: writing to SendChan here would panic on a closed channel.
	p.sendMu.Lock()
	closed := p.sendClosed
	p.sendMu.Unlock()
	if closed {
		return
	}

	msg := Message{
		Type:      msgType,
		Data:      data,
		Timestamp: time.Now().UnixMilli(),
	}

	msgBytes, err := json.Marshal(msg)
	if err != nil {
		log.Printf("[SEND_MSG] Failed to marshal message: %v", err)
		return
	}

	debugf("[SEND_MSG] Attempting to send to channel (len=%d, cap=%d)", len(p.SendChan), cap(p.SendChan))

	select {
	case p.SendChan <- msgBytes:
		debugf("[SEND_MSG] Successfully sent %s to %s", msgType, p.Name)
	default:
		// Buffer is full
		if isDroppableMessage(msgType) {
			// For droppable messages (state updates), drop oldest message and retry
			log.Printf("[SEND_MSG] Buffer full, dropping oldest message for %s", p.Name)

			select {
			case <-p.SendChan: // Remove oldest message
				// Retry sending new message
				select {
				case p.SendChan <- msgBytes:
					debugf("[SEND_MSG] Successfully sent %s after dropping old message", msgType)
				default:
					log.Printf("[SEND_MSG] Still full after drop, skipping message for %s", p.Name)
				}
			default:
				// Channel emptied in the meantime, retry
				select {
				case p.SendChan <- msgBytes:
					debugf("[SEND_MSG] Successfully sent %s on retry", msgType)
				default:
					log.Printf("[SEND_MSG] Failed to send %s after multiple attempts", msgType)
				}
			}
		} else {
			// For critical messages (chat, combat, match_end), close connection
			log.Printf("[SEND_MSG] Critical message queue full, closing connection: %s", p.ID)
			p.Close()
		}
	}
}

// writePump sends messages from SendChan to WebSocket connection
func (p *Player) writePump() {
	// CRITICAL FIX: Removed ping/pong timeout mechanism - browsers don't reliably respond to WebSocket PINGs
	// Instead, we rely on:
	// 1. Client actively sending player_state every 16ms during gameplay
	// 2. TCP keepalive at OS level
	// 3. Write deadline on each message (10s timeout)

	defer func() {
		p.Conn.Close()
	}()

	for {
		select {
		case message, ok := <-p.SendChan:
			p.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				// Channel closed
				p.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			if err := p.Conn.WriteMessage(websocket.TextMessage, message); err != nil {
				log.Printf("[Player] Write error: %v", err)
				return
			}
		}
	}
}

// Close cleans up player resources
func (p *Player) Close() {
	log.Printf("🔌 [Player.Close] START - Closing connection for %s (%s)", p.ID, p.Name)

	// Leave test room if in one
	if p.testRoomCode != "" {
		handleTestLeave(p)
	}

	// Stop accepting writes before anything else, so concurrent broadcasts
	// cannot race us onto a closed channel.
	alreadyClosed := p.markSendClosed()
	if alreadyClosed {
		log.Printf("🔌 [Player.Close] Already closed for %s - nothing to do", p.Name)
		return
	}

	// Leave room if in one. The slot is held for RECONNECT_GRACE so that
	// navigating from the lobby to the arena does not destroy the match.
	if p.Room != nil {
		log.Printf("🔌 [Player.Close] Player %s is in room %s, holding slot for reconnection", p.Name, p.Room.Code)
		p.Room.HandleDisconnect(p)
	} else {
		log.Printf("🔌 [Player.Close] Player %s has no room", p.Name)
	}

	// Signal goroutines to stop
	if p.closeChan != nil {
		close(p.closeChan)
	}

	// Close send channel
	log.Printf("🔌 [Player.Close] Closing send channel for %s", p.Name)
	close(p.SendChan)

	// Close WebSocket connection
	log.Printf("🔌 [Player.Close] Closing WebSocket for %s", p.Name)
	p.Conn.Close()

	log.Printf("🔌 [Player.Close] COMPLETE for %s", p.Name)
}

// generateUUID generates a cryptographically secure UUID
// handleDrawLine broadcasts drawing data to all players in room (for testing)
func (p *Player) handleDrawLine(msg *Message) {
	if p.Room == nil {
		return
	}

	// Forward the draw command to all other players
	p.Room.Broadcast("draw_line", msg.Data, p)
}

func generateUUID() string {
	b := make([]byte, 16)
	_, err := rand.Read(b)
	if err != nil {
		log.Printf("[UUID] Failed to generate UUID: %v", err)
		// Fallback to timestamp-based UUID if crypto/rand fails
		return time.Now().Format("20060102150405000000")
	}
	return hex.EncodeToString(b)
}
