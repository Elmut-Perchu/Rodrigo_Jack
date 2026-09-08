package main

import "log"

/*
Spirits summoned from a full gauge.

The server relays them and nothing more. A spectre does nothing by existing:
it is a thing that flies, and when it reaches someone the caster's client
reports an ordinary magic blow through player_attack, which goes through the
same arbitration and the same friendly-fire rule as every other attack in the
arena. There is deliberately no second set of combat rules here to fall out of
step with the first.

What that blow does is where a spirit differs from a sword or an arrow: it
takes no health at all, and holds its quarry still for a couple of seconds
instead (see applyParalysis in game_logic.go). So a spectre never kills - it
hands the opening to whoever is standing nearby.

That leaves this file with one job: making sure everybody sees the same spirit
appear and the same spirit go away. Flight is simulated on every client from
the spawn message - all of them home it on the same quarry, so it moves in
step without its position being streamed, exactly as arrows do.
*/

// MaxSpectresPerRoom caps the relay so a misbehaving client cannot fill the
// arena with wraiths.
const MaxSpectresPerRoom = 16

// handleSpectreSpawn passes a summoned spirit on to the other clients.
func (p *Player) handleSpectreSpawn(msg *Message) {
	actor := p.actor(msg)
	if actor == nil || p.Room == nil || !p.Room.IsGameActive || !actor.IsAlive {
		return
	}
	if actor.isHeld() {
		return // Held by someone else's spirit; see applyParalysis
	}

	spectreID, ok := msg.Data["spectreId"].(string)
	if !ok || spectreID == "" {
		return
	}
	targetID, _ := msg.Data["targetId"].(string)
	x, xOk := msg.Data["x"].(float64)
	y, yOk := msg.Data["y"].(float64)
	if !xOk || !yOk {
		return
	}
	dirX, _ := msg.Data["dirX"].(float64)

	p.Room.mu.Lock()
	if p.Room.Spectres == nil {
		p.Room.Spectres = make(map[string]string)
	}
	if _, exists := p.Room.Spectres[spectreID]; exists {
		p.Room.mu.Unlock()
		return // Duplicate summon
	}
	if len(p.Room.Spectres) >= MaxSpectresPerRoom {
		p.Room.mu.Unlock()
		log.Printf("[Spectres] Room %s at cap, ignoring summon from %s", p.Room.Code, actor.Name)
		return
	}
	p.Room.Spectres[spectreID] = actor.ID
	p.Room.mu.Unlock()

	log.Printf("[Spectres] %s sent a spirit after %s", actor.Name, targetID)

	// The caster already has it locally, so it is excluded - unless the sender
	// is a host casting on a bot's behalf, which still needs to be told.
	var exclude *Player
	if actor == p {
		exclude = p
	}
	p.Room.Broadcast("spectre_spawned", map[string]interface{}{
		"spectreId": spectreID,
		"ownerId":   actor.ID,
		"targetId":  targetID,
		"x":         x,
		"y":         y,
		"dirX":      dirX,
	}, exclude)
}

// handleSpectreEnd clears a spirit that struck home or ran out of time.
//
// Only its caster may end it, for the same reason only a shooter may say
// where its arrow came to rest: one machine has to decide, or the clients
// disagree about what is still in the air.
func (p *Player) handleSpectreEnd(msg *Message) {
	actor := p.actor(msg)
	if actor == nil || p.Room == nil {
		return
	}

	spectreID, ok := msg.Data["spectreId"].(string)
	if !ok || spectreID == "" {
		return
	}

	p.Room.mu.Lock()
	ownerID, exists := p.Room.Spectres[spectreID]
	if !exists || ownerID != actor.ID {
		p.Room.mu.Unlock()
		return
	}
	delete(p.Room.Spectres, spectreID)
	p.Room.mu.Unlock()

	p.Room.Broadcast("spectre_ended", map[string]interface{}{
		"spectreId": spectreID,
	}, nil)
}

// handleSpectreCut clears a spirit that a sword or an arrow caught in flight.
//
// Ending a spectre otherwise belongs to its caster alone, for the same reason
// a shooter owns its arrow: one machine has to decide, or the clients
// disagree about what is still in the air. This is the one message that lets
// somebody else do it, and it has to be, because the caster is precisely the
// person who would rather it kept flying.
//
// Checked rather than trusted, like every other client claim: the spirit must
// exist, must not be the cutter's own, and must not belong to a teammate.
// Where it happened is not checked at all - the clients simulate the flight
// themselves and no position for it is ever streamed, so the server has
// nothing to compare a claim against. Getting that wrong costs a wraith that
// had five seconds to live either way.
func (p *Player) handleSpectreCut(msg *Message) {
	actor := p.actor(msg)
	if actor == nil || p.Room == nil || !p.Room.IsGameActive || !actor.IsAlive {
		return
	}

	spectreID, ok := msg.Data["spectreId"].(string)
	if !ok || spectreID == "" {
		return
	}

	p.Room.mu.Lock()
	ownerID, exists := p.Room.Spectres[spectreID]
	if !exists || ownerID == actor.ID {
		p.Room.mu.Unlock()
		return
	}
	if owner, known := p.Room.Players[ownerID]; known && sameTeam(actor, owner) {
		p.Room.mu.Unlock()
		return
	}
	delete(p.Room.Spectres, spectreID)
	p.Room.mu.Unlock()

	log.Printf("[Spectres] %s cut down a spirit", actor.Name)

	p.Room.Broadcast("spectre_ended", map[string]interface{}{
		"spectreId": spectreID,
		"cut":       true,
	}, nil)

	// An arrow that did the cutting is not spent by it. It drops where it
	// struck and stays part of the arena's stock, exactly as one that has
	// gone into a fighter does - arrows are only ever moved between quivers
	// and the floor, never destroyed.
	arrowID, _ := msg.Data["arrowId"].(string)
	if arrowID == "" {
		return
	}

	x, xOk := msg.Data["x"].(float64)
	y, yOk := msg.Data["y"].(float64)
	if !xOk || !yOk {
		return
	}

	p.Room.mu.Lock()
	if arrow, arrowExists := p.Room.Arrows[arrowID]; arrowExists {
		arrow.X, arrow.Y = x, y
		arrow.Stuck = false // Still falling; its owner reports where it lands
	}
	p.Room.mu.Unlock()

	p.Room.Broadcast("arrow_dropped", map[string]interface{}{
		"arrowId": arrowID,
		"x":       x,
		"y":       y,
	}, nil)
}

// clearSpectresLocked wipes the registry between matches.
func (r *Room) clearSpectresLocked() {
	r.Spectres = make(map[string]string)
}
