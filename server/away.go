package main

import (
	"log"
	"time"
)

/*
Pausing a match when somebody is no longer looking at it.

A phone locking its screen, an app being switched away from, a notification
pulled down to read - all of them background the tab, and a backgrounded tab
stops getting requestAnimationFrame and has its timers throttled to roughly one
tick a minute. The client's whole loop stops: no physics, no input, no state
sent. The server never noticed, so it went on rebroadcasting that player's last
position to everyone else, and the match went on being fought around a fighter
who had become a statue - one that could still be shot.

The fix is the one Jacques asked for, which is also the simplest one that is
honest: while anybody is away, nobody plays. The alternative - carry on and let
the absent player be killed in their sleep - is worse in every case that matters,
and the players are usually in the same room and already know why it stopped.

The freeze itself happens on the clients, which already know how to do it:
GameVSSimple.loop has an isPaused branch that also holds the clock still, so
resuming does not hand the physics the whole length of the pause at once. All
this file does is decide when, and tell everyone.
*/

// How long a match will wait for someone who has walked away.
//
// It has to exist: without it one player putting their phone in a pocket would
// freeze three other people indefinitely, with nothing they could do about it.
// It is generous, because the common cases - reading a notification, turning
// the screen to landscape, answering a quick message - are all well under it.
const AwayGraceLimit = 45 * time.Second

// handlePlayerAway marks a player as no longer watching, and pauses the match.
func (p *Player) handlePlayerAway(_ *Message) {
	if p.Room == nil {
		return
	}
	p.Room.setAway(p, true)
}

// handlePlayerBack marks a player as watching again, and resumes if they were
// the last one missing.
func (p *Player) handlePlayerBack(_ *Message) {
	if p.Room == nil {
		return
	}
	p.Room.setAway(p, false)
}

// setAway records the change and re-derives whether the match is paused.
func (r *Room) setAway(player *Player, away bool) {
	r.mu.Lock()

	if player.Away == away {
		r.mu.Unlock()
		return
	}
	player.Away = away
	if away {
		player.AwaySince = time.Now()
	}

	log.Printf("[Away] %s in room %s: away=%v", player.Name, r.Code, away)
	r.refreshPauseLocked()
	r.mu.Unlock()
}

// awayPlayersLocked lists who is currently not watching.
//
// Bots are skipped: they have no screen to leave, and the client running them
// reports its own absence under its own id.
func (r *Room) awayPlayersLocked() []*Player {
	var out []*Player
	for _, p := range r.Players {
		if !p.IsBot && p.Away {
			out = append(out, p)
		}
	}
	return out
}

// refreshPauseLocked derives Paused from who is away and announces any change.
// The room mutex must already be held.
func (r *Room) refreshPauseLocked() {
	missing := r.awayPlayersLocked()
	shouldPause := len(missing) > 0 && r.IsGameActive

	if shouldPause == r.Paused {
		// Still paused, but by a different set of people than a moment ago:
		// say so, or the overlay keeps naming somebody who has come back.
		if shouldPause {
			r.announcePauseLocked(missing)
		}
		return
	}

	r.Paused = shouldPause

	if shouldPause {
		r.startAwayTimerLocked()
		r.announcePauseLocked(missing)
		return
	}

	r.stopAwayTimerLocked()
	r.broadcastLocked("match_resumed", map[string]interface{}{}, nil)
}

func (r *Room) announcePauseLocked(missing []*Player) {
	names := make([]string, 0, len(missing))
	ids := make([]string, 0, len(missing))
	for _, p := range missing {
		names = append(names, p.Name)
		ids = append(ids, p.ID)
	}

	r.broadcastLocked("match_paused", map[string]interface{}{
		"awayIds":   ids,
		"awayNames": names,
		"graceMs":   AwayGraceLimit.Milliseconds(),
	}, nil)
}

// startAwayTimerLocked arms the backstop that resumes without whoever has not
// come back. Re-arming on every pause is deliberate: the countdown belongs to
// the current absence, not to the first one of the match.
func (r *Room) startAwayTimerLocked() {
	r.stopAwayTimerLocked()
	code := r.Code
	r.awayTimer = time.AfterFunc(AwayGraceLimit, func() {
		if roomManager == nil {
			return
		}
		if room := roomManager.GetRoom(code); room != nil {
			room.giveUpWaiting()
		}
	})
}

func (r *Room) stopAwayTimerLocked() {
	if r.awayTimer != nil {
		r.awayTimer.Stop()
		r.awayTimer = nil
	}
}

// giveUpWaiting resumes a match whose missing player never came back.
//
// They stay in the room and stay marked away - their client will say so the
// moment it wakes up - but the others get their match back. Clearing the flag
// here instead would mean a sleeping phone silently rejoining a fight it is not
// watching, which is the very thing this file exists to prevent.
func (r *Room) giveUpWaiting() {
	r.mu.Lock()
	defer r.mu.Unlock()

	if !r.Paused {
		return
	}

	missing := r.awayPlayersLocked()
	log.Printf("[Away] room %s waited %s, resuming without %d player(s)",
		r.Code, AwayGraceLimit, len(missing))

	r.Paused = false
	r.stopAwayTimerLocked()
	r.broadcastLocked("match_resumed", map[string]interface{}{
		"abandoned": true,
	}, nil)
}

// isPaused answers the combat handlers, which must refuse everything while the
// match is held. Without this a player could be hit during the pause by a swing
// already on its way when it began.
func (r *Room) isPaused() bool {
	if r == nil {
		return false
	}
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.Paused
}
