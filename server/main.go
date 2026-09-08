package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"runtime/debug"
	"strings"
	"time"

	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"
)

// Allowed origins for CORS (whitelist). The production frontend domain
// (Vercel/Netlify) isn't known at build time, so it's appended from the
// ALLOWED_ORIGINS env var (comma-separated) instead of being hardcoded here.
var allowedOrigins = buildAllowedOrigins()

func buildAllowedOrigins() []string {
	origins := []string{
		"http://localhost:8000",
		"http://localhost:3000",
		"http://127.0.0.1:8000",
		"http://127.0.0.1:3000",
		"http://[::1]:8000",  // IPv6 localhost
		"http://[::1]:3000",  // IPv6 localhost
	}

	extra := os.Getenv("ALLOWED_ORIGINS")
	if extra != "" {
		for _, origin := range strings.Split(extra, ",") {
			origin = strings.TrimSpace(origin)
			if origin != "" {
				origins = append(origins, origin)
			}
		}
	}

	return origins
}

// WebSocket upgrader configuration
var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	// Check origin against whitelist
	CheckOrigin: func(r *http.Request) bool {
		origin := r.Header.Get("Origin")

		// Allow connections with no origin (direct connections, testing tools)
		if origin == "" {
			log.Printf("[CORS] Allowing connection with no origin header")
			return true
		}

		// Check against whitelist
		for _, allowed := range allowedOrigins {
			if origin == allowed {
				log.Printf("[CORS] Allowed origin: %s", origin)
				return true
			}
		}

		// Block unauthorized origins
		log.Printf("[CORS] BLOCKED unauthorized origin: %s", origin)
		return false
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
	router.HandleFunc("/api/rooms", handleGetRooms).Methods("GET")
	router.HandleFunc("/api/rooms/{code}", handleGetRoom).Methods("GET")

	// Start server (Render impose le port via $PORT)
	rawPort := os.Getenv("PORT")
	if rawPort == "" {
		rawPort = "8080"
	}
	port := ":" + rawPort
	log.Printf("[Server] WebSocket server listening on %s", port)
	log.Printf("[Server] WebSocket endpoint: ws://localhost%s/ws", port)
	log.Printf("[Server] Health check: http://localhost%s/health", port)

	err := http.ListenAndServe(port, router)
	if err != nil {
		log.Fatal("[Server] Error starting server:", err)
	}
}

// Health check endpoint
// buildRevision is the commit this binary was built from.
//
// Go stamps it into the binary automatically when building inside a git
// checkout, which is what the host does, so nothing has to be passed in.
// Twice now a fix has looked like it did not work when what had actually
// happened was that the running binary predated it; a plain "OK" cannot tell
// those two apart, and this can.
func buildRevision() string {
	info, ok := debug.ReadBuildInfo()
	if !ok {
		return "unknown"
	}
	for _, setting := range info.Settings {
		if setting.Key == "vcs.revision" {
			if len(setting.Value) > 12 {
				return setting.Value[:12]
			}
			return setting.Value
		}
	}
	return "unknown"
}

var startedAt = time.Now()

func handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":     "OK",
		"revision":   buildRevision(),
		"startedAt":  startedAt.UTC().Format(time.RFC3339),
		"uptimeSecs": int(time.Since(startedAt).Seconds()),
	})
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

// RoomInfo represents room information for API
type RoomInfo struct {
	Code        string `json:"code"`
	PlayerCount int    `json:"playerCount"`
	MaxPlayers  int    `json:"maxPlayers"`
	IsGameActive bool   `json:"isGameActive"`
	HostName    string `json:"hostName"`
}

// GET /api/rooms - List all available rooms
func handleGetRooms(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	roomManager.mu.RLock()
	defer roomManager.mu.RUnlock()

	rooms := make([]RoomInfo, 0)
	for code, room := range roomManager.Rooms {
		room.mu.RLock()

		// Only include rooms that are not full and not in game
		if len(room.Players) < room.MaxPlayers && !room.IsGameActive {
			hostName := "Unknown"
			if room.Host != nil {
				hostName = room.Host.Name
			}

			rooms = append(rooms, RoomInfo{
				Code:         code,
				PlayerCount:  len(room.Players),
				MaxPlayers:   room.MaxPlayers,
				IsGameActive: room.IsGameActive,
				HostName:     hostName,
			})
		}

		room.mu.RUnlock()
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"rooms": rooms,
		"count": len(rooms),
	})

	log.Printf("[API] Listed %d available rooms", len(rooms))
}

// GET /api/rooms/{code} - Get specific room info
func handleGetRoom(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	vars := mux.Vars(r)
	code := vars["code"]

	roomManager.mu.RLock()
	room, exists := roomManager.Rooms[code]
	roomManager.mu.RUnlock()

	if !exists {
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Room not found",
		})
		return
	}

	room.mu.RLock()
	defer room.mu.RUnlock()

	hostName := "Unknown"
	if room.Host != nil {
		hostName = room.Host.Name
	}

	roomInfo := RoomInfo{
		Code:         code,
		PlayerCount:  len(room.Players),
		MaxPlayers:   room.MaxPlayers,
		IsGameActive: room.IsGameActive,
		HostName:     hostName,
	}

	json.NewEncoder(w).Encode(roomInfo)
	log.Printf("[API] Room info requested: %s", code)
}
