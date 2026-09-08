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
