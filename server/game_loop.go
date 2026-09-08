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

	// A previous loop still standing is retired here rather than left to
	// accumulate. Rounds restart the loop, so without this every round after
	// the first added a second broadcaster: by the sixth, six goroutines were
	// pushing game_state_sync at 20Hz each and clients had to interpolate
	// through six times the traffic.
	if r.stopGameLoop != nil {
		close(r.stopGameLoop)
	}

	// Held locally as well as on the room. StopGameLoop nils the field, and
	// the select below used to read it straight from there without the mutex:
	// once nil, `case <-r.stopGameLoop` is a receive on a nil channel, which
	// blocks for ever, so the stop signal could no longer reach the very loop
	// it was meant to stop.
	stop := make(chan struct{})
	r.stopGameLoop = stop

	isActive := r.IsGameActive
	r.mu.Unlock()

	log.Printf("🔍 [GameLoop] Initial IsGameActive: %v for room %s", isActive, r.Code)

	for {
		select {
		case <-ticker.C:
			r.mu.Lock()

			log.Printf("🔍 [GameLoop] Tick %d - IsGameActive: %v, Players: %d", r.currentTick, r.IsGameActive, len(r.Players))

			if !r.IsGameActive {
				r.mu.Unlock()
				log.Printf("[GameLoop] Game no longer active in room %s, stopping loop", r.Code)
				return
			}

			// Increment tick counter
			r.currentTick++

			log.Printf("🔍 [GameLoop] Broadcasting state for tick %d", r.currentTick)

			// Broadcast game state to all clients
			r.broadcastGameStateLocked()

			log.Printf("✅ [GameLoop] Tick %d complete", r.currentTick)

			r.mu.Unlock()

		case <-stop:
			log.Printf("[GameLoop] Game loop stopped for room %s", r.Code)
			return
		}
	}
}

// StopGameLoop stops the game loop. The caller must hold r.mu.
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
			"spirit":      player.Spirit,
			"team":        player.Team,
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
