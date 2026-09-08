package main

import (
	"log"
	"time"
)

// ArenaArrow is an arrow that exists in the world.
//
// Arrows are TowerFall-style consumables: firing one removes it from the
// shooter's quiver, and the only way to get it back is to walk over it where
// it landed. The server keeps this registry so that two players cannot pick
// up the same arrow, and so late joiners can be told what is already lying
// around.
//
// Flight itself is simulated on the clients (straight line, constant speed),
// which keeps the arrows perfectly smooth without streaming their positions.
// The shooter is authoritative for what its own arrow hits.
type ArenaArrow struct {
	ID      string  `json:"arrowId"`
	OwnerID string  `json:"ownerId"`
	X       float64 `json:"x"`
	Y       float64 `json:"y"`
	DirX    float64 `json:"dirX"`
	// The vertical half of the aim. Shots used to be a side - left or right -
	// but the arena's bow now points up, down and diagonally, so what has to
	// be relayed is a direction, not a facing.
	DirY  float64 `json:"dirY"`
	Stuck bool    `json:"stuck"`

	// Who this arrow was last shot into, and when. A hit plants it at the
	// victim's feet - inside their own pickup box - so without this every
	// arrow that connects is a free arrow for the person who was shot.
	StruckBy string    `json:"-"`
	StruckAt time.Time `json:"-"`

	// Launch parameters, decided by how long the shooter held the draw.
	// Relayed untouched: the server does not simulate flight, but every
	// client needs the same numbers to agree on where the arrow goes.
	Speed float64 `json:"speed"`
	Range float64 `json:"range"`
}

// MaxArrowsInFlight caps the registry so a misbehaving client cannot grow it
// without bound.
const MaxArrowsPerRoom = 64

// How long the fighter an arrow just went through is barred from picking it
// up. The arrow lands at their ankles, well inside their pickup radius, so
// without a delay the shot is collected by its own victim on the same frame -
// which read as "arrows vanish when they hit someone".
const VictimClaimDelay = 1500 * time.Millisecond

// Quiver limits, mirroring constants/arrow_constants.js.
//
// The count lives on the server so it survives the lobby -> arena navigation
// and any reconnection. Held only on the client, a page reload handed the
// player a free refill, which defeats the whole point of having to walk over
// arrows to get them back.
const (
	StartingArrows = 3
	MaxArrows      = 7
)

// sendQuiver tells a fighter how many arrows they are carrying.
//
// A bot has no socket, so its count goes to the client running it - which
// needs the number to decide whether to shoot or go and fetch.
func (p *Player) sendQuiver() {
	payload := map[string]interface{}{
		"playerId": p.ID,
		"arrows":   p.Quiver,
		"max":      MaxArrows,
	}

	if p.IsBot {
		if controller := p.controller(); controller != nil {
			controller.sendMessage("quiver_update", payload)
		}
		return
	}

	p.sendMessage("quiver_update", payload)
}

// handleArrowSpawn registers an arrow the shooter just fired and tells the
// other clients to start simulating it.
func (p *Player) handleArrowSpawn(msg *Message) {
	actor := p.actor(msg)
	if actor == nil || p.Room == nil || !p.Room.IsGameActive || !actor.IsAlive {
		return
	}

	arrowID, ok := msg.Data["arrowId"].(string)
	if !ok || arrowID == "" {
		return
	}
	x, xOk := msg.Data["x"].(float64)
	y, yOk := msg.Data["y"].(float64)
	dirX, dOk := msg.Data["dirX"].(float64)
	if !xOk || !yOk || !dOk {
		return
	}
	dirY, _ := msg.Data["dirY"].(float64)
	speed, _ := msg.Data["speed"].(float64)
	arrowRange, _ := msg.Data["range"].(float64)

	p.Room.mu.Lock()
	if len(p.Room.Arrows) >= MaxArrowsPerRoom {
		p.Room.mu.Unlock()
		log.Printf("[Arrows] Room %s at arrow cap, ignoring spawn from %s", p.Room.Code, p.Name)
		return
	}
	if _, exists := p.Room.Arrows[arrowID]; exists {
		p.Room.mu.Unlock()
		return // Duplicate spawn
	}
	if actor.Quiver <= 0 {
		p.Room.mu.Unlock()
		log.Printf("[Arrows] %s tried to fire with an empty quiver", actor.Name)
		actor.sendQuiver() // Re-sync the client, which thinks it had one
		return
	}
	actor.Quiver--
	p.Room.Arrows[arrowID] = &ArenaArrow{
		ID: arrowID, OwnerID: actor.ID, X: x, Y: y, DirX: dirX, DirY: dirY,
		Speed: speed, Range: arrowRange,
	}
	p.Room.mu.Unlock()

	actor.sendQuiver()

	log.Printf("[Arrows] %s fired arrow %s at (%.0f, %.0f) dir %.0f", actor.Name, arrowID, x, y, dirX)

	// Everyone but the shooter, who already has it locally.
	// The shooter's own client already has the arrow, but a host that fired
	// on a bot's behalf still needs it: exclude the sender only when it is
	// firing for itself.
	var exclude *Player
	if actor == p {
		exclude = p
	}
	p.Room.Broadcast("arrow_spawned", map[string]interface{}{
		"arrowId": arrowID,
		"ownerId": actor.ID,
		"x":       x,
		"y":       y,
		"dirX":    dirX,
		"dirY":    dirY,
		"speed":   speed,
		"range":   arrowRange,
	}, exclude)
}

// handleArrowStuck records where an arrow landed. Only the owner decides this,
// so every client converges on the same resting place instead of each
// simulating a slightly different impact.
func (p *Player) handleArrowStuck(msg *Message) {
	actor := p.actor(msg)
	if actor == nil || p.Room == nil {
		return
	}

	arrowID, ok := msg.Data["arrowId"].(string)
	if !ok {
		return
	}
	x, xOk := msg.Data["x"].(float64)
	y, yOk := msg.Data["y"].(float64)
	if !xOk || !yOk {
		return
	}

	p.Room.mu.Lock()
	arrow, exists := p.Room.Arrows[arrowID]
	if !exists || arrow.OwnerID != actor.ID {
		p.Room.mu.Unlock()
		return // Unknown arrow, or not yours to place
	}
	arrow.X, arrow.Y, arrow.Stuck = x, y, true
	p.Room.mu.Unlock()

	var exclude *Player
	if actor == p {
		exclude = p
	}
	p.Room.Broadcast("arrow_stuck", map[string]interface{}{
		"arrowId": arrowID,
		"x":       x,
		"y":       y,
	}, exclude)
}

// handleArrowPickup arbitrates who gets an arrow lying on the ground. The
// first request wins; everyone else is simply told the arrow is gone, so two
// players walking over it cannot both add one to their quiver.
func (p *Player) handleArrowPickup(msg *Message) {
	actor := p.actor(msg)
	if actor == nil || p.Room == nil || !actor.IsAlive {
		return
	}

	arrowID, ok := msg.Data["arrowId"].(string)
	if !ok {
		return
	}

	p.Room.mu.Lock()
	arrow, exists := p.Room.Arrows[arrowID]
	if !exists || !arrow.Stuck {
		p.Room.mu.Unlock()
		return // Already taken, or still in flight
	}
	if arrow.StruckBy == actor.ID && time.Since(arrow.StruckAt) < VictimClaimDelay {
		p.Room.mu.Unlock()
		return // The fighter it went through does not get to pocket it where it fell
	}
	if actor.Quiver >= MaxArrows {
		p.Room.mu.Unlock()
		return // Full: leave it on the ground for someone else
	}
	delete(p.Room.Arrows, arrowID)
	actor.Quiver++
	p.Room.mu.Unlock()

	actor.sendQuiver()

	log.Printf("[Arrows] %s picked up arrow %s", actor.Name, arrowID)

	// Sent to everyone, the picker included: it is the picker's confirmation
	// that the arrow really is theirs before the quiver counter moves.
	p.Room.Broadcast("arrow_picked", map[string]interface{}{
		"arrowId":  arrowID,
		"playerId": actor.ID,
	}, nil)
}

// handleArrowHit applies damage when the shooter reports its arrow connected.
//
// The arrow survives the hit: it falls to the ground at the point of impact
// and can be picked up again.
//
// Hit detection runs on the shooter because only it simulates the arrow with
// full fidelity. The server still sanity-checks the claim: the victim must be
// alive, in the same room, and actually near the reported impact point.
func (p *Player) handleArrowHit(msg *Message) {
	actor := p.actor(msg)
	if actor == nil || p.Room == nil || !p.Room.IsGameActive || !actor.IsAlive {
		return
	}

	arrowID, _ := msg.Data["arrowId"].(string)
	victimID, vOk := msg.Data["victimId"].(string)
	x, xOk := msg.Data["x"].(float64)
	y, yOk := msg.Data["y"].(float64)
	if !vOk || !xOk || !yOk || victimID == actor.ID {
		return
	}

	p.Room.mu.RLock()
	victim, victimExists := p.Room.Players[victimID]
	p.Room.mu.RUnlock()

	if !victimExists || !victim.IsAlive {
		return
	}

	// Arrows respect sides too: a stray shot into an ally does nothing.
	if sameTeam(actor, victim) {
		return
	}

	// Reject claims that place the impact nowhere near the victim. Generous
	// on purpose: the shooter sees the victim at an interpolated position a
	// little behind the server's, so an exact match is never expected.
	//
	// The arrow is only consumed once the claim is accepted: removing it up
	// front made a rejected claim destroy a perfectly good arrow, quietly
	// deleting it from the arena.
	if calculateDistance(x, y, victim.X, victim.Y) > ArrowHitTolerance {
		log.Printf("[CHEAT] %s claimed an arrow hit on %s from too far (%.0f px)",
			actor.Name, victim.Name, calculateDistance(x, y, victim.X, victim.Y))
		return
	}

	// A hit does not consume the arrow. It drops where it struck and stays
	// part of the arena's stock, for the victim or anyone else to collect -
	// arrows are only ever moved between quivers and the floor, never
	// destroyed, which is what makes running out of them meaningful.
	if arrowID != "" {
		p.Room.mu.Lock()
		if arrow, exists := p.Room.Arrows[arrowID]; exists {
			arrow.X, arrow.Y = x, y
			arrow.Stuck = false // Still falling; the owner reports where it lands
			arrow.StruckBy = victim.ID
			arrow.StruckAt = time.Now()
		}
		p.Room.mu.Unlock()

		p.Room.Broadcast("arrow_dropped", map[string]interface{}{
			"arrowId": arrowID,
			"x":       x,
			"y":       y,
		}, nil)
	}

	// Loosed with the bow against them: a heavy wound, worth several ordinary
	// arrows. Measured between the two players from the positions the server
	// already holds, so it is not something a shooter can claim for itself.
	if calculateDistance(actor.X, actor.Y, victim.X, victim.Y) <= POINT_BLANK_RANGE {
		log.Printf("[Combat] %s shot %s point blank", actor.Name, victim.Name)
		applyDamageAmount(p.Room, actor, victim, AttackArrow, PointBlankDamage)
		return
	}

	applyDamage(p.Room, actor, victim, AttackArrow, 1.0)
}

// DeflectTolerance is how far a fighter may be from the arrow it claims to
// have knocked out of the air.
const DeflectTolerance = 170.0

// handleArrowDeflect applies a sword swing that caught an arrow in flight.
//
// The arrow loses its momentum and drops to the ground, where anyone can pick
// it up. Ownership passes to the deflector: from that moment its client is the
// one simulating the fall, and the same rule that makes a shooter
// authoritative over its own arrow makes the deflector authoritative over
// where this one lands.
//
// Checked rather than trusted, like every other client claim: the arrow must
// still be in flight, must not already belong to the deflector, and the
// deflector must actually be next to it.
func (p *Player) handleArrowDeflect(msg *Message) {
	actor := p.actor(msg)
	if actor == nil || p.Room == nil || !p.Room.IsGameActive || !actor.IsAlive {
		return
	}

	arrowID, ok := msg.Data["arrowId"].(string)
	if !ok || arrowID == "" {
		return
	}
	x, xOk := msg.Data["x"].(float64)
	y, yOk := msg.Data["y"].(float64)
	if !xOk || !yOk {
		return
	}

	if calculateDistance(x, y, actor.X, actor.Y) > DeflectTolerance {
		log.Printf("[CHEAT] %s claimed a deflection from too far away", actor.Name)
		return
	}

	p.Room.mu.Lock()
	arrow, exists := p.Room.Arrows[arrowID]
	if !exists || arrow.Stuck || arrow.OwnerID == actor.ID {
		p.Room.mu.Unlock()
		return
	}
	arrow.OwnerID = actor.ID
	p.Room.mu.Unlock()

	log.Printf("[Arrows] %s knocked arrow %s out of the air", actor.Name, arrowID)

	p.Room.Broadcast("arrow_deflected", map[string]interface{}{
		"arrowId": arrowID,
		"ownerId": actor.ID,
	}, nil)
}

// sendArrowRegistry tells a client about every arrow already on the ground, so
// a player arriving (or reconnecting) mid-match sees what is there to pick up.
func (r *Room) sendArrowRegistry(player *Player) {
	r.mu.RLock()
	arrows := make([]map[string]interface{}, 0, len(r.Arrows))
	for _, a := range r.Arrows {
		arrows = append(arrows, map[string]interface{}{
			"arrowId": a.ID,
			"ownerId": a.OwnerID,
			"x":       a.X,
			"y":       a.Y,
			"dirX":    a.DirX,
			"dirY":    a.DirY,
			"stuck":   a.Stuck,
			"speed":   a.Speed,
			"range":   a.Range,
		})
	}
	r.mu.RUnlock()

	if len(arrows) == 0 {
		return
	}
	player.sendMessage("arrow_registry", map[string]interface{}{"arrows": arrows})
}

// clearArrowsLocked wipes the registry between matches.
func (r *Room) clearArrowsLocked() {
	r.Arrows = make(map[string]*ArenaArrow)
}
