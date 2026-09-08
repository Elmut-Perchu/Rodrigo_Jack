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

	// Combat constants
	MELEE_RANGE  = 30.0
	ARROW_RANGE  = 400.0
	MAGIC_RANGE  = 200.0
	MAGIC_RADIUS = 80.0

	// Health is counted in half-hearts: MAX_HEALTH of them make the four
	// hearts the HUD draws (constants/vs_combat_constants.js, which must
	// agree with these). A sword takes about eight connections to finish
	// someone, an arrow or a spirit four - the pacing the old 15/20/25
	// against a hundred points produced.
	MAX_HEALTH   = 8
	MELEE_DAMAGE = 1
	ARROW_DAMAGE = 2
	MAGIC_DAMAGE = 2

	// How close the shooter must be for an arrow to be a killing blow rather
	// than a wound. Two fighters in contact stand about 104px apart, body
	// centre to body centre, so this is the length of an outstretched arm.
	// Mirrors POINT_BLANK_RANGE in constants/vs_bow_constants.js.
	POINT_BLANK_RANGE = 120.0

	// A match is a race to this many round wins, not a single life. Losing a
	// round only ends that round - RoundWins tracks the running score.
	RoundsToWinMatch = 6
)

// How long the room pauses after a round before respawning everyone for the
// next one. Gives every client time to play its slow-motion victory beat and
// show the round score before the next round's countdown starts.
const RoundIntermissionDelay = 4 * time.Second
