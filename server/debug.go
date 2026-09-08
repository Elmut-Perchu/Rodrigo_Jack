package main

import (
	"log"
	"os"
)

// verbose turns the per-tick and per-message tracing back on.
//
// Set VS_VERBOSE=1 in the environment to get it. Off by default, and it has
// to be, because those traces are not written once per event a human cares
// about - they are written per game tick, per position update and per message
// sent to each player. Two fighters at 20Hz produced something like 340
// formatted lines a second, every one of them a write to stdout that the host
// then collects and ships.
//
// On the free plan that is a tenth of a CPU doing bookkeeping instead of
// running the match, and the cost does not land evenly: it lands on the very
// goroutine that is supposed to broadcast the world on a steady 50ms beat.
// Ticks arriving late and unevenly is exactly what the clients then have to
// smooth over, so this was quietly making the game look worse than it is.
var verbose = os.Getenv("VS_VERBOSE") == "1"

// debugf logs only when tracing is switched on. Use it for anything on a path
// that runs every tick, every state update or every message; keep log.Printf
// for the things worth reading in a normal day's log - rooms opening and
// closing, matches starting, cheat rejections, errors.
func debugf(format string, args ...interface{}) {
	if !verbose {
		return
	}
	log.Printf(format, args...)
}
