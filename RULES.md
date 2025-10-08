# 📜 RULES.md - Development Guidelines & Best Practices

**Project**: Rodrigo Jack - Dual-Mode Game (Adventure + VS)
**Purpose**: Ensure code quality, consistency, and maintainability across all development phases

---

## 🎯 Core Principles

### 1. Code Before Commit
- ✅ **Always test manually** before committing
- ✅ **Verify no console errors** in browser DevTools
- ✅ **Check both modes** (Adventure + VS) after shared code changes
- ❌ **Never commit broken code** that prevents game launch

### 2. Incremental Development
- ✅ **Small, focused commits** (one feature per commit)
- ✅ **Commit message format**: `Phase X: Brief description`
- ✅ **Test after each commit** to ensure stability
- ✅ **Reference ROADMAP.md** checkbox completed in commit message

### 3. Backward Compatibility
- ✅ **Adventure mode must always work** (never break existing features)
- ✅ **VS mode is additive** (does not modify Adventure core logic)
- ✅ **Shared systems must support both modes** (use `game.mode` to branch)

---

## 🏗️ Architecture Rules

### File Organization

```
Rodrigo_Jack/
├── game.js               # SHARED: Base game class (both modes)
├── game_vs.js            # VS ONLY: Extends Game for multiplayer
├── main.js               # SHARED: Entry point
│
├── core/                 # SHARED: All systems/components
│   ├── systems/          # SHARED: Core game systems
│   ├── systems_vs/       # VS ONLY: Multiplayer-specific systems
│   ├── network/          # VS ONLY: WebSocket & sync
│   ├── components/       # SHARED: Data components
│   └── entities/         # SHARED: Entity base class
│
├── views/                # VS ONLY: HTML pages
│   ├── vs_lobby.html
│   └── vs_game.html
│
├── assets/
│   ├── maps/
│   │   ├── map*.json    # ADVENTURE: Story maps
│   │   └── pvp_*.json   # VS: Battle arenas
│   └── sounds/
│       ├── player/       # SHARED
│       ├── enemy/        # ADVENTURE
│       └── vs/           # VS ONLY
│
└── server/               # VS ONLY: Go backend
    ├── main.go
    ├── room.go
    ├── player.go
    └── game_logic.go
```

### Naming Conventions

**Files**:
- Systems: `*_system.js` (e.g., `movement_system.js`)
- Components: `*_component.js` (e.g., `position_component.js`)
- VS-specific: `*_vs.js` or in `systems_vs/` folder
- Maps: `map{number}.json` (Adventure), `pvp_{name}.json` (VS)

**Classes**:
- PascalCase for classes: `NetworkSyncSystem`, `LobbyManager`
- camelCase for variables: `playerPosition`, `gameState`
- UPPER_CASE for constants: `TILE_SIZE`, `MAX_PLAYERS`

**Functions**:
- camelCase: `createPlayer()`, `handlePlayerJoin()`
- Descriptive names: `syncPlayerPositionToServer()` not `sync()`

---

## 🔧 Coding Standards

### JavaScript Style

**ES6+ Features**:
```javascript
// ✅ Use arrow functions for callbacks
entities.forEach(entity => entity.update());

// ✅ Use const/let (never var)
const player = createPlayer();
let health = 100;

// ✅ Destructuring
const { x, y } = position;

// ✅ Template literals
console.log(`Player ${id} joined at (${x}, ${y})`);
```

**Error Handling**:
```javascript
// ✅ Always handle WebSocket errors
ws.onerror = (error) => {
    console.error('WebSocket error:', error);
    // Fallback or user notification
};

// ✅ Try-catch for JSON parsing
try {
    const data = JSON.parse(message);
} catch (error) {
    console.error('Invalid JSON:', error);
    return;
}

// ✅ Validate data before use
if (!player || !player.position) {
    console.warn('Invalid player data');
    return;
}
```

**Performance**:
```javascript
// ✅ Cache DOM queries
const gameWorld = document.querySelector('.game-world'); // Once
// Use gameWorld multiple times

// ❌ Don't query every frame
update() {
    document.querySelector('.game-world').style... // BAD
}

// ✅ Use requestAnimationFrame
requestAnimationFrame(this.loop.bind(this));

// ✅ Throttle network messages (60fps max)
if (Date.now() - this.lastSent < 16) return;
```

### ECS Patterns

**Component Structure**:
```javascript
// ✅ Components are data-only (no logic)
export class PositionComponent {
    constructor(x = 0, y = 0) {
        this.x = x;
        this.y = y;
    }
}

// ❌ Don't put methods in components
export class PositionComponent {
    move(dx, dy) { ... } // BAD - belongs in System
}
```

**System Structure**:
```javascript
// ✅ Systems extend System base class
export class MovementSystem extends System {
    update(deltaTime) {
        this.entities.forEach(entity => {
            // Check for required components
            const pos = entity.getComponent('position');
            const vel = entity.getComponent('velocity');
            if (!pos || !vel) return;

            // Apply logic
            pos.x += vel.vx * deltaTime;
            pos.y += vel.vy * deltaTime;
        });
    }
}

// ✅ Systems register with game
game.addSystem(new MovementSystem());
```

**Entity Creation**:
```javascript
// ✅ Use factory functions in create/ folder
export function createPlayer(x, y) {
    const entity = new Entity();
    entity.addComponent('position', new Position(x, y));
    entity.addComponent('velocity', new Velocity());
    entity.addComponent('input', new Input());
    return entity;
}

// ✅ Use in game
const player = createPlayer(100, 100);
game.addEntity(player);
```

---

## 🌐 Networking Rules

### WebSocket Communication

**Message Format**:
```javascript
// ✅ Always use this structure
{
    type: "message_type",
    payload: { /* data */ }
}

// Examples:
{ type: "lobby_join", payload: { nickname: "Player1" } }
{ type: "player_state", payload: { x: 100, y: 200, vx: 5 } }
{ type: "chat_message", payload: { message: "Hello!" } }
```

**Client-Side**:
```javascript
// ✅ Always check WebSocket state before sending
if (this.ws && this.ws.readyState === WebSocket.OPEN) {
    this.ws.send(JSON.stringify({ type, payload }));
}

// ✅ Handle all WebSocket events
ws.onopen = () => { /* connection success */ };
ws.onmessage = (e) => { /* handle message */ };
ws.onerror = (err) => { /* handle error */ };
ws.onclose = () => { /* cleanup */ };
```

**Server-Side (Go)**:
```go
// ✅ Always validate message type
switch msg.Type {
case "lobby_join":
    handleLobbyJoin(player, msg.Payload)
case "player_state":
    handlePlayerState(player, msg.Payload)
default:
    log.Printf("Unknown message type: %s", msg.Type)
}

// ✅ Always broadcast to room, not individual
room.Broadcast(Message{
    Type: "player_joined",
    Payload: player,
})
```

### Sync Strategy

**Client-Side Prediction**:
```javascript
// ✅ Update local player immediately (no lag)
if (entity.uuid === this.myPlayerId) {
    entity.getComponent('position').x += velocity.vx;
}

// ✅ Send to server for authority
this.ws.send('player_state', { x, y, vx, vy });
```

**Server Reconciliation**:
```javascript
// ✅ Correct large errors (snap)
if (Math.abs(serverX - localX) > 50) {
    position.x = serverX; // Snap
}

// ✅ Smooth small errors (interpolate)
else if (Math.abs(serverX - localX) > 5) {
    position.x += (serverX - localX) * 0.1; // Smooth
}
```

**Interpolation**:
```javascript
// ✅ Remote players use interpolation
const lerpFactor = 10 * deltaTime;
position.x += (targetX - position.x) * lerpFactor;
```

---

## 🎨 UI/UX Guidelines

### Styling

**Fonts**:
```css
/* ✅ Use Press Start 2P for all text */
font-family: 'Press Start 2P', sans-serif;
```

**Colors**:
```css
/* Adventure Mode */
--adventure-primary: #4CAF50;
--adventure-accent: #FFD700;

/* VS Mode */
--vs-primary: #E74C3C;
--vs-accent: #3498DB;

/* Shared */
--background-dark: rgba(0, 0, 0, 0.8);
--text-light: #FFFFFF;
```

**Responsive**:
```css
/* ✅ Ensure UI works on different screen sizes */
.lobby-container {
    max-width: 800px;
    width: 90%; /* Responsive */
}
```

### Accessibility

- ✅ **Keyboard navigation**: Tab through buttons, Enter to submit
- ✅ **Contrast**: Text readable on all backgrounds
- ✅ **Font size**: Minimum 0.8rem for 'Press Start 2P'
- ✅ **Focus indicators**: Visible outline on focused elements

---

## 🧪 Testing Checklist

### Before Every Commit

**Adventure Mode**:
- [ ] Game launches without errors
- [ ] Player can move (arrows)
- [ ] Player can jump (up arrow)
- [ ] Player can attack (W/X/C/V/Space)
- [ ] Collectibles work (coins, arrows)
- [ ] Enemies can be killed
- [ ] Level progression works (portals)
- [ ] Audio plays correctly
- [ ] Pause menu works (P key)

**VS Mode** (if applicable):
- [ ] Lobby page loads correctly
- [ ] WebSocket connects successfully
- [ ] Nickname submission works
- [ ] Player counter updates
- [ ] Chat messages send/receive
- [ ] Timer logic works (20s → 10s)
- [ ] Game page loads after countdown
- [ ] All players spawn in corners
- [ ] Players can see each other move
- [ ] Combat sync works (hits register)
- [ ] Health updates correctly
- [ ] Power-ups can be collected
- [ ] Victory/defeat screens show correctly

### Performance Testing

- [ ] Open Chrome DevTools → Performance tab
- [ ] Record 10 seconds of gameplay
- [ ] Check FPS: Should be ~60fps
- [ ] Check frame drops: Should be none
- [ ] Check paint operations: Minimize reflows
- [ ] Check layers: Use GPU acceleration properly

### Browser Compatibility

**Primary Target**: Chrome/Chromium (latest)
**Secondary**: Firefox, Safari (test if time permits)

---

## 🚨 Common Pitfalls to Avoid

### ❌ Don't Do This

**1. Modifying Shared Systems Without Testing Both Modes**:
```javascript
// ❌ BAD: Breaking Adventure mode
class MovementSystem {
    update() {
        // Added VS-only code without checking mode
        this.syncToServer(); // Crashes in Adventure!
    }
}

// ✅ GOOD: Check mode first
class MovementSystem {
    update() {
        if (this.game.mode === 'vs') {
            this.syncToServer();
        }
    }
}
```

**2. Hardcoding Values**:
```javascript
// ❌ BAD
if (players.length === 4) { ... }

// ✅ GOOD
const MAX_PLAYERS = 4;
if (players.length === MAX_PLAYERS) { ... }
```

**3. Forgetting to Clean Up**:
```javascript
// ❌ BAD: Memory leak
setInterval(() => { ... }, 1000);

// ✅ GOOD: Store reference and clear
this.timer = setInterval(() => { ... }, 1000);
// Later:
clearInterval(this.timer);
```

**4. Synchronous Operations in Game Loop**:
```javascript
// ❌ BAD: Blocks game loop
update() {
    const data = fetch('/api/data'); // Synchronous!
}

// ✅ GOOD: Use async properly
async loadData() {
    const data = await fetch('/api/data');
    // Process outside game loop
}
```

**5. Console.log in Production**:
```javascript
// ✅ Use sparingly, remove before final commit
console.log('Debug info'); // OK during dev

// ✅ Use console.error for actual errors
console.error('Critical error:', error);
```

---

## 📦 Dependencies Management

### Frontend (JavaScript)
- ✅ **No external libraries** (mini-framework requirement)
- ✅ Use native WebSocket API
- ✅ Use native DOM manipulation
- ✅ Use native requestAnimationFrame

### Backend (Go)
```bash
# ✅ Only use these dependencies
go get github.com/gorilla/websocket
go get github.com/gorilla/mux
```

### Assets
- ✅ Reuse existing sprites from Adventure mode
- ✅ Keep new assets in `assets/vs/` folder
- ✅ Optimize images (WebP format preferred)

---

## 🔄 Git Workflow

### Branch Strategy
```bash
# ✅ Main branch: stable (Adventure mode working)
main

# ✅ Feature branches for each phase
git checkout -b phase-1-menu-dual-mode
git checkout -b phase-2-backend-websocket
git checkout -b phase-3-frontend-vs
# etc.

# ✅ Merge to main after each phase tested
git checkout main
git merge phase-1-menu-dual-mode
```

### Commit Messages
```bash
# ✅ Format: "Phase X: Brief description"
git commit -m "Phase 1: Add dual-mode menu selection"
git commit -m "Phase 2: Implement WebSocket server lobby logic"
git commit -m "Phase 3: Create VS lobby UI with chat"

# ✅ Reference ROADMAP.md task
git commit -m "Phase 1 Day 1: Modify main menu - ROADMAP task complete"
```

### Before Pushing
```bash
# ✅ Always test locally first
npm start  # or python -m http.server
# Test in browser
# Check console for errors

# ✅ Then commit and push
git add .
git commit -m "Phase X: Description"
git push origin branch-name
```

---

## 📚 Documentation Standards

### Code Comments

**When to Comment**:
```javascript
// ✅ Complex algorithms
// Calculate client-side prediction with server reconciliation
const predictedX = localX + (serverX - lastServerX) * lerpFactor;

// ✅ Non-obvious decisions
// Using setTimeout instead of setInterval to prevent overlap
setTimeout(() => this.update(), 16);

// ✅ Workarounds
// HACK: Force reflow to trigger animation
element.offsetHeight;

// ❌ Don't comment obvious code
const x = 10; // Set x to 10 (BAD)
```

### README Updates

After each phase, update `README.md` with:
- New features added
- Setup instructions (especially for VS mode)
- How to run backend server
- How to test multiplayer locally

---

## ✅ Definition of Done

A task is considered complete when:

1. ✅ Code is written and tested manually
2. ✅ No console errors in browser
3. ✅ ROADMAP.md checkbox is marked `[x]`
4. ✅ Code committed with proper message
5. ✅ Adventure mode still works (if shared code changed)
6. ✅ VS mode works (if applicable)
7. ✅ Performance is acceptable (60fps)

---

## 🎯 Final Checklist Before Audit Submission

- [ ] All ROADMAP.md tasks checked off (35/35)
- [ ] All 29 audit points validated
- [ ] Adventure mode fully functional
- [ ] VS mode fully functional
- [ ] 60fps performance in both modes
- [ ] No console errors
- [ ] Clean code (no debug logs)
- [ ] README.md updated with setup instructions
- [ ] Demo video recorded (optional but recommended)

---

**Remember**: Quality > Speed. It's better to complete one phase perfectly than to rush through all phases with bugs.

**When in doubt**: Test both modes, check ROADMAP.md, follow these RULES.
