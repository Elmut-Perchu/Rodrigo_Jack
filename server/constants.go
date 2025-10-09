package main

// Game constants for server-side validation
const (
	// Movement validation
	MAX_VELOCITY         = 400.0  // Maximum player velocity (pixels/second)
	MAX_MOVEMENT_PER_SEC = 500.0  // Maximum distance player can move per second
	MAX_ACCELERATION     = 100.0  // Maximum acceleration change

	// Map bounds (pvp_arena1.json dimensions)
	MAP_WIDTH  = 1280.0
	MAP_HEIGHT = 720.0

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
