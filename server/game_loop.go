package main

import (
	"log"
	"time"
)

// Game loop constants
const (
	TICK_RATE     = 20                    // 20 ticks per second
	TICK_INTERVAL = 50 * time.Millisecond // 50ms per tick
)

// StartGameLoop starts the authoritative server game loop
// This ensures regular state broadcasts regardless of client activity
func (r *Room) StartGameLoop() {
	log.Printf("[GameLoop] Starting game loop for room %s (tick rate: %dHz)", r.Code, TICK_RATE)

	ticker := time.NewTicker(TICK_INTERVAL)
	defer ticker.Stop()

	r.mu.Lock()
	r.currentTick = 0
	r.stopGameLoop = make(chan struct{})
	r.mu.Unlock()

	for {
		select {
		case <-ticker.C:
			r.mu.Lock()

			if !r.IsGameActive {
				r.mu.Unlock()
				log.Printf("[GameLoop] Game no longer active in room %s, stopping loop", r.Code)
				return
			}

			// Increment tick counter
			r.currentTick++

			// Broadcast game state to all clients
			r.broadcastGameStateLocked()

			r.mu.Unlock()

		case <-r.stopGameLoop:
			log.Printf("[GameLoop] Game loop stopped for room %s", r.Code)
			return
		}
	}
}

// StopGameLoop stops the game loop
func (r *Room) StopGameLoop() {
	if r.stopGameLoop != nil {
		close(r.stopGameLoop)
		r.stopGameLoop = nil
		log.Printf("[GameLoop] Stop signal sent for room %s", r.Code)
	}
}

// broadcastGameStateLocked broadcasts current game state to all clients
// Assumes lock is already held
func (r *Room) broadcastGameStateLocked() {
	// Get current timestamp for all player states (consistent across all players)
	now := time.Now().UnixMilli()

	// Get all player states
	playerStates := make([]map[string]interface{}, 0, len(r.Players))
	for _, player := range r.Players {
		playerStates = append(playerStates, map[string]interface{}{
			"playerId":    player.ID,
			"x":           player.X,
			"y":           player.Y,
			"vx":          player.VX,
			"vy":          player.VY,
			"animation":   player.Animation,
			"facingRight": player.FacingRight,
			"health":      player.Health,
			"isAlive":     player.IsAlive,
			"timestamp":   now, // CRITICAL: Add timestamp for interpolation
		})
	}

	// Broadcast to all players
	r.broadcastLocked("game_state_sync", map[string]interface{}{
		"players":   playerStates,
		"tick":      r.currentTick,
		"timestamp": now,
	}, nil)
}
