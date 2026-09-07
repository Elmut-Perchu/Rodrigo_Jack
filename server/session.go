package main

import (
	"log"
	"time"
)

// RECONNECT_GRACE is how long a disconnected player keeps its slot (identity,
// position, ready state) before being evicted for good.
//
// This exists because the lobby and the battle arena are two separate HTML
// documents: navigating from vs_lobby.html to vs_game.html tears down the
// WebSocket. Without a grace period the last player leaving the lobby empties
// the room, which triggers cleanup() -> IsGameActive = false -> the room is
// destroyed, and the clients that arrive on vs_game.html a few milliseconds
// later land in a brand new, inactive room where player_state is rejected.
const RECONNECT_GRACE = 45 * time.Second

// GetRoom returns an existing room without creating one.
func (rm *RoomManager) GetRoom(code string) *Room {
	rm.mu.RLock()
	defer rm.mu.RUnlock()
	return rm.Rooms[code]
}

// TryReconnect re-attaches a fresh connection to the slot held by a previous
// connection with the same session ID. The new *Player adopts the old
// identity (ID, host/ready flags, position, health) so that remote clients,
// which track players by ID, never notice the gap.
//
// Returns true when the slot was adopted.
func (r *Room) TryReconnect(newPlayer *Player, sessionID string) bool {
	if sessionID == "" {
		return false
	}

	r.mu.Lock()

	var old *Player
	for _, candidate := range r.Players {
		if candidate.SessionID == sessionID {
			old = candidate
			break
		}
	}

	if old == nil {
		r.mu.Unlock()
		return false
	}

	// The slot is ours again: cancel the eviction timer.
	if old.graceTimer != nil {
		old.graceTimer.Stop()
		old.graceTimer = nil
	}

	log.Printf("[Session] Player %s reconnecting to room %s (session %s, was connected: %v)",
		old.Name, r.Code, sessionID, old.Connected)

	// If the old connection is somehow still alive, retire it so we never end
	// up with two sockets driving the same player.
	if old.Connected && old != newPlayer {
		old.markSendClosed()
	}

	delete(r.Players, old.ID)
	unregisterPlayer(newPlayer)

	// Adopt the previous identity and game state.
	newPlayer.ID = old.ID
	newPlayer.SessionID = sessionID
	newPlayer.IsHost = old.IsHost
	newPlayer.IsReady = old.IsReady
	newPlayer.GameReady = old.GameReady
	newPlayer.X, newPlayer.Y = old.X, old.Y
	newPlayer.VX, newPlayer.VY = old.VX, old.VY
	newPlayer.Health, newPlayer.IsAlive = old.Health, old.IsAlive
	newPlayer.Quiver = old.Quiver
	newPlayer.Animation, newPlayer.FacingRight = old.Animation, old.FacingRight
	newPlayer.Connected = true
	newPlayer.Room = r

	// Keep the newest nickname, but never regress to the placeholder.
	if newPlayer.Name == "" || newPlayer.Name == "Player" {
		newPlayer.Name = old.Name
	}

	r.Players[newPlayer.ID] = newPlayer
	if r.Host == old {
		r.Host = newPlayer
	}

	isGameActive := r.IsGameActive
	r.mu.Unlock()

	registerPlayer(newPlayer)

	log.Printf("[Session] Player %s restored at (%.1f, %.1f), room active: %v",
		newPlayer.Name, newPlayer.X, newPlayer.Y, isGameActive)

	return true
}

// HandleDisconnect marks a player as offline and starts the eviction timer
// instead of removing it straight away. Keeping the slot alive is what allows
// the room (and IsGameActive) to survive the lobby -> arena page navigation.
func (r *Room) HandleDisconnect(player *Player) {
	r.mu.Lock()

	// If the slot was already adopted by a newer connection, this Close() call
	// belongs to a stale socket and must not touch the room.
	current, stillHere := r.Players[player.ID]
	if !stillHere || current != player {
		r.mu.Unlock()
		log.Printf("[Session] Stale disconnect for %s ignored (slot already reclaimed)", player.Name)
		return
	}

	player.Connected = false

	if player.graceTimer != nil {
		player.graceTimer.Stop()
	}
	player.graceTimer = time.AfterFunc(RECONNECT_GRACE, func() {
		r.evictIfStillGone(player)
	})

	log.Printf("[Session] Player %s disconnected from room %s, holding slot for %s",
		player.Name, r.Code, RECONNECT_GRACE)

	r.mu.Unlock()

	// Let the remaining clients grey the player out rather than delete it.
	r.Broadcast("player_disconnected", map[string]interface{}{
		"playerId": player.ID,
	}, player)
}

// evictIfStillGone removes a player for good once the grace period expired
// without a reconnection.
func (r *Room) evictIfStillGone(player *Player) {
	r.mu.Lock()
	current, stillHere := r.Players[player.ID]
	reconnected := !stillHere || current != player || player.Connected
	player.graceTimer = nil
	r.mu.Unlock()

	if reconnected {
		log.Printf("[Session] Grace period over for %s but slot was reclaimed - keeping player", player.Name)
		return
	}

	log.Printf("[Session] Grace period expired for %s - removing from room %s", player.Name, r.Code)
	unregisterPlayer(player)
	r.RemovePlayer(player)
}

// hasConnectedPlayers reports whether anyone is actually online in the room.
func (r *Room) hasConnectedPlayers() bool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	for _, p := range r.Players {
		if p.Connected {
			return true
		}
	}
	return false
}

// markSendClosed flags the player as no longer writable and reports whether it
// had already been flagged. Callers use the return value to make Close()
// idempotent.
func (p *Player) markSendClosed() bool {
	p.sendMu.Lock()
	defer p.sendMu.Unlock()
	already := p.sendClosed
	p.sendClosed = true
	return already
}
