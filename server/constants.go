package main

// Game constants for server-side validation
const (
	// Movement validation.
	//
	// These must stay ABOVE what legitimate play produces, otherwise every
	// normal move is rejected as cheating and the player is snapped back.
	// Reference values from create/remote_player_create.js and the VS systems:
	//   horizontal speed  450  (property.speed)
	//   jump strength     425  (property.jumpStrength)
	//   terminal fall     900  (VSGravity clamp)
	// Worst-case resultant is sqrt(450^2 + 900^2) ~= 1006, so leave headroom
	// for latency jitter rather than sitting right on the limit.
	MAX_VELOCITY         = 1200.0 // Maximum player velocity (pixels/second)
	MAX_MOVEMENT_PER_SEC = 1500.0 // Maximum distance player can move per second
	MAX_ACCELERATION     = 100.0  // Maximum acceleration change

	// Map bounds (pvp_arena_compact.json: 24x14 tiles @ 64px)
	MAP_WIDTH  = 1536.0
	MAP_HEIGHT = 896.0

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

	MELEE_DAMAGE = 15
	ARROW_DAMAGE = 20
	MAGIC_DAMAGE = 25
)
