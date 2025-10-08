# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 🚨 CRITICAL: Read These Files First

**Before making ANY changes, you MUST read:**

1. **[ROADMAP.md](ROADMAP.md)** - Complete development roadmap with checkboxes
   - Check current phase and progress
   - Mark tasks as `[x]` when completed
   - Update progress percentages
   - Reference specific tasks in commit messages

2. **[RULES.md](RULES.md)** - Development guidelines and best practices
   - Follow coding standards (ES6+, ECS patterns)
   - Respect architecture rules (file organization, naming)
   - Test both Adventure and VS modes before committing
   - Follow git workflow and commit message format

**When working on tasks:**
- ✅ Check ROADMAP.md to see current phase and task
- ✅ Follow RULES.md for coding standards
- ✅ Mark ROADMAP.md tasks as complete with `[x]`
- ✅ Test Adventure mode (always must work)
- ✅ Test VS mode (if applicable)
- ✅ Commit with format: `Phase X: Brief description - ROADMAP Day Y Task Z`

## Project Overview

**Dual-Mode Game**: A 2D platformer game built with vanilla JavaScript using an Entity-Component-System (ECS) architecture.

**Two Game Modes:**
1. **Adventure Mode (Solo)** - Story-driven platformer with 7 maps, enemies, collectibles, scoring system
2. **VS Mode (Multiplayer)** - 2-4 player battle arena with WebSocket networking, lobby, chat, real-time combat

**Current Status**: Adventure mode complete ✅ | VS mode in development (see ROADMAP.md)

## Running the Project

**Frontend (JavaScript game):**
```bash
# Serve with any static file server, e.g.:
python3 -m http.server 8000
# Then open http://localhost:8000
```

**Backend (Go score server):**
```bash
# Run the score API server
go run main.go
# Server starts on port 8080
```

## Entity-Component-System Architecture

The game follows a strict ECS pattern:

- **Entities** (`core/entities/entity.js`): Containers with UUID that hold components
- **Components** (`core/components/`): Pure data structures (no logic)
- **Systems** (`core/systems/`): Logic processors that operate on entities with specific components

**Key Architecture Rules:**
1. Systems must extend `System` base class and implement `update(deltaTime)`
2. Systems register which entities they care about by checking for specific components
3. Component data is accessed via `entity.getComponent(name)`
4. System execution order matters - defined in `game.js` constructor

**Critical System Order:**
```javascript
Input → EnemyBehavior → Combat → Camera → Movement → Collision →
CircleHitbox → Boundary → Score → Gravity → Audio → Collectible →
Animation → Damage → Health → TileSystem → Render → Physics → Debug
```

## Core Game Systems

**Game Loop** (`game.js`):
- Main game controller with entity/system management
- Handles pause, difficulty modes (easy/medium/hard), and player death scenarios
- Three difficulty behaviors: respawn (easy), reset level (medium), reset game (hard)
- Uses `EventBus` for decoupled system communication

**Map Loading** (`core/map_loader.js`):
- Loads JSON map files from `assets/maps/`
- Persists state across level transitions (dead enemies, collected items in `game.levelState`)
- Each map specifies entities, tiles, spawn points, and next level

**Collision System** (`core/systems/collision_system.js`):
- Tile-based collision detection
- Entities need `position`, `velocity`, and `property` components to participate

**Camera System** (`core/systems/camera_system.js`):
- Follows entities with `camera` component (typically the player)
- Translates the `.game-world` div to keep camera target centered

**Score System** (`core/systems/score_system.js`):
- Tracks score, coins, and communicates with Go backend API
- Posts scores to `http://localhost:8080/api/scores`
- Fetches leaderboard with pagination and search

## Creating New Content

**Adding a New System:**
1. Create file in `core/systems/` extending `System`
2. Implement `update(deltaTime)` with entity iteration
3. Register in `game.js` constructor via `addSystem()` in correct order

**Adding a New Component:**
1. Create file in `core/components/`
2. Export plain object or class with data properties only
3. Attach to entities in creation functions (`create/` directory)

**Adding a New Map:**
1. Create JSON file in `assets/maps/` following existing map structure
2. Specify entities with components, tiles, and portal destination
3. Reference in `collectible_system.js` for level progression

## Key Files

- `game.js` - Main game class, system registration, difficulty logic
- `core/map_loader.js` - JSON map loading and entity instantiation
- `core/event_bus.js` - Event system for decoupled communication
- `create/player_create.js` - Player entity factory
- `create/enemy_create.js` - Enemy entity factory
- `main.go` - REST API for score persistence (GET/POST `/api/scores`)

## State Management

**Level State** (`game.levelState`):
- `deadEnemies` - Set of UUIDs for enemies killed in current level
- `collectedItems` - Set of UUIDs for items collected in current level
- `score` - Current score
- `coinsCollected` - Coins collected in current level

**Global Stats** (`game.globalStats`):
- `enemiesKilled` - Total enemies killed across all levels
- `startTime` - Game start timestamp

State persistence ensures enemies/items don't respawn when re-entering a level.

## Cutscene System

Uses `cutscene_system.js` with scenes defined in JSON. Cutscenes can be skipped via checkbox in main menu. The intro cutscene plays before map1 loads by default.

---

## 🎯 Dual-Mode Architecture (Adventure + VS)

### Game Modes

**Adventure Mode** (Solo - Story):
- 7 maps with progression system
- Enemies, collectibles, cutscenes
- Difficulty settings (easy/medium/hard)
- Gravity-based platformer physics
- Following camera system

**VS Mode** (Multiplayer - Battle Arena):
- 2-4 players via WebSocket
- Lobby with chat and timers
- Static camera (entire map visible)
- Real-time combat synchronization
- Battle arena maps (pvp_*.json)
- Last player standing wins

### File Structure for Dual-Mode

```
Rodrigo_Jack/
├── ROADMAP.md          # 🚨 CHECK THIS: Development roadmap with checkboxes
├── RULES.md            # 🚨 FOLLOW THIS: Coding standards & best practices
├── CLAUDE.md           # This file
│
├── game.js             # SHARED: Base game class (both modes)
├── game_vs.js          # VS ONLY: Extends Game for multiplayer
│
├── core/
│   ├── systems/        # SHARED: Core game systems
│   ├── systems_vs/     # VS ONLY: Lobby, chat, match manager
│   ├── network/        # VS ONLY: WebSocket client, sync system
│   └── components/     # SHARED: Data components
│
├── views/              # VS ONLY: HTML pages
│   ├── vs_lobby.html   # Lobby with chat
│   └── vs_game.html    # Battle arena
│
├── server/             # VS ONLY: Go backend
│   ├── main.go         # WebSocket server
│   ├── room.go         # Room management
│   ├── player.go       # Player state
│   └── game_logic.go   # Server authority
│
└── assets/maps/
    ├── map*.json       # ADVENTURE: Story maps
    └── pvp_*.json      # VS: Battle arenas
```

### Mode Detection

Systems can branch behavior based on mode:
```javascript
if (this.game.mode === 'vs') {
    // VS-specific logic (e.g., network sync)
} else {
    // Adventure-specific logic (e.g., cutscenes)
}
```

### Critical Rules for Dual-Mode

1. **Never break Adventure mode** - It must always work perfectly
2. **VS mode is additive** - Does not modify Adventure core systems
3. **Shared systems support both modes** - Use `game.mode` to branch
4. **Test both modes** - Before every commit (see RULES.md)
5. **Follow ROADMAP.md** - Check off tasks as you complete them

---

## 🔄 Development Workflow

1. **Read ROADMAP.md** - Identify current phase and task
2. **Read RULES.md** - Understand coding standards
3. **Make changes** - Follow architecture rules
4. **Test Adventure mode** - Ensure it still works (CRITICAL)
5. **Test VS mode** - If applicable to your changes
6. **Update ROADMAP.md** - Mark task as `[x]` completed
7. **Commit** - Use format: `Phase X: Description - ROADMAP Day Y Task Z`

---

## 📊 Progress Tracking

**Check ROADMAP.md for:**
- Current phase (1-5)
- Tasks completed vs remaining
- Overall progress percentage
- Next steps

**Check RULES.md for:**
- Coding standards (JavaScript, ECS patterns)
- Testing checklist
- Git workflow
- Common pitfalls to avoid

---

## ⚠️ Important Reminders

- 🚨 **Adventure mode MUST work at all times** (never commit broken code)
- 🚨 **Mark ROADMAP.md tasks** when completed (replace `[ ]` with `[x]`)
- 🚨 **Follow RULES.md** for all coding decisions
- 🚨 **Test both modes** before committing shared system changes
- 🚨 **Use proper commit messages** referencing ROADMAP.md tasks
