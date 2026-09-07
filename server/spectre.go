package main

import "log"

/*
Spirits summoned from a full gauge.

The server relays them and nothing more. A spectre carries no damage by
existing: it is a thing that flies, and when it reaches someone the caster's
client reports an ordinary magic blow through player_attack, which goes
through the same arbitration, the same friendly-fire rule and the same death
handling as every other attack in the arena. There is deliberately no second
set of combat rules here to fall out of step with the first.

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

// clearSpectresLocked wipes the registry between matches.
func (r *Room) clearSpectresLocked() {
	r.Spectres = make(map[string]string)
}
