package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"html"
	"log"
	"math"
	"strings"
	"time"

	"github.com/gorilla/websocket"
)

// Player represents a connected client
type Player struct {
	ID              string          `json:"id"`
	Name            string          `json:"name"`
	Conn            *websocket.Conn `json:"-"`
	Room            *Room           `json:"-"`
	IsReady         bool            `json:"isReady"`
	IsHost          bool            `json:"isHost"`
	SendChan        chan []byte     `json:"-"`
	LastMessageTime time.Time       `json:"-"`
	MessageCount    int             `json:"-"`
	// Game state
	X           float64 `json:"x"`
	Y           float64 `json:"y"`
	VX          float64 `json:"vx"`
	VY          float64 `json:"vy"`
	Animation   string  `json:"animation"`
	FacingRight bool    `json:"facingRight"`
	Health      int     `json:"health"`
	IsAlive     bool    `json:"isAlive"`
	// Validation tracking
	LastStateUpdate time.Time `json:"-"` // For rate limiting and movement validation
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
		Animation:       "idle",
		FacingRight:     true,
		Health:          100,
		IsAlive:         true,
		LastMessageTime: time.Now(),
		MessageCount:    0,
		LastStateUpdate: time.Now(),
	}

	log.Printf("[Player] New player created: %s", player.ID)

	// Start write pump
	go player.writePump()

	return player
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

		// Log raw message data for debugging
		log.Printf("[Player] %s received RAW data: %s", p.ID, string(messageData))

		// Parse message
		var msg Message
		if err := json.Unmarshal(messageData, &msg); err != nil {
			log.Printf("[Player] Failed to parse message: %v", err)
			log.Printf("[Player] Failed data was: %s", string(messageData))
			continue
		}

		log.Printf("[Player] %s received message type: %s", p.ID, msg.Type)
		log.Printf("[Player] %s message data: %+v", p.ID, msg.Data)

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
	case "chat_message":
		p.handleChatMessage(msg)
	case "player_state":
		p.handlePlayerState(msg)
	case "player_attack":
		p.handlePlayerAttack(msg)
	case "ping":
		// Send pong with timestamp
		p.sendMessage("pong", map[string]interface{}{
			"timestamp": msg.Data["timestamp"],
		})
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

	log.Printf("[Player] %s attempting to join room: %s (name: %s)", p.ID, roomCode, p.Name)

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
func (p *Player) handlePlayerState(msg *Message) {
	if p.Room == nil || !p.Room.IsGameActive {
		return
	}

	now := time.Now()

	// Rate limiting: max 60 updates/sec (16ms minimum delta)
	timeSinceLastUpdate := now.Sub(p.LastStateUpdate).Milliseconds()
	if timeSinceLastUpdate < MIN_UPDATE_DELTA {
		// Too fast, ignore this update
		return
	}

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
	if x < 0 || x > MAP_WIDTH || y < 0 || y > MAP_HEIGHT {
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

	dx := x - p.X
	dy := y - p.Y
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

	// Broadcast state to all players in room (including sender for reconciliation)
	p.Room.Broadcast("game_state_sync", map[string]interface{}{
		"players": p.Room.GetAllPlayerStates(),
	}, nil)
}

// handlePlayerAttack handles player attack actions
func (p *Player) handlePlayerAttack(msg *Message) {
	if p.Room == nil || !p.Room.IsGameActive {
		return
	}

	if !p.IsAlive {
		log.Printf("[Combat] Dead player %s attempted to attack", p.Name)
		return
	}

	// Extract attack data
	attackType, typeOk := msg.Data["attackType"].(string)
	x, xOk := msg.Data["x"].(float64)
	y, yOk := msg.Data["y"].(float64)
	direction, dirOk := msg.Data["direction"].(string)
	facingRight, facingOk := msg.Data["facingRight"].(bool)

	if !typeOk || !xOk || !yOk || !dirOk || !facingOk {
		log.Printf("[Combat] Invalid attack data from %s", p.Name)
		return
	}

	// Create attack data
	attackData := AttackData{
		AttackerID:  p.ID,
		AttackType:  AttackType(attackType),
		X:           x,
		Y:           y,
		Direction:   direction,
		FacingRight: facingRight,
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
	log.Printf("[SEND_MSG] Sending %s to player %s (%s)", msgType, p.ID, p.Name)

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

	log.Printf("[SEND_MSG] Attempting to send to channel (len=%d, cap=%d)", len(p.SendChan), cap(p.SendChan))

	select {
	case p.SendChan <- msgBytes:
		log.Printf("[SEND_MSG] Successfully sent %s to %s", msgType, p.Name)
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
					log.Printf("[SEND_MSG] Successfully sent %s after dropping old message", msgType)
				default:
					log.Printf("[SEND_MSG] Still full after drop, skipping message for %s", p.Name)
				}
			default:
				// Channel emptied in the meantime, retry
				select {
				case p.SendChan <- msgBytes:
					log.Printf("[SEND_MSG] Successfully sent %s on retry", msgType)
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

// writePump sends messages from SendChan to WebSocket connection with timeout detection
func (p *Player) writePump() {
	ticker := time.NewTicker(54 * time.Second)
	pongTimeout := time.NewTimer(60 * time.Second)
	pongReceived := make(chan struct{}, 1)

	defer func() {
		ticker.Stop()
		pongTimeout.Stop()
		p.Conn.Close()
	}()

	// Setup pong handler
	p.Conn.SetPongHandler(func(string) error {
		// Pong received, reset timeout
		select {
		case pongReceived <- struct{}{}:
		default:
		}
		return nil
	})

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

		case <-ticker.C:
			// Send ping
			p.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := p.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				log.Printf("[Player] Ping error: %v", err)
				return
			}

			// Reset pong timeout
			pongTimeout.Reset(60 * time.Second)

		case <-pongReceived:
			// Pong received, connection is alive
			// Timeout will be reset on next ping

		case <-pongTimeout.C:
			// No pong received within timeout, connection is dead (zombie)
			log.Printf("[Player] Pong timeout, closing zombie connection: %s (%s)", p.ID, p.Name)
			return
		}
	}
}

// Close cleans up player resources
func (p *Player) Close() {
	log.Printf("[Player] Closing connection: %s", p.ID)

	// Leave room if in one
	if p.Room != nil {
		p.Room.RemovePlayer(p)
	}

	// Close send channel
	close(p.SendChan)

	// Close WebSocket connection
	p.Conn.Close()
}

// generateUUID generates a cryptographically secure UUID
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
