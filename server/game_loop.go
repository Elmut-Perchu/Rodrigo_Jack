package main

import (
	"log"
	"time"
)

// Game loop constants.
//
// 50Hz, arrived at in two steps from the 20 this ran at for a long time. The
// rate is one of the terms in what a player actually sees: a state is worth
// broadcasting the moment it changes, and at 20Hz it waited 25ms on average for
// the next tick before leaving at all. Measured between two live clients, the
// perceived delay went 77ms at 20Hz, 50ms at 30Hz, 29ms at 50Hz.
//
// The cost stayed near nothing at every step - 1.7%, 2.1%, 2.4% of a core with
// four players connected and moving - because the work is in the connections
// rather than in the loop. That is a developer machine, though, and Render's
// free instance is capped at a tenth of a core, which is the one thing this
// change cannot prove locally.
//
// It does not need to be proven in advance: a client measures the interval it
// actually receives (interpolation_component.js observeInterval). If this
// instance cannot hold 50Hz, the clients report the rate it does manage, and
// the number to go back to is theirs rather than a guess.
const (
	TICK_RATE     = 50                    // 50 ticks per second
	TICK_INTERVAL = 20 * time.Millisecond // 20ms per tick
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

	debugf("🔍 [GameLoop] Initial IsGameActive: %v for room %s", isActive, r.Code)

	for {
		select {
		case <-ticker.C:
			r.mu.Lock()

			debugf("🔍 [GameLoop] Tick %d - IsGameActive: %v, Players: %d", r.currentTick, r.IsGameActive, len(r.Players))

			if !r.IsGameActive {
				r.mu.Unlock()
				log.Printf("[GameLoop] Game no longer active in room %s, stopping loop", r.Code)
				return
			}

			// Increment tick counter
			r.currentTick++

			debugf("🔍 [GameLoop] Broadcasting state for tick %d", r.currentTick)

			// Broadcast game state to all clients
			r.broadcastGameStateLocked()

			debugf("✅ [GameLoop] Tick %d complete", r.currentTick)

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
