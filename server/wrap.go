package main

import "math"

/*
An arena whose edges are passages.

The map's boundary is open in a few places (assets/maps/pvp_arena_compact.json):
leave through one and you re-enter through the opposite one. Clients simulate
that themselves - the server neither moves anyone nor decides where they come
out - but it does have to recognise a crossing when it validates one, because
to the anti-teleport check a wrap and a cheat look identical: both are a jump
of most of the map in a single update.

Measuring the move the short way round tells them apart. A fighter stepping
through a passage moves a few pixels; someone flinging themselves across the
middle of the arena still moves most of it.
*/

// shortestDelta returns the smaller of the two separations on a wrapping axis,
// signed, in [-span/2, span/2]. Mirrors wrapValue's counterpart in
// constants/vs_wrap_constants.js - the two must agree or the server will
// reject moves the clients consider ordinary.
func shortestDelta(delta, span float64) float64 {
	if span <= 0 {
		return delta
	}

	half := span / 2
	d := math.Mod(delta, span)
	if d > half {
		d -= span
	} else if d < -half {
		d += span
	}

	return d
}
