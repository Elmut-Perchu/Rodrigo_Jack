package main

import (
	"log"
	"math"
)

// AttackType represents different attack types
type AttackType string

const (
	AttackMelee  AttackType = "melee"
	AttackArrow  AttackType = "arrow"
	AttackMagic  AttackType = "magic"
)

// AttackData represents an attack action
type AttackData struct {
	AttackerID  string     `json:"attackerId"`
	AttackType  AttackType `json:"attackType"`
	X           float64    `json:"x"`
	Y           float64    `json:"y"`
	Direction   string     `json:"direction"` // "left" or "right"
	FacingRight bool       `json:"facingRight"`
}

// Attack ranges (in pixels)
const (
	MeleeRange  = 30.0
	ArrowRange  = 400.0
	MagicRange  = 200.0
	MagicRadius = 80.0 // AoE radius for magic
)

// Damage values
const (
	MeleeDamage = 15
	ArrowDamage = 20
	MagicDamage = 25
)

// ProcessAttack handles combat logic with server authority
func ProcessAttack(room *Room, attackData AttackData) {
	room.mu.RLock()
	attacker, attackerExists := room.Players[attackData.AttackerID]
	room.mu.RUnlock()

	if !attackerExists || !attacker.IsAlive {
		log.Printf("[Combat] Attacker %s not found or dead", attackData.AttackerID)
		return
	}

	log.Printf("[Combat] Processing %s attack from %s at (%.2f, %.2f)",
		attackData.AttackType, attacker.Name, attackData.X, attackData.Y)

	// Find victims based on attack type
	victims := findVictims(room, attacker, attackData)

	// Apply damage to victims
	for _, victim := range victims {
		applyDamage(room, attacker, victim, attackData.AttackType)
	}

	// Broadcast attack to all players for visual effects
	room.Broadcast("player_attack", map[string]interface{}{
		"attackerId":  attackData.AttackerID,
		"attackType":  attackData.AttackType,
		"x":           attackData.X,
		"y":           attackData.Y,
		"direction":   attackData.Direction,
		"facingRight": attackData.FacingRight,
	}, nil)
}

// findVictims identifies players hit by the attack
func findVictims(room *Room, attacker *Player, attackData AttackData) []*Player {
	room.mu.RLock()
	defer room.mu.RUnlock()

	victims := make([]*Player, 0)

	for _, player := range room.Players {
		// Skip attacker and dead players
		if player.ID == attacker.ID || !player.IsAlive {
			continue
		}

		// Calculate distance
		distance := calculateDistance(attackData.X, attackData.Y, player.X, player.Y)

		// Check if hit based on attack type
		hit := false
		switch attackData.AttackType {
		case AttackMelee:
			hit = isMeleeHit(attacker, player, attackData, distance)
		case AttackArrow:
			hit = isArrowHit(attacker, player, attackData, distance)
		case AttackMagic:
			hit = isMagicHit(attackData, player, distance)
		}

		if hit {
			victims = append(victims, player)
			log.Printf("[Combat] Hit detected: %s -> %s (distance: %.2f)",
				attacker.Name, player.Name, distance)
		}
	}

	return victims
}

// isMeleeHit checks if melee attack hits
func isMeleeHit(attacker *Player, victim *Player, attackData AttackData, distance float64) bool {
	// Must be in melee range
	if distance > MeleeRange {
		return false
	}

	// Must be facing victim
	if attackData.FacingRight && victim.X < attacker.X {
		return false
	}
	if !attackData.FacingRight && victim.X > attacker.X {
		return false
	}

	return true
}

// isArrowHit checks if arrow attack hits
func isArrowHit(attacker *Player, victim *Player, attackData AttackData, distance float64) bool {
	// Must be in arrow range
	if distance > ArrowRange {
		return false
	}

	// Must be facing victim (projectile direction)
	if attackData.FacingRight && victim.X < attacker.X {
		return false
	}
	if !attackData.FacingRight && victim.X > attacker.X {
		return false
	}

	// Simple line-of-sight check (victim must be roughly in projectile path)
	// Allow 50px vertical tolerance
	verticalDiff := math.Abs(victim.Y - attackData.Y)
	if verticalDiff > 50.0 {
		return false
	}

	return true
}

// isMagicHit checks if magic attack hits (AoE)
func isMagicHit(attackData AttackData, victim *Player, distance float64) bool {
	// Magic is AoE, check if victim in radius
	return distance <= MagicRadius
}

// applyDamage applies damage to victim and broadcasts result
func applyDamage(room *Room, attacker *Player, victim *Player, attackType AttackType) {
	// Calculate damage
	damage := 0
	switch attackType {
	case AttackMelee:
		damage = MeleeDamage
	case AttackArrow:
		damage = ArrowDamage
	case AttackMagic:
		damage = MagicDamage
	}

	// Apply damage
	victim.Health -= damage
	if victim.Health < 0 {
		victim.Health = 0
	}

	log.Printf("[Combat] %s hit %s for %d damage (health: %d)",
		attacker.Name, victim.Name, damage, victim.Health)

	// Broadcast hit event
	room.Broadcast("player_hit", map[string]interface{}{
		"attackerId": attacker.ID,
		"victimId":   victim.ID,
		"damage":     damage,
		"health":     victim.Health,
		"attackType": attackType,
	}, nil)

	// Check for death
	if victim.Health <= 0 {
		handlePlayerDeath(room, victim, attacker)
	}
}

// handlePlayerDeath handles player death
func handlePlayerDeath(room *Room, victim *Player, attacker *Player) {
	victim.IsAlive = false

	log.Printf("[Combat] %s killed by %s", victim.Name, attacker.Name)

	// Broadcast death event
	room.Broadcast("player_death", map[string]interface{}{
		"victimId":   victim.ID,
		"killerId":   attacker.ID,
		"victimName": victim.Name,
		"killerName": attacker.Name,
	}, nil)

	// Count remaining alive players
	aliveCount := 0
	var lastAlive *Player
	room.mu.RLock()
	for _, player := range room.Players {
		if player.IsAlive {
			aliveCount++
			lastAlive = player
		}
	}
	room.mu.RUnlock()

	// Check for match end (only 1 or 0 players alive)
	if aliveCount <= 1 {
		handleMatchEnd(room, lastAlive)
	}
}

// handleMatchEnd handles match conclusion
func handleMatchEnd(room *Room, winner *Player) {
	room.mu.Lock()
	room.IsGameActive = false
	room.mu.Unlock()

	winnerData := map[string]interface{}{
		"reason": "last_standing",
	}

	if winner != nil {
		winnerData["winnerId"] = winner.ID
		winnerData["winnerName"] = winner.Name
		log.Printf("[Match] Match ended - Winner: %s", winner.Name)
	} else {
		winnerData["reason"] = "draw"
		log.Printf("[Match] Match ended - Draw")
	}

	// Broadcast match end
	room.Broadcast("match_end", winnerData, nil)
}

// calculateDistance calculates Euclidean distance between two points
func calculateDistance(x1, y1, x2, y2 float64) float64 {
	dx := x2 - x1
	dy := y2 - y1
	return math.Sqrt(dx*dx + dy*dy)
}

// RespawnPlayer respawns a dead player (if game mode supports it)
func RespawnPlayer(room *Room, playerID string, spawnX, spawnY float64) {
	room.mu.RLock()
	player, exists := room.Players[playerID]
	room.mu.RUnlock()

	if !exists {
		return
	}

	// Reset player state
	player.Health = 100
	player.IsAlive = true
	player.X = spawnX
	player.Y = spawnY
	player.VX = 0
	player.VY = 0

	log.Printf("[Combat] Respawned %s at (%.2f, %.2f)", player.Name, spawnX, spawnY)

	// Broadcast respawn
	room.Broadcast("player_respawn", map[string]interface{}{
		"playerId": playerID,
		"x":        spawnX,
		"y":        spawnY,
		"health":   player.Health,
	}, nil)
}
