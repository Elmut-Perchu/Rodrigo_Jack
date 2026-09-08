package main

import (
	"testing"
	"time"
)

// The anti-teleport check has to answer two questions at once, and the pair of
// them is the whole difficulty: it must not move an honest player, and it must
// still stop a dishonest one. Measured against a live server, the version that
// judged one report at a time failed the first badly - a fighter falling at
// terminal velocity and reporting honestly at 20Hz had 48% of its reports
// refused once arrivals bunched to 25ms apart, and every refusal snapped the
// player's own body backwards. These pin both halves.

// reportAt drives one position report as though it arrived `gap` after the
// previous one. The handler reads time.Now(), so the player's clocks are wound
// back instead - which is also the only way to test a second of travel without
// spending a second.
func reportAt(p *Player, gap time.Duration, x, y float64) {
	now := time.Now()
	p.LastStateUpdate = now.Add(-gap)
	if !p.travelDrainedAt.IsZero() {
		p.travelDrainedAt = now.Add(-gap)
	}
	p.handlePlayerState(&Message{
		Type: "player_state",
		Data: map[string]interface{}{
			"x": x, "y": y, "vx": 0.0, "vy": 0.0,
		},
	})
}

// travelRoom builds a live two-player room and hands back the one under test.
func travelRoom(t *testing.T) *Player {
	t.Helper()

	room := NewRoom("TRAVEL")
	subject := newTestPlayer("a-subject", "Subject")
	other := newTestPlayer("b-other", "Other")
	room.Players[subject.ID] = subject
	room.Players[other.ID] = other
	subject.Room = room
	other.Room = room

	room.mu.Lock()
	room.assignTeamsLocked()
	room.IsGameActive = true
	room.mu.Unlock()

	subject.X, subject.Y = 128, 128
	return subject
}

// corrections drains the outbox and counts the snap-backs.
func corrections(t *testing.T, p *Player) int {
	t.Helper()
	return len(messagesOfType(t, p, "position_correction"))
}

func TestHonestFallingIsNeverCorrected(t *testing.T) {
	// A fighter falling at TERMINAL_VELOCITY reports 45px of travel every 50ms
	// of its own clock. The arrivals are what bunch - here to 10ms apart, far
	// worse than a real connection - so each report is judged against a budget
	// for a fifth of the journey it truly made.
	for _, gap := range []time.Duration{50 * time.Millisecond, 25 * time.Millisecond, 10 * time.Millisecond} {
		subject := travelRoom(t)

		y := 128.0
		for i := 0; i < 60; i++ {
			y += 45
			if y > MAP_HEIGHT {
				y -= MAP_HEIGHT
			}
			reportAt(subject, gap, 128, y)
		}

		if got := corrections(t, subject); got != 0 {
			t.Errorf("arrivals %v apart: %d honest reports were corrected, expected none", gap, got)
		}
	}
}

func TestCrossingTheArenaRepeatedlyIsThrottled(t *testing.T) {
	// Corner to corner is 1216px apart, but only 320px measured through the
	// wrap passage - which is why a fixed per-report allowance cannot stop it
	// and a draining budget can: 320px every 50ms is 6400px/s, and nothing
	// drains that fast.
	//
	// What the budget guarantees is a speed limit, not an alarm. A refused
	// report simply never moves the authoritative position, so the ground a
	// cheat actually gains is whatever the bucket drains - and that is the
	// property worth pinning, because it is the one that holds however the
	// reports are dressed up.
	subject := travelRoom(t)

	const reports = 40
	const gap = 50 * time.Millisecond

	travelled := 0.0
	for i := 0; i < reports; i++ {
		x := 128.0
		if i%2 == 1 {
			x = 1344
		}
		was := subject.X
		reportAt(subject, gap, x, 128)
		travelled += absFloat(shortestDelta(subject.X-was, MAP_WIDTH))
	}

	claimed := float64(reports-1) * 320 // what the cheat asked for
	elapsed := (time.Duration(reports) * gap).Seconds()
	allowed := MAX_MOVEMENT_PER_SEC*elapsed + TRAVEL_SLACK

	if travelled > allowed {
		t.Errorf("the cheat gained %.0fpx in %.1fs, past the %.0fpx a fighter could cover",
			travelled, elapsed, allowed)
	}
	if travelled >= claimed {
		t.Errorf("the cheat gained all %.0fpx it asked for - it was not throttled at all", travelled)
	}
	t.Logf("claimed %.0fpx, gained %.0fpx, legal ceiling %.0fpx", claimed, travelled, allowed)
}

func absFloat(v float64) float64 {
	if v < 0 {
		return -v
	}
	return v
}

func TestASingleWildReportDoesNotMoveThePlayer(t *testing.T) {
	// One bad report is not a cheat, it is a bad report. Correcting on it costs
	// an honest player a visible jump backwards.
	subject := travelRoom(t)

	reportAt(subject, 50*time.Millisecond, 128, 173)
	reportAt(subject, 50*time.Millisecond, 1400, 800) // wild
	reportAt(subject, 50*time.Millisecond, 128, 218)  // back to the honest path

	if got := corrections(t, subject); got != 0 {
		t.Errorf("one wild report drew %d corrections, expected none", got)
	}
}
