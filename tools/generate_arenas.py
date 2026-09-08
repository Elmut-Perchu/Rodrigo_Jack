#!/usr/bin/env python3
"""Builds the VS arenas.

Every arena is the same 24x14 grid of 64px tiles. That is not a stylistic
choice: the server validates positions against MAP_WIDTH and MAP_HEIGHT in
server/constants.go, and the wrap passages are measured from the same figures,
so an arena of another size would have its players snapped back as cheats.

What varies is the arrangement inside it. Each layout below is written as
horizontal runs on a fixed ladder of rows, and the ladder is the point: the
rows are spaced two and three tiles apart, which is exactly what one jump
(148px, a little over two tiles) and a double (297px, four and a half) can
climb. Writing arenas this way means a new one cannot accidentally ask for a
height nobody can reach.

Left-right symmetry is enforced by construction rather than by hand, so no
corner of an arena is kinder to the player who spawned next to it.

Run:  python3 tools/generate_arenas.py
"""

import json
import pathlib

W, H = 24, 14
TILE = 64

FLOOR_ROW = H - 1          # 13
CEILING_ROW = 0
LEFT_WALL, RIGHT_WALL = 0, W - 1

# Openings in the border. Leaving through one brings you back in through the
# opposite one (core/systems_vs/vs_wrap_system.js). Both sides must open on
# the same rows, and floor and ceiling on the same columns, or a crossing puts
# you inside a wall.
SIDE_PASSAGE_ROWS = (6, 7, 11, 12)
SHAFT_COLUMNS = (4, 5, 18, 19)   # 18 and 19 are the mirrors of 5 and 4

# How far a fighter can climb, in tiles. A single jump clears two, the pair of
# them four; three is the tallest step any layout is allowed to ask for, which
# leaves the double jump some margin for being mistimed.
MAX_CLIMB_ROWS = 3

# And how far they can carry that jump sideways: ~390px of travel is six
# tiles, so a gap wider than that is a gap you fall down.
MAX_GAP_COLS = 6


def blank():
    """An empty arena: border, passages, nothing else."""
    grid = [['0'] * W for _ in range(H)]

    for x in range(W):
        grid[CEILING_ROW][x] = '1'
        grid[FLOOR_ROW][x] = '1'
    for y in range(H):
        grid[y][LEFT_WALL] = '1'
        grid[y][RIGHT_WALL] = '1'

    for y in SIDE_PASSAGE_ROWS:
        grid[y][LEFT_WALL] = '0'
        grid[y][RIGHT_WALL] = '0'
    for x in SHAFT_COLUMNS:
        grid[CEILING_ROW][x] = '0'
        grid[FLOOR_ROW][x] = '0'

    return grid


def run(grid, row, start, end):
    """Lays a platform, and its mirror image on the other side."""
    for x in range(start, end + 1):
        if x <= LEFT_WALL or x >= RIGHT_WALL:
            continue
        grid[row][x] = '1'
        grid[row][W - 1 - x] = '1'


def build(layout):
    grid = blank()
    for row, start, end in layout:
        run(grid, row, start, end)
    return grid


# === The arenas ===
#
# Each entry is a list of (row, first column, last column). Every run is
# mirrored, so only the left half is written.

LAYOUTS = {
    'pvp_arena_towers': {
        'name': 'Towers',
        'note': 'Two flanking ledges and a long central bridge: the middle is '
                'the prize and it is exposed from both sides.',
        'runs': [
            (10, 2, 5),
            (8, 8, 11),     # mirrors into a single 8..15 bridge
            (5, 2, 5),
            (3, 9, 11),
        ],
    },
    'pvp_arena_steps': {
        'name': 'Steps',
        'note': 'A staircase from each corner to the top. Every climb is a '
                'short one, so fights move constantly rather than camping.',
        'runs': [
            (10, 1, 4),
            (8, 6, 9),
            (5, 10, 11),
            (3, 2, 4),
        ],
    },
    'pvp_arena_bridges': {
        'name': 'Bridges',
        'note': 'Long spans with a hole down the middle. Falling costs the '
                'height you spent getting up, and the shafts are the way back.',
        'runs': [
            (10, 3, 10),
            (8, 1, 6),
            (5, 3, 10),
            (3, 10, 11),
        ],
    },
    'pvp_arena_pit': {
        'name': 'Pit',
        'note': 'Ledges wrapped around an open shaft. Nowhere is far from an '
                'edge, and the bow rules the vertical.',
        'runs': [
            (10, 1, 7),
            (8, 4, 9),
            (5, 1, 7),
            (3, 9, 11),
        ],
    },
}

# Where the four fighters start. Mirrored top and bottom as well as left and
# right, so no seat is closer to the middle than another.
SPAWNS = [(2, 2), (W - 3, 2), (2, 11), (W - 3, 11)]

def place_powerups(grid):
    """
    Puts the pickups on ledges rather than at fixed coordinates.

    Hard-coded positions only work for one layout: the same (12, 3) that
    floats invitingly in one arena is buried inside a platform in the next.
    These are chosen from the arena's own surfaces, so every layout gets a
    sensible set and the check below has nothing left to catch.
    """
    # Only the arena's own ledges: the border counts as a surface too, and
    # picking the outermost one put pickups inside the walls and in the mouths
    # of the side tunnels.
    standing = sorted(
        t for t in surfaces(grid)
        if LEFT_WALL < t[0] < RIGHT_WALL and CEILING_ROW < t[1] < FLOOR_ROW
    )
    if not standing:
        return []

    def above(tile):
        x, y = tile
        return {'x': x, 'y': y - 1}

    centre = (W - 1) / 2
    # Off the floor: a pickup lying at spawn height is not worth crossing for.
    raised = [t for t in standing if t[1] < FLOOR_ROW] or standing

    # One in the middle, as the thing worth fighting over.
    middle = min(raised, key=lambda t: (abs(t[0] - centre), t[1]))

    # And a mirrored pair out on the flanks.
    flank = max(raised, key=lambda t: (abs(t[0] - centre), -t[1]))
    mirror = (W - 1 - flank[0], flank[1])
    if mirror not in standing:
        mirror = flank

    picks = [
        (above(middle), 'health', 10000),
        (above(flank), 'speed_boost', 15000),
        (above(mirror), 'damage_up', 15000),
    ]

    out, seen = [], set()
    for spot, kind, respawn in picks:
        key = (spot['x'], spot['y'])
        if key in seen or grid[spot['y']][spot['x']] == '1':
            continue
        seen.add(key)
        out.append((spot['x'], spot['y'], kind, respawn))
    return out


# === Checking it can actually be played ===

def surfaces(grid):
    """Every tile you could stand on: solid, with clear air above."""
    out = set()
    for y in range(H):
        for x in range(W):
            if grid[y][x] == '1' and y > 0 and grid[y - 1][x] == '0':
                out.add((x, y))
    return out


def reachable(grid):
    """
    Surfaces a fighter can get to, starting from the floor.

    Deliberately generous about falling (you can always drop) and strict about
    climbing (MAX_CLIMB_ROWS up, MAX_GAP_COLS across). It is a sanity check on
    the layout, not a simulation - the real measurements live in the browser.
    """
    all_surfaces = surfaces(grid)
    start = {s for s in all_surfaces if s[1] == FLOOR_ROW}
    seen = set(start)
    frontier = list(start)

    while frontier:
        x, y = frontier.pop()
        for tx, ty in all_surfaces:
            if (tx, ty) in seen:
                continue
            dx = abs(tx - x)
            # Wrapping means the short way round the sides also counts.
            dx = min(dx, W - dx)
            climb = y - ty
            if dx > MAX_GAP_COLS:
                continue
            if climb > MAX_CLIMB_ROWS:
                continue
            seen.add((tx, ty))
            frontier.append((tx, ty))

    return seen, all_surfaces


def check(key, grid):
    problems = []

    if len(grid) != H or any(len(row) != W for row in grid):
        problems.append('wrong size')

    # Spawns must be in open air with ground under them.
    for sx, sy in SPAWNS:
        if grid[sy][sx] == '1':
            problems.append(f'spawn ({sx},{sy}) is inside a wall')
            continue
        if not any(grid[y][sx] == '1' for y in range(sy + 1, H)):
            problems.append(f'spawn ({sx},{sy}) has nothing below it')

    # Powerups must not be buried.
    for px, py, kind, _ in place_powerups(grid):
        if grid[py][px] == '1':
            problems.append(f'powerup {kind} at ({px},{py}) is inside a wall')

    seen, all_surfaces = reachable(grid)
    stranded = all_surfaces - seen
    if stranded:
        problems.append(f'{len(stranded)} unreachable surface tiles: '
                        + ', '.join(f'({x},{y})' for x, y in sorted(stranded)[:6]))

    # Symmetry, since the whole point of mirroring is fairness.
    for y in range(H):
        for x in range(W):
            if grid[y][x] != grid[y][W - 1 - x]:
                problems.append(f'not symmetric at ({x},{y})')
                break
        else:
            continue
        break

    return problems


def write(key, spec, grid):
    data = {
        'metadata': {
            'width': W, 'height': H, 'tileSize': TILE,
            'mapType': 'pvp_arena', 'maxPlayers': 4, 'matchDuration': 180,
            'displayName': spec['name'], 'description': spec['note']
        },
        'background': {'path': 'background/back-map1.webp'},
        'music': {'path': './assets/sounds/music/map1_theme.wav', 'volume': 0.4,
                  'fadeIn': 500, 'fadeOut': 500, 'layered': False},
        'spawnpoints': [
            {'x': x, 'y': y, 'playerId': i + 1, 'safeZone': 3}
            for i, (x, y) in enumerate(SPAWNS)
        ],
        'powerups': [
            {'x': x, 'y': y, 'type': kind, 'respawnTime': respawn}
            for x, y, kind, respawn in place_powerups(grid)
        ],
        'tiles': [''.join(row) for row in grid],
        'enemy1': [], 'enemy2': [], 'enemy3': [], 'collectible': [],
        'nextLevel': None
    }

    path = pathlib.Path('assets/maps') / f'{key}.json'
    path.write_text(json.dumps(data, indent=2) + '\n')
    return path


def main():
    ok = True
    for key, spec in LAYOUTS.items():
        grid = build(spec['runs'])
        problems = check(key, grid)
        path = write(key, spec, grid)

        print(f'\n{key}  "{spec["name"]}"  -> {path}')
        for row in grid:
            print('   ' + ''.join('#' if c == '1' else '.' for c in row))
        if problems:
            ok = False
            for p in problems:
                print(f'   PROBLEME: {p}')
        else:
            print('   ok: symetrique, spawns poses, tout accessible')

    print('\n' + ('tout est bon' if ok else 'des problemes restent'))
    return 0 if ok else 1


if __name__ == '__main__':
    raise SystemExit(main())
