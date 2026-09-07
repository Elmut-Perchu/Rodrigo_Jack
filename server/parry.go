package main

import (
	"log"
	"math"
	"time"
)

// ParryWindow is the grace period between a sword swing and the moment its
// damage lands.
//
// Melee used to resolve the instant the server heard about it, so whoever's
// packet arrived first simply won. Holding the blow for a beat gives the
// opponent a real chance to answer with their own swing: if both blades are
// out and meeting, the hits cancel into a parry instead of trading damage.
//
// Short enough to stay responsive, long enough to absorb normal latency
// between two players on the same match.
const ParryWindow = 220 * time.Millisecond

// ClashRangeFactor widens the melee reach slightly when testing whether two
// blades meet. A parry should be a little more forgiving than a clean hit,
// otherwise near-simultaneous swings trade damage and the mechanic never
// triggers.
const ClashRangeFactor = 1.35

// PendingSwing is a sword blow waiting out its parry window.
type PendingSwing struct {
	Attacker *Player
	Data     AttackData
	At       time.Time
	timer    *time.Timer
}

// registerSwing queues a melee blow, or resolves it immediately as a parry if
// the opponent already has a blade out meeting this one.
func (r *Room) registerSwing(attacker *Player, data AttackData) {
	r.mu.Lock()

	if r.pendingSwings == nil {
		r.pendingSwings = make(map[string]*PendingSwing)
	}

	// Does an opponent's pending swing meet this one?
	for _, other := range r.pendingSwings {
		if other.Attacker.ID == attacker.ID {
			continue
		}
		if !bladesMeet(data, other.Data) {
			continue
		}

		// Parry: both blows are cancelled, neither player takes damage.
		if other.timer != nil {
			other.timer.Stop()
		}
		delete(r.pendingSwings, other.Attacker.ID)

		midX := (data.X + other.Data.X) / 2
		midY := (data.Y + other.Data.Y) / 2
		defenderID := other.Attacker.ID
		r.mu.Unlock()

		log.Printf("[Combat] PARRY between %s and %s at (%.0f, %.0f)",
			attacker.Name, other.Attacker.Name, midX, midY)

		r.Broadcast("parry", map[string]interface{}{
			"x":          midX,
			"y":          midY,
			"attackerId": attacker.ID,
			"defenderId": defenderID,
		}, nil)
		return
	}

	// No clash: hold the blow, then let it land.
	swing := &PendingSwing{Attacker: attacker, Data: data, At: time.Now()}
	swing.timer = time.AfterFunc(ParryWindow, func() {
		r.resolveSwing(attacker.ID)
	})

	// A player swinging again before the previous blow resolved replaces it,
	// so spamming the key cannot stack up damage.
	if previous, exists := r.pendingSwings[attacker.ID]; exists && previous.timer != nil {
		previous.timer.Stop()
	}
	r.pendingSwings[attacker.ID] = swing

	r.mu.Unlock()
}

// resolveSwing applies a blow that was not parried in time.
func (r *Room) resolveSwing(attackerID string) {
	r.mu.Lock()
	swing, exists := r.pendingSwings[attackerID]
	if !exists {
		r.mu.Unlock()
		return // Parried, or superseded
	}
	delete(r.pendingSwings, attackerID)
	r.mu.Unlock()

	if !r.IsGameActive || !swing.Attacker.IsAlive {
		return
	}

	applyAttackDamage(r, swing.Attacker, swing.Data)
}

// bladesMeet reports whether two simultaneous swings collide.
//
// The blades meet when the two fighters are close enough AND swinging into
// each other - each one turned toward the other. Two players swinging the
// same way (one chasing the other) are not parrying: the one in front simply
// gets hit in the back.
func bladesMeet(a, b AttackData) bool {
	dx := b.X - a.X
	dy := b.Y - a.Y
	if math.Sqrt(dx*dx+dy*dy) > MeleeRange*ClashRangeFactor {
		return false
	}

	// a must be swinging toward b, and b back toward a.
	aFacesB := (a.FacingRight && dx > 0) || (!a.FacingRight && dx < 0)
	bFacesA := (b.FacingRight && dx < 0) || (!b.FacingRight && dx > 0)

	return aFacesB && bFacesA
}

// clearSwingsLocked drops any blows still in flight, between matches.
func (r *Room) clearSwingsLocked() {
	for _, swing := range r.pendingSwings {
		if swing.timer != nil {
			swing.timer.Stop()
		}
	}
	r.pendingSwings = make(map[string]*PendingSwing)
}
