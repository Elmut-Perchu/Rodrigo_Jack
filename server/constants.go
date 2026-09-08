package main

import "time"

// Game constants for server-side validation
const (
	// Movement validation.
	//
	// These must stay ABOVE what legitimate play produces, otherwise every
	// normal move is rejected as cheating and the player is snapped back.
	// Reference values from constants/vs_movement_constants.js:
	//   horizontal speed  450  (property.speed)
	//   jump strength     660  (JUMP_STRENGTH)
	//   terminal fall     900  (TERMINAL_VELOCITY)
	// The fastest legitimate moment is a long fall, not a jump: sqrt(450^2 +
	// 900^2) ~= 1006 against sqrt(450^2 + 660^2) ~= 799. Headroom above that
	// is for latency jitter rather than sitting right on the limit.
	MAX_VELOCITY         = 1200.0 // Maximum player velocity (pixels/second)
	MAX_MOVEMENT_PER_SEC = 1500.0 // Maximum distance player can move per second
	MAX_ACCELERATION     = 100.0  // Maximum acceleration change

	// Map bounds (pvp_arena_compact.json: 24x14 tiles @ 64px)
	MAP_WIDTH  = 1536.0
	MAP_HEIGHT = 896.0

	// How far outside those bounds a legitimate position can sit.
	//
	// Positions are the sprite's top-left corner, but a fighter's body is 55px
	// to the right of it and 79px below. Standing in one of the boundary
	// passages therefore puts the reported corner outside the map while the
	// fighter is plainly inside it. Without this, crossing a passage was
	// flagged as cheating and the player was snapped back.
	POSITION_MARGIN = 128.0

	// Network constants
	MAX_MESSAGE_RATE = 60 // Maximum messages per second (60fps)
	MIN_UPDATE_DELTA = 16 // Minimum milliseconds between updates (1000/60fps)

	// The depth of the anti-teleport budget, in seconds of travel, and the
	// slack on top of it in pixels.
	//
	// The budget is a bucket: every position report pours in the ground it
	// claims to have covered, and the bucket drains steadily at
	// MAX_MOVEMENT_PER_SEC. A fighter moving honestly pours in less than
	// drains away and never fills it; one crossing the arena repeatedly fills
	// it in a few reports. Its DEPTH is what absorbs bunched arrivals, and its
	// DRAIN is what makes sustained impossible speed impossible.
	//
	// The check used to be made one report at a time, and that compared two
	// different clocks. The client integrates its physics against real time and
	// reports where it truly is every 50ms, so the DISTANCE it covered is a
	// fact about the sending clock. The TIME it was divided by was the gap
	// between ARRIVALS, and the network does not deliver every 50ms - a busy
	// moment queues two reports and hands them over back to back.
	//
	// Judged that way an honest report is measured against the budget for a
	// journey much shorter than the one it actually made. Measured: a fighter
	// falling at terminal velocity, reporting honestly at 20Hz, had 48% of its
	// reports rejected once arrivals bunched to 25ms apart - and every
	// rejection sends a position_correction, which snaps the player's own body
	// backwards on their screen. That is the teleporting players reported, and
	// it came from the anti-cheat rather than from any cheat.
	//
	// Over a second the two clocks agree again: bunching moves reports around
	// in time, it does not create travel. A bucket a second deep therefore
	// swallows any amount of bunching while still refusing anyone who is
	// genuinely covering more ground than a fighter can.
	//
	// Two other shapes were tried and are recorded here because both look
	// right and are not. A floor under the per-report budget grants a fixed
	// allowance on EVERY report, so anything short enough to fit inside it can
	// be repeated forever - corner to corner is only 320px measured through
	// the wrap passage, and a 375px floor let a fighter flick between the ends
	// of the arena at 20Hz untouched. A window that resets outright is strict
	// at exactly the wrong moment: for the first report after each reset the
	// allowance is only the slack, so an honest fighter returning from a
	// respawn or a stall is judged hardest.
	TRAVEL_WINDOW = 1.0
	TRAVEL_SLACK  = 100.0

	// How many suspicious reports in a row it takes before a player is moved.
	//
	// Correcting on the first one means any single unlucky report is worth a
	// visible jump. A real teleport does not arrive alone, so waiting for a
	// run of them costs nothing and makes an isolated false positive free.
	TELEPORT_STRIKES = 3

	// Room constants
	MAX_PLAYERS_PER_ROOM = 4
	MIN_PLAYERS_TO_START = 2

	// Attack ranges deliberately do NOT live here. They used to, at 30px for a
	// sword, and nothing ever read them - game_logic.go holds the live values
	// (MeleeRange = 120.0). Re-aliasing them to these figures would cut sword
	// reach back to a quarter of a sprite width, the bug game_logic.go's own
	// comment records having already been fixed once. The damage figures below
	// are the cautionary tale: a second, shadowing set of them there made every
	// online sword blow instantly fatal until they were aliased back to these.

	// Health is counted in half-hearts: MAX_HEALTH of them make the four
	// hearts the HUD draws (constants/vs_combat_constants.js, which must
	// agree with these). A sword takes about eight connections to finish
	// someone, an arrow or a spirit four - the pacing the old 15/20/25
	// against a hundred points produced.
	MAX_HEALTH   = 8
	MELEE_DAMAGE = 1
	ARROW_DAMAGE = 2
	MAGIC_DAMAGE = 2

	// An arrow costs a heart wherever it was fired from. There used to be a
	// point-blank range here that made a close shot fatal outright; it is
	// gone on purpose, and adding one back would put an unannounced instant
	// kill in the middle of every scrum (see combat_vs.go handleArrowHit).

	// A match is a race to this many round wins, not a single life. Losing a
	// round only ends that round - RoundWins tracks the running score.
	RoundsToWinMatch = 6
)

// The shortest the score screen ever stays up, whatever anyone presses.
//
// The slow-motion victory beat is 1.4s of it, and a round score read before
// the blow that decided it has finished playing is a round score nobody has
// looked at. Past this the wait belongs to the players (see
// Room.beginRoundIntermission).
const RoundIntermissionDelay = 4 * time.Second

// How long the room waits for the players to ask for the next round before
// starting it regardless.
//
// Purely a backstop against an empty chair: long enough that nobody who is
// actually there ever meets it, short enough that a match does not sit dead
// on screen for the others.
const RoundReadyTimeout = 90 * time.Second
