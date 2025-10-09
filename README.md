# 🎮 Rodrigo Jack - Dual-Mode Platformer Game

A 2D platformer game with **two game modes**: Adventure (solo story) and VS (multiplayer battle arena).

Built with **vanilla JavaScript** using an **Entity-Component-System (ECS)** architecture.

---

## 🚀 Quick Start

### Prerequisites

- **Python 3** (for frontend server)
- **Go 1.16+** (for backend server - VS mode only)
- **Modern web browser** (Chrome, Firefox, Safari)

### Running the Game

**1. Start Frontend Server:**

```bash
# Navigate to project directory
cd /path/to/Rodrigo_Jack

# Start HTTP server on port 8000
python3 -m http.server 8000
```

**2. Start Backend Server (VS Mode only):**

```bash
# Open a new terminal
cd /path/to/Rodrigo_Jack/server

# Start WebSocket server
go run main.go
```

The backend will start on port **8080**.

**3. Open in Browser:**

```
http://localhost:8000
```

---

## 🎯 Game Modes

### 🗺️ Adventure Mode (Solo)

**Story-driven platformer with 7 maps:**
- Explore levels, defeat enemies, collect coins
- 3 difficulty levels (Easy, Medium, Hard)
- Cutscenes and progression system
- Score tracking and leaderboard
- Power-ups and special attacks

**Controls:**
- `W/A/S/D` - Move
- `Space` - Jump / Charge bow
- `X` - Melee attack
- `C` - Shoot arrow
- `V` - Magic attack
- `P` - Pause

### ⚔️ VS Mode (Multiplayer 2-4 Players)

**Real-time multiplayer battle arena:**
- WebSocket networking (60fps sync)
- 2-4 players per match
- Lobby with chat and room codes
- Last player standing wins
- 4 power-up types with respawn
- Server-authoritative combat

**How to Play:**
1. Player 1 creates room → gets room code
2. Players 2-4 join with room code
3. All players click "Ready"
4. 10-second countdown → match starts
5. Battle in PvP arena with power-ups
6. Last player alive wins!

---

## 🛠️ Server Commands

### Frontend Server (Required for both modes)

```bash
# Standard Python server
python3 -m http.server 8000

# Or specify directory explicitly
python3 -m http.server 8000 --directory /path/to/Rodrigo_Jack
```

**Server will be available at:** `http://localhost:8000`

### Backend Server (VS Mode only)

```bash
# Navigate to server directory
cd server

# Run Go server
go run main.go

# Or build and run
go build -o rodrigo-jack-server
./rodrigo-jack-server
```

**WebSocket server will be available at:** `ws://localhost:8080/ws`

**Health check:** `http://localhost:8080/health`

---

## 📂 Project Structure

```
Rodrigo_Jack/
├── README.md                   # This file
├── ROADMAP.md                  # Development roadmap
├── TESTING.md                  # Comprehensive testing guide
├── RULES.md                    # Development rules
├── CLAUDE.md                   # Claude Code instructions
│
├── index.html                  # Main entry point
├── game.js                     # Base game class (Adventure mode)
├── game_vs.js                  # VS mode extension
│
├── assets/                     # Game assets
│   ├── maps/                   # Map JSON files
│   │   ├── map1.json           # Adventure maps
│   │   └── pvp_arena1.json     # VS battle arena
│   ├── sprites/                # Sprite sheets
│   ├── sounds/                 # Audio files
│   └── background/             # Background images
│
├── core/                       # Core game systems
│   ├── entities/               # Entity classes
│   ├── components/             # ECS components
│   ├── systems/                # ECS systems (shared)
│   ├── systems_vs/             # VS-specific systems
│   └── network/                # WebSocket client
│
├── create/                     # Entity factories
│   ├── player_create.js        # Player entity
│   ├── enemy_create.js         # Enemy entities
│   └── remote_player_create.js # Remote player (VS)
│
├── views/                      # VS mode HTML pages
│   ├── vs_lobby.html           # Multiplayer lobby
│   └── vs_game.html            # Battle arena
│
└── server/                     # Go backend (VS mode)
    ├── main.go                 # WebSocket server
    ├── player.go               # Player management
    ├── room.go                 # Room management
    └── game_logic.go           # Combat logic
```

---

## 🎮 Features

### Adventure Mode Features
- ✅ 7 unique maps with progression
- ✅ Multiple enemy types with AI
- ✅ Collectibles (coins, power-ups)
- ✅ 3 difficulty levels
- ✅ Cutscenes (skippable)
- ✅ Score system with leaderboard
- ✅ Death/respawn mechanics
- ✅ Gravity-based physics
- ✅ Camera following system

### VS Mode Features
- ✅ Real-time multiplayer (2-4 players)
- ✅ WebSocket networking (60fps sync)
- ✅ Lobby system with chat
- ✅ Room codes for matchmaking
- ✅ Ready check & countdown timers
- ✅ Server-authoritative combat
- ✅ 3 attack types (melee, arrow, magic)
- ✅ 4 player colors (Red, Blue, Green, Yellow)
- ✅ Player nicknames above sprites
- ✅ 4 power-up types with respawn
- ✅ Client-side prediction & interpolation
- ✅ Lag compensation
- ✅ Match timer (3 minutes)
- ✅ Game over screen with winner
- ✅ FPS counter & performance stats

---

## 🧪 Testing

See **[TESTING.md](TESTING.md)** for comprehensive testing guide with:
- 8 test categories
- 100+ test cases
- Edge case scenarios
- Performance benchmarks
- Bug reporting procedures

**Quick Test:**
```bash
# Terminal 1: Frontend
python3 -m http.server 8000

# Terminal 2: Backend
cd server && go run main.go

# Browser 1: Create room
http://localhost:8000 → VS Mode → Start Game

# Browser 2: Join room
http://localhost:8000 → VS Mode → Enter room code → Join
```

---

## 📊 Performance

### Target Specs
- **60 FPS** maintained with 4 players
- **<100ms** network latency (local)
- **16ms** message batching interval
- **Client-side prediction** for smooth movement
- **Server reconciliation** for accuracy

### Optimization Features
- Network message batching
- Entity interpolation
- Lag compensation (extrapolation >100ms)
- Performance monitoring system
- FPS counter with detailed stats

---

## 🐛 Troubleshooting

### Frontend Won't Start
```bash
# Check if port 8000 is in use
lsof -i :8000

# Use different port
python3 -m http.server 8001
```

### Backend Won't Start
```bash
# Check if port 8080 is in use
lsof -i :8080

# Install Go dependencies
cd server
go mod download
```

### Game Won't Load
- Clear browser cache (Ctrl+Shift+R or Cmd+Shift+R)
- Try incognito/private mode
- Check browser console (F12) for errors

### VS Mode Connection Issues
- Ensure backend server is running
- Check WebSocket connection in Network tab (F12)
- Verify firewall isn't blocking port 8080
- Try `ws://localhost:8080/ws` directly

### Performance Issues
- Click FPS counter (top-right) for detailed stats
- Close other browser tabs
- Disable browser extensions
- Update graphics drivers

---

## 📝 Development

### Technology Stack
- **Frontend**: Vanilla JavaScript (ES6 modules)
- **Backend**: Go with gorilla/websocket
- **Architecture**: Entity-Component-System (ECS)
- **Networking**: WebSocket (real-time)
- **Build**: No build step required

### Key Files
- `game.js` - Main game loop and ECS
- `game_vs.js` - VS mode extension
- `core/systems/` - Game systems (18 systems)
- `core/systems_vs/` - VS-specific systems (6 systems)
- `server/main.go` - WebSocket server
- `server/game_logic.go` - Combat authority

### Development Server
```bash
# Auto-reload on changes (using watchdog)
pip install watchdog
watchmedo auto-restart --patterns="*.js;*.html" --recursive python3 -m http.server 8000
```

---

## 🎓 Credits

**Project**: Rodrigo Jack
**Type**: Educational 2D Platformer
**Architecture**: Entity-Component-System
**Modes**: Adventure (Solo) + VS (Multiplayer)

**Development Phases:**
- Phase 1: Menu Dual-Mode ✅
- Phase 2: Backend WebSocket ✅
- Phase 3: Frontend VS ✅
- Phase 4: Multiplayer Sync ✅
- Phase 5: Polish & Performance ✅

**Overall Progress**: 86% (30/35 tasks)

---

## 📄 License

Educational project - See source files for details.

---

## 🔗 Quick Links

- **[ROADMAP.md](ROADMAP.md)** - Development roadmap with progress tracking
- **[TESTING.md](TESTING.md)** - Comprehensive testing guide
- **[RULES.md](RULES.md)** - Development guidelines
- **[CLAUDE.md](CLAUDE.md)** - Claude Code instructions

---

## 🎯 Next Steps

1. ✅ **Development Complete**
2. 🔄 **Testing in Progress** - See TESTING.md
3. ⏳ **Bug Fixing** - Based on test results
4. ⏳ **Final Polish** - Visual effects, animations
5. ⏳ **Deployment** - Production ready

**Status**: Ready for comprehensive testing and bug fixing.

---

**Enjoy the game!** 🎮🎉
