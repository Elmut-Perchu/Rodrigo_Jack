package main

import (
	"encoding/json"
	"testing"
)

// newTestPlayer builds a player with no socket behind it. sendMessage only
// ever touches sendMu, sendClosed and SendChan, so a hand-built one records
// everything the room says to it without a connection existing.
func newTestPlayer(id, name string) *Player {
	return &Player{
		ID:          id,
		Name:        name,
		SendChan:    make(chan []byte, 256),
		Animation:   "idle",
		FacingRight: true,
		Health:      MAX_HEALTH,
		IsAlive:     true,
		Connected:   true,
		GameReady:   true,
		Quiver:      StartingArrows,
	}
}

// messagesOfType drains a player's outbox and returns every message of one
// type, decoded.
func messagesOfType(t *testing.T, player *Player, want string) []map[string]interface{} {
	t.Helper()

	found := make([]map[string]interface{}, 0)
	for {
		select {
		case raw := <-player.SendChan:
			var msg struct {
				Type string                 `json:"type"`
				Data map[string]interface{} `json:"data"`
			}
			if err := json.Unmarshal(raw, &msg); err != nil {
				t.Fatalf("undecodable message: %v", err)
			}
			if msg.Type == want {
				found = append(found, msg.Data)
			}
		default:
			return found
		}
	}
}

// TestFirstRoundScoresOneWinner is the reported bug, stated as a test: after
// the very first round of a match, exactly one fighter has a round to their
// name. Both showing one was what the score screen drew.
func TestFirstRoundScoresOneWinner(t *testing.T) {
	room := NewRoom("TEST")

	// Ids chosen so the sort order - which is what decides teams and spawns -
	// is fixed and readable: "a-jack" before "b-joe".
	jack := newTestPlayer("a-jack", "jack")
	joe := newTestPlayer("b-joe", "joe")

	room.Players[jack.ID] = jack
	room.Players[joe.ID] = joe
	jack.Room = room
	joe.Room = room

	room.mu.Lock()
	room.assignTeamsLocked()
	room.RoundWins = make(map[int]int)
	room.mu.Unlock()

	if jack.Team == joe.Team {
		t.Fatalf("two fighters share team %d, so no per-team score can tell them apart", jack.Team)
	}
	t.Logf("teams: jack=%d joe=%d", jack.Team, joe.Team)

	// joe takes the round.
	handlePlayerDeath(room, jack, joe)

	// Stop the intermission's backstop timer so the test does not leave one
	// running for a minute and a half.
	defer func() {
		room.mu.Lock()
		if room.roundReadyTimer != nil {
			room.roundReadyTimer.Stop()
		}
		room.mu.Unlock()
	}()

	ends := messagesOfType(t, jack, "round_end")
	if len(ends) != 1 {
		t.Fatalf("expected exactly one round_end, got %d", len(ends))
	}
	data := ends[0]
	t.Logf("round_end payload: %+v", data)

	wins, ok := data["playerWins"].(map[string]interface{})
	if !ok {
		t.Fatalf("round_end carries no playerWins: %+v", data)
	}

	if got := wins[joe.ID]; got != float64(1) {
		t.Errorf("winner joe should have 1 round, got %v", got)
	}
	if got := wins[jack.ID]; got != float64(0) {
		t.Errorf("loser jack should have 0 rounds, got %v", got)
	}

	ids, ok := data["winnerIds"].([]interface{})
	if !ok || len(ids) != 1 || ids[0] != joe.ID {
		t.Errorf("winnerIds should name joe alone, got %v", data["winnerIds"])
	}
}

// TestAnArrowCostsOneHeartAtAnyRange pins the rule down where it can only
// change on purpose: an arrow is worth a heart, and the distance it was fired
// from does not enter into it. A close shot used to be fatal outright.
func TestAnArrowCostsOneHeartAtAnyRange(t *testing.T) {
	const halvesPerHeart = 2

	if ArrowDamage != halvesPerHeart {
		t.Fatalf("an arrow should cost one heart (%d half-hearts), it costs %d",
			halvesPerHeart, ArrowDamage)
	}

	// Contact, and most of the arena away. Both must cost the same.
	for _, gap := range []float64{0, 60, 119, 121, 800} {
		room := NewRoom("TEST")

		shooter := newTestPlayer("a-shooter", "shooter")
		target := newTestPlayer("b-target", "target")
		room.Players[shooter.ID] = shooter
		room.Players[target.ID] = target
		shooter.Room = room
		target.Room = room

		room.mu.Lock()
		room.assignTeamsLocked()
		room.IsGameActive = true
		room.mu.Unlock()

		shooter.X, shooter.Y = 400, 300
		target.X, target.Y = 400+gap, 300

		before := target.Health
		shooter.handleArrowHit(&Message{
			Type: "arrow_hit",
			Data: map[string]interface{}{
				"victimId": target.ID,
				"x":        target.X,
				"y":        target.Y,
			},
		})

		if got := before - target.Health; got != ArrowDamage {
			t.Errorf("at %.0fpx the arrow cost %d half-hearts, expected %d",
				gap, got, ArrowDamage)
		}
		if !target.IsAlive {
			t.Errorf("at %.0fpx a single arrow killed a fighter at full health", gap)
		}
	}
}
