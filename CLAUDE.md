# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A 2D platformer game built with vanilla JavaScript using an Entity-Component-System (ECS) architecture. The game features multiple levels, enemies, collectibles, a scoring system, and a Go backend for leaderboard management.

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
