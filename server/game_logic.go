package main

import (
	"log"
	"math"
	"sort"
)

// AttackType represents different attack types
type AttackType string

const (
	AttackMelee AttackType = "melee"
	AttackArrow AttackType = "arrow"
	AttackMagic AttackType = "magic"
)

// AttackData represents an attack action
type AttackData struct {
	AttackerID  string     `json:"attackerId"`
	AttackType  AttackType `json:"attackType"`
	X           float64    `json:"x"`
	Y           float64    `json:"y"`
	Direction   string     `json:"direction"` // "left" or "right"
	FacingRight bool       `json:"facingRight"`
	// Which of the three sword animations this blow is. The server has no
	// opinion on it - reach and damage are the same either way - but it is
	// relayed so every client shows the blow that was actually thrown, and so
	// two blades meeting in a parry can be kept visually distinct.
	Swing            string  `json:"swing,omitempty"`
	DamageMultiplier float64 `json:"damageMultiplier"` // Power-up damage multiplier
}

// Attack ranges (in pixels).
//
// Distances are measured between player origins (top-left of a 110x110
// sprite), so a 30px melee range meant the two sprites had to overlap almost
// exactly before a sword could connect - in practice it never did. One sprite
// width plus a little reach is what actually feels right.
const (
	MeleeRange  = 120.0
	ArrowRange  = 400.0
	MagicRange  = 200.0
	MagicRadius = 80.0 // AoE radius for magic

	// How far the shooter's reported arrow impact may sit from the victim's
	// server-side position before the claim is rejected. Remote players are
	// drawn interpolated ~100ms in the past, so some slack is expected.
	ArrowHitTolerance = 160.0
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

	broadcastAttack(room, attackData)
	applyAttackDamage(room, attacker, attackData)
}

// broadcastAttack tells every client to play the swing.
//
// Kept separate from the damage so a sword blow can be shown immediately
// while its outcome waits out the parry window (see parry.go).
func broadcastAttack(room *Room, attackData AttackData) {
	room.Broadcast("player_attack", map[string]interface{}{
		"attackerId":  attackData.AttackerID,
		"attackType":  attackData.AttackType,
		"x":           attackData.X,
		"y":           attackData.Y,
		"direction":   attackData.Direction,
		"facingRight": attackData.FacingRight,
		"swing":       attackData.Swing,
	}, nil)
}

// applyAttackDamage resolves who the attack hits and hurts them.
func applyAttackDamage(room *Room, attacker *Player, attackData AttackData) {
	log.Printf("[Combat] Processing %s attack from %s at (%.2f, %.2f)",
		attackData.AttackType, attacker.Name, attackData.X, attackData.Y)

	victims := findVictims(room, attacker, attackData)

	for _, victim := range victims {
		applyDamage(room, attacker, victim, attackData.AttackType, attackData.DamageMultiplier)
	}
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

		// Allies are not targets. In free-for-all everyone has a team of
		// their own, so this never fires there (see bots.go).
		if sameTeam(attacker, player) {
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
func applyDamage(room *Room, attacker *Player, victim *Player, attackType AttackType, damageMultiplier float64) {
	// Calculate base damage
	baseDamage := 0
	switch attackType {
	case AttackMelee:
		baseDamage = MeleeDamage
	case AttackArrow:
		baseDamage = ArrowDamage
	case AttackMagic:
		baseDamage = MagicDamage
	}

	// Apply damage multiplier from power-ups
	if damageMultiplier <= 0 {
		damageMultiplier = 1.0
	}
	damage := int(float64(baseDamage) * damageMultiplier)

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

	// The match is over when one side is left standing. In free-for-all each
	// fighter is their own side, so this is the same "last one alive" rule
	// it has always been.
	room.mu.RLock()
	aliveTeams, lastAlive := room.aliveTeamsLocked()
	room.mu.RUnlock()

	if aliveTeams <= 1 {
		handleMatchEnd(room, lastAlive)
	}
}

// handleMatchEnd handles match conclusion
func handleMatchEnd(room *Room, winner *Player) {
	room.mu.Lock()
	room.IsGameActive = false
	room.mu.Unlock()

	// Stop game loop
	room.StopGameLoop()

	winnerData := map[string]interface{}{
		"reason": "last_standing",
	}

	if winner != nil {
		winnerData["winnerId"] = winner.ID
		winnerData["winnerName"] = winner.Name

		// In team play the survivor is only a representative of the side that
		// won, so name its team-mates too.
		winnerData["winnerTeam"] = winner.Team
		room.mu.RLock()
		mates := make([]string, 0)
		for _, player := range room.Players {
			if player.Team == winner.Team {
				mates = append(mates, player.Name)
			}
		}
		teamed := room.TeamMode != TeamModeFFA && room.TeamMode != ""
		room.mu.RUnlock()

		if teamed && len(mates) > 1 {
			sort.Strings(mates)
			winnerData["winnerNames"] = mates
		}

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
