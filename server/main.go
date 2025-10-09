package main

import (
	"log"
	"net/http"

	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"
)

// WebSocket upgrader configuration
var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	// Allow connections from any origin (development only)
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

// Global room manager
var roomManager *RoomManager

func main() {
	log.Println("[Server] Starting Rodrigo Jack VS Mode Server...")

	// Initialize room manager
	roomManager = NewRoomManager()

	// Setup router
	router := mux.NewRouter()
	router.HandleFunc("/ws", handleWebSocket)
	router.HandleFunc("/health", handleHealth)

	// Start server
	port := ":8080"
	log.Printf("[Server] WebSocket server listening on %s", port)
	log.Printf("[Server] WebSocket endpoint: ws://localhost%s/ws", port)
	log.Printf("[Server] Health check: http://localhost%s/health", port)

	err := http.ListenAndServe(port, router)
	if err != nil {
		log.Fatal("[Server] Error starting server:", err)
	}
}

// Health check endpoint
func handleHealth(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("OK"))
	log.Println("[Health] Health check requested")
}

// WebSocket connection handler
func handleWebSocket(w http.ResponseWriter, r *http.Request) {
	log.Printf("[WebSocket] New connection attempt from %s", r.RemoteAddr)

	// Upgrade HTTP connection to WebSocket
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[WebSocket] Failed to upgrade connection: %v", err)
		return
	}

	log.Printf("[WebSocket] Connection upgraded successfully: %s", r.RemoteAddr)

	// Create new player
	player := NewPlayer(conn)
	defer player.Close()

	// Handle player messages
	player.HandleMessages()
}
