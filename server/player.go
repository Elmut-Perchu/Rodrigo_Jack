package main

import (
	"encoding/json"
	"log"
	"time"

	"github.com/gorilla/websocket"
)

// Player represents a connected client
type Player struct {
	ID       string          `json:"id"`
	Name     string          `json:"name"`
	Conn     *websocket.Conn `json:"-"`
	Room     *Room           `json:"-"`
	IsReady  bool            `json:"isReady"`
	IsHost   bool            `json:"isHost"`
	SendChan chan []byte     `json:"-"`
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
		ID:       generateUUID(),
		Conn:     conn,
		IsReady:  false,
		IsHost:   false,
		SendChan: make(chan []byte, 256),
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

		// Parse message
		var msg Message
		if err := json.Unmarshal(messageData, &msg); err != nil {
			log.Printf("[Player] Failed to parse message: %v", err)
			continue
		}

		log.Printf("[Player] %s received message: %s", p.ID, msg.Type)

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
	case "ping":
		p.sendMessage("pong", nil)
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

	p.Name = playerName

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
	if p.Room == nil {
		log.Printf("[Player] %s not in a room", p.ID)
		return
	}

	isReady, ok := msg.Data["isReady"].(bool)
	if !ok {
		log.Printf("[Player] Invalid isReady value")
		return
	}

	p.IsReady = isReady
	log.Printf("[Player] %s ready status: %v", p.ID, p.IsReady)

	// Broadcast to room
	p.Room.Broadcast("player_ready", map[string]interface{}{
		"playerId": p.ID,
		"isReady":  p.IsReady,
	}, nil)
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

	log.Printf("[Chat] %s: %s", p.Name, message)

	// Broadcast to room
	p.Room.Broadcast("chat_message", map[string]interface{}{
		"playerId":   p.ID,
		"playerName": p.Name,
		"message":    message,
	}, nil)
}

// sendMessage sends a message to the player
func (p *Player) sendMessage(msgType string, data map[string]interface{}) {
	msg := Message{
		Type:      msgType,
		Data:      data,
		Timestamp: time.Now().UnixMilli(),
	}

	msgBytes, err := json.Marshal(msg)
	if err != nil {
		log.Printf("[Player] Failed to marshal message: %v", err)
		return
	}

	select {
	case p.SendChan <- msgBytes:
	default:
		log.Printf("[Player] Send channel full, closing connection: %s", p.ID)
		p.Close()
	}
}

// writePump sends messages from SendChan to WebSocket connection
func (p *Player) writePump() {
	ticker := time.NewTicker(54 * time.Second)
	defer func() {
		ticker.Stop()
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

		case <-ticker.C:
			p.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := p.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
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

// generateUUID generates a simple UUID
func generateUUID() string {
	return time.Now().Format("20060102150405") + "-" + randomString(6)
}

// randomString generates a random string of given length
func randomString(length int) string {
	const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	result := make([]byte, length)
	for i := range result {
		result[i] = charset[time.Now().UnixNano()%int64(len(charset))]
		time.Sleep(1 * time.Nanosecond)
	}
	return string(result)
}
