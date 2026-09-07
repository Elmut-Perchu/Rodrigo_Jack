package main

import (
	"fmt"
	"log"
	"sort"
)

// A room holds four fighters; at most three of them can be machines.
const MaxBotsPerRoom = 3

// Team layouts a host can pick in the lobby.
const (
	TeamModeFFA    = "ffa"    // Every fighter for themselves
	TeamModeDuo    = "2v2"    // Two a side
	TeamModeThree  = "3v1"    // Three against one
	TeamModeCustom = "custom" // Sides picked slot by slot in the lobby
)

// Bots are fighters without a socket.
//
// The server simulates no physics at all - each client runs its own fighter and
// streams the result - so a bot is simply a fighter whose client happens to be
// the host's. The host runs its brain, moves its body and reports its blows;
// every other client sees an ordinary opponent and never needs to know the
// difference. That is why there is no AI anywhere in this package: putting one
// here would have meant re-implementing the whole platformer in Go.
func newBotPlayer(controller *Player, level, name string) *Player {
	bot := &Player{
		ID:           generateUUID(),
		Name:         name,
		IsBot:        true,
		BotLevel:     level,
		ControllerID: controller.ID,
		Room:         controller.Room,
		IsReady:      true, // Never keeps anyone waiting in the lobby
		GameReady:    true,
		Connected:    true,
		Animation:    "idle",
		FacingRight:  true,
		Health:       100,
		IsAlive:      true,
		Quiver:       StartingArrows,
	}

	// No socket to write to. sendMessage() already bails out on a closed send
	// path, so marking it closed at birth makes every broadcast skip the bot
	// silently - no broadcast code has to learn what a bot is.
	bot.sendClosed = true

	return bot
}

// controller returns the player whose client is running this bot.
func (p *Player) controller() *Player {
	if !p.IsBot || p.Room == nil {
		return nil
	}
	return p.Room.Players[p.ControllerID]
}

/*
actor resolves who a message is acting for.

A host drives its bots from its own connection, so it may act on their behalf
by naming one in `asPlayerId`. Anything else - or a bot it does not control -
falls back to the sender, which is what stops a client claiming another
player's attacks.
*/
func (p *Player) actor(msg *Message) *Player {
	asID, ok := msg.Data["asPlayerId"].(string)
	if !ok || asID == "" || asID == p.ID {
		return p
	}
	if p.Room == nil {
		return p
	}

	p.Room.mu.RLock()
	target, exists := p.Room.Players[asID]
	p.Room.mu.RUnlock()

	if !exists || !target.IsBot || target.ControllerID != p.ID {
		log.Printf("[CHEAT] %s tried to act as %s", p.Name, asID)
		return nil
	}
	return target
}

// === Lobby: filling slots with machines ===

func (p *Player) handleAddBot(msg *Message) {
	room := p.Room
	if room == nil {
		return
	}

	level, _ := msg.Data["level"].(string)
	if _, known := botNames[level]; !known {
		level = "soldier"
	}

	room.mu.Lock()
	if !p.IsHost {
		room.mu.Unlock()
		p.sendMessage("error", map[string]interface{}{"message": "Only the host can add an opponent"})
		return
	}
	if room.IsGameActive {
		room.mu.Unlock()
		p.sendMessage("error", map[string]interface{}{"message": "Match already running"})
		return
	}
	if len(room.Players) >= room.MaxPlayers {
		room.mu.Unlock()
		p.sendMessage("error", map[string]interface{}{"message": "Room is full"})
		return
	}
	if room.countBotsLocked() >= MaxBotsPerRoom {
		room.mu.Unlock()
		return
	}

	bot := newBotPlayer(p, level, room.nextBotNameLocked(level))
	room.Players[bot.ID] = bot
	room.assignTeamsLocked()
	room.mu.Unlock()

	log.Printf("[Bots] %s added %s (%s) to room %s", p.Name, bot.Name, level, room.Code)

	room.Broadcast("player_joined", map[string]interface{}{
		"playerId":   bot.ID,
		"playerName": bot.Name,
		"isBot":      true,
		"botLevel":   level,
	}, nil)
	room.BroadcastRoomState()
}

func (p *Player) handleRemoveBot(msg *Message) {
	room := p.Room
	if room == nil {
		return
	}

	botID, _ := msg.Data["playerId"].(string)
	if botID == "" {
		return
	}

	room.mu.Lock()
	if !p.IsHost || room.IsGameActive {
		room.mu.Unlock()
		return
	}
	bot, exists := room.Players[botID]
	if !exists || !bot.IsBot {
		room.mu.Unlock()
		return
	}
	delete(room.Players, botID)
	room.assignTeamsLocked()
	room.mu.Unlock()

	log.Printf("[Bots] %s removed %s from room %s", p.Name, bot.Name, room.Code)

	room.Broadcast("player_left", map[string]interface{}{"playerId": botID}, nil)
	room.BroadcastRoomState()
}

// handleSetTeams picks the team layout for the match.
func (p *Player) handleSetTeams(msg *Message) {
	room := p.Room
	if room == nil {
		return
	}

	mode, _ := msg.Data["mode"].(string)
	switch mode {
	case TeamModeFFA, TeamModeDuo, TeamModeThree, TeamModeCustom:
	default:
		return
	}

	room.mu.Lock()
	if !p.IsHost || room.IsGameActive {
		room.mu.Unlock()
		return
	}
	room.TeamMode = mode
	room.assignTeamsLocked()
	room.mu.Unlock()

	log.Printf("[Teams] Room %s set to %s", room.Code, mode)
	room.BroadcastRoomState()
}

/*
handleBotState carries a bot's pose from the client running it.

Identical in every respect to a player reporting its own position, including
the anti-cheat checks: the host is trusted with its bots' movement exactly as
much as it is trusted with its own.
*/
func (p *Player) handleBotState(msg *Message) {
	bot := p.actor(msg)
	if bot == nil || bot == p || !bot.IsBot {
		return
	}
	bot.applyStateUpdate(msg)
}

// === Teams ===

/*
handleSetPlayerTeam moves one fighter to a side.

Clicking a slot in the lobby is the free-form alternative to the presets: it
lets the host build 2v1v1, or any other split the presets do not cover. Doing
so switches the room to custom, which stops the presets from recomputing - and
therefore undoing - what was just chosen by hand.
*/
func (p *Player) handleSetPlayerTeam(msg *Message) {
	room := p.Room
	if room == nil {
		return
	}

	targetID, _ := msg.Data["playerId"].(string)
	teamValue, teamOk := msg.Data["team"].(float64)
	if targetID == "" || !teamOk {
		return
	}
	team := int(teamValue)
	if team < 1 || team > 4 {
		return
	}

	room.mu.Lock()
	if !p.IsHost || room.IsGameActive {
		room.mu.Unlock()
		return
	}
	target, exists := room.Players[targetID]
	if !exists {
		room.mu.Unlock()
		return
	}
	target.Team = team
	room.TeamMode = TeamModeCustom
	room.mu.Unlock()

	log.Printf("[Teams] %s put %s on team %d in room %s", p.Name, target.Name, team, room.Code)
	room.BroadcastRoomState()
}

/*
assignTeamsLocked hands out sides.

Slots are ordered by player id, the same ordering the clients use for colours
and spawns, so everyone agrees on who is on which side without another round
trip. In free-for-all every fighter gets their own team number, which lets the
damage and match-end rules treat both layouts identically.
*/
func (r *Room) assignTeamsLocked() {
	ids := make([]string, 0, len(r.Players))
	for id := range r.Players {
		ids = append(ids, id)
	}
	sort.Strings(ids)

	for index, id := range ids {
		player := r.Players[id]
		switch r.TeamMode {
		case TeamModeCustom:
			// Sides were chosen by hand: leave them alone. Only somebody who
			// has just arrived needs a value, and they start on their own
			// until the host places them.
			if player.Team == 0 {
				player.Team = index + 1
			}
		case TeamModeDuo:
			// Two a side: slots 0 and 2 on the left, 1 and 3 on the right.
			if index%2 == 0 {
				player.Team = 1
			} else {
				player.Team = 2
			}
		case TeamModeThree:
			// The odd one out is the second slot, so the host is never
			// automatically the lone fighter.
			if index == 1 {
				player.Team = 2
			} else {
				player.Team = 1
			}
		default:
			// Free-for-all: a team of one each.
			player.Team = index + 1
		}
	}
}

// sameTeam reports whether two fighters are allies. In free-for-all nobody is.
func sameTeam(a, b *Player) bool {
	return a.Team != 0 && a.Team == b.Team
}

// aliveTeamsLocked counts the sides that still have someone standing.
func (r *Room) aliveTeamsLocked() (int, *Player) {
	teams := make(map[int]bool)
	var lastAlive *Player

	for _, player := range r.Players {
		if !player.IsAlive {
			continue
		}
		teams[player.Team] = true
		lastAlive = player
	}

	return len(teams), lastAlive
}

// === Housekeeping ===

func (r *Room) countBotsLocked() int {
	count := 0
	for _, player := range r.Players {
		if player.IsBot {
			count++
		}
	}
	return count
}

var botNames = map[string]string{
	"rookie":  "Grunt",
	"soldier": "Sentinel",
	"veteran": "Warden",
	"master":  "Blackblade",
}

// nextBotNameLocked keeps two bots of the same level apart in the lobby.
func (r *Room) nextBotNameLocked(level string) string {
	base := botNames[level]
	if base == "" {
		base = "Computer"
	}

	taken := func(name string) bool {
		for _, player := range r.Players {
			if player.Name == name {
				return true
			}
		}
		return false
	}

	if !taken(base) {
		return base
	}
	for suffix := 2; suffix < 10; suffix++ {
		candidate := fmt.Sprintf("%s %d", base, suffix)
		if !taken(candidate) {
			return candidate
		}
	}
	return base
}

/*
adoptBotsLocked hands a departing host's bots to whoever takes over.

Without this the new host would have no way to move them: their brains live on
the old host's machine, which has gone. Re-pointing them means the match keeps
its opponents instead of quietly losing half the field.
*/
func (r *Room) adoptBotsLocked(oldHostID string, newHost *Player) {
	if newHost == nil {
		return
	}
	for _, player := range r.Players {
		if player.IsBot && player.ControllerID == oldHostID {
			player.ControllerID = newHost.ID
			log.Printf("[Bots] %s now runs %s", newHost.Name, player.Name)
		}
	}
}

// dropBotsLocked removes bots nobody is left to run.
func (r *Room) dropBotsLocked() []string {
	removed := make([]string, 0)
	for id, player := range r.Players {
		if !player.IsBot {
			continue
		}
		if _, hasController := r.Players[player.ControllerID]; !hasController {
			delete(r.Players, id)
			removed = append(removed, id)
		}
	}
	return removed
}
