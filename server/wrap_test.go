package main

import (
	"math"
	"testing"
)

// A crossing must read as the few pixels it really is, and a genuine
// teleport must still read as the whole distance. If these two disagree with
// constants/vs_wrap_constants.js the server rejects ordinary play.
func TestShortestDelta(t *testing.T) {
	cases := []struct {
		name  string
		delta float64
		span  float64
		want  float64
	}{
		{"walking, no crossing", 12, MAP_WIDTH, 12},
		{"out the left, in on the right", 5 - 1531, MAP_WIDTH, 10},
		{"out the right, in on the left", 1531 - 5, MAP_WIDTH, -10},
		{"down through the floor", 5 - 891, MAP_HEIGHT, 10},
		{"a real teleport across the middle", 700, MAP_WIDTH, 700},
		{"exactly half is not a crossing", 768, MAP_WIDTH, 768},
		{"no wrapping axis", 900, 0, 900},
	}

	for _, c := range cases {
		if got := shortestDelta(c.delta, c.span); math.Abs(got-c.want) > 1e-9 {
			t.Errorf("%s: shortestDelta(%v, %v) = %v, want %v", c.name, c.delta, c.span, got, c.want)
		}
	}
}

// The anti-teleport check measures both axes together, so a crossing has to
// stay under the budget a normal frame allows.
func TestCrossingPassesTheDistanceCheck(t *testing.T) {
	const frame = 0.05 // the client's own delta cap
	budget := MAX_MOVEMENT_PER_SEC * frame

	dx := shortestDelta(5-1531, MAP_WIDTH)
	dy := shortestDelta(0, MAP_HEIGHT)
	if d := math.Sqrt(dx*dx + dy*dy); d > budget {
		t.Errorf("a side crossing measured %.2fpx, over the %.2fpx a frame allows", d, budget)
	}

	dx = shortestDelta(0, MAP_WIDTH)
	dy = shortestDelta(5-891, MAP_HEIGHT)
	if d := math.Sqrt(dx*dx + dy*dy); d > budget {
		t.Errorf("a floor crossing measured %.2fpx, over the %.2fpx a frame allows", d, budget)
	}
}

// A fighter standing in a boundary passage reports a corner outside the map.
func TestPassageStandingIsInBounds(t *testing.T) {
	// Body centred on the left edge: sprite corner is 55px further left.
	x, y := -55.0, 400.0
	if x < -POSITION_MARGIN || x > MAP_WIDTH+POSITION_MARGIN ||
		y < -POSITION_MARGIN || y > MAP_HEIGHT+POSITION_MARGIN {
		t.Errorf("a fighter in the side passage at (%.0f, %.0f) was judged out of bounds", x, y)
	}

	// Well outside is still outside.
	if -400.0 >= -POSITION_MARGIN {
		t.Error("the margin is wide enough to let a genuinely out-of-map position through")
	}
}
