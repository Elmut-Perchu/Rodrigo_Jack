# 🧪 Testing Guide - Rodrigo Jack VS Mode

**Last Updated**: Phase 5 Days 31-33
**Status**: Development Complete - Ready for Testing

---

## 📊 Implementation Summary

### ✅ Completed Features

**Phase 1: Menu Dual-Mode** (Days 1-2)
- ✅ Mode selection (Adventure vs VS)
- ✅ VS folder structure
- ✅ Lobby UI with chat, player slots, room codes

**Phase 2: Backend WebSocket** (Days 3-10)
- ✅ Go WebSocket server (port 8080)
- ✅ Room management (max 4 players)
- ✅ Lobby timers (20s wait, 10s countdown)
- ✅ Chat system with rate limiting and HTML sanitization
- ✅ Player state tracking

**Phase 3: Frontend VS** (Days 11-17)
- ✅ Real WebSocket client with auto-reconnect
- ✅ LobbyManager UI controller
- ✅ VS game page with HUD and game over screen
- ✅ PvP arena map (pvp_arena1.json)
- ✅ Adventure features disabled in VS mode

**Phase 4: Multiplayer Sync** (Days 18-24)
- ✅ Network sync system (60fps)
- ✅ Client-side prediction and server reconciliation
- ✅ Interpolation for remote players
- ✅ Combat sync with server authority
- ✅ Hit detection (melee, arrow, magic)
- ✅ Remote player rendering with colors (Red, Blue, Green, Yellow)
- ✅ Player nicknames above sprites
- ✅ Lag compensation (extrapolation >100ms)

**Phase 5: Polish & Performance** (Days 25-30)
- ✅ Power-ups system (health, speed_boost, damage_up, invincibility)
- ✅ Power-up respawn logic (10-30s)
- ✅ Damage multipliers integrated
- ✅ FPS counter with detailed stats
- ✅ Network message batching (16ms interval)
- ✅ Performance monitoring system

---

## 🎯 Test Checklist

### 1. Adventure Mode (Must Always Work)

**Verify Adventure mode is NOT broken:**
- [ ] Main menu loads correctly
- [ ] "Adventure" mode button selectable
- [ ] Difficulty selection visible (Easy/Medium/Hard)
- [ ] Game starts normally
- [ ] All 7 maps playable
- [ ] Player controls work (WASD, Space, X, C, V)
- [ ] Enemies spawn and behave correctly
- [ ] Collectibles work (coins, power-ups, portals)
- [ ] Cutscenes play (or can be skipped)
- [ ] Death/respawn mechanics work
- [ ] Score system functions
- [ ] Game can be completed

**Critical**: Adventure mode must work perfectly at all times!

---

### 2. VS Mode - Lobby System

**Menu Navigation:**
- [ ] "VS" mode button selectable in main menu
- [ ] Clicking "Start Game" redirects to `views/vs_lobby.html`
- [ ] Lobby page loads without errors

**Room Creation:**
- [ ] Random 4-character room code generated
- [ ] Room code displayed prominently
- [ ] Player can see their own name and color

**Player Joining:**
- [ ] 2nd player can join with room code
- [ ] 3rd and 4th players can join
- [ ] Player slots update in real-time
- [ ] Each player gets unique color (P1=Red, P2=Blue, P3=Green, P4=Yellow)
- [ ] Player count updates correctly
- [ ] Host badge shows on first player

**Wait Timer (20 seconds):**
- [ ] Starts when 2nd player joins
- [ ] Countdown displays in UI
- [ ] Can be cancelled if player leaves
- [ ] Restarts if player count drops below 2

**Ready System:**
- [ ] Players can toggle ready status
- [ ] Ready checkmark appears when ready
- [ ] All players must be ready to start countdown

**Countdown Timer (10 seconds):**
- [ ] Starts when all players ready (and wait timer finished)
- [ ] Countdown displays 10, 9, 8... 1
- [ ] Cancels if any player unready
- [ ] Redirects to game after countdown ends

**Chat System:**
- [ ] Players can send messages
- [ ] Messages broadcast to all players in room
- [ ] Nicknames displayed with messages
- [ ] Timestamps shown
- [ ] HTML escaped (test with `<script>alert('XSS')</script>`)
- [ ] Rate limiting works (max 5 messages/second)
- [ ] Max 200 characters per message
- [ ] Scroll to bottom on new message

---

### 3. VS Mode - Game Page

**Page Load:**
- [ ] Redirects from lobby with room code in URL (`?room=ABCD`)
- [ ] Loading screen shows briefly
- [ ] Game canvas initializes
- [ ] PvP arena map loads (pvp_arena1.json)

**Player HUD:**
- [ ] 4 player cards displayed
- [ ] Each card shows: nickname, health bar, player color
- [ ] Health bars update in real-time
- [ ] Dead players shown differently (grayed out?)

**Match Info:**
- [ ] Match timer counts down from 3:00
- [ ] Players alive count updates
- [ ] Room code displayed

**Spawn Points:**
- [ ] Players spawn in corners (safe zones)
- [ ] Each player at different spawn point
- [ ] No spawn camping possible (safe zone protection)

---

### 4. VS Mode - Player Movement

**Local Player:**
- [ ] WASD controls work
- [ ] Jump with Space
- [ ] Smooth movement
- [ ] Player sprite faces correct direction
- [ ] Animation changes (idle, walk, jump)
- [ ] Position syncs to server

**Remote Players:**
- [ ] Visible on screen with correct color
- [ ] Nickname displayed above sprite
- [ ] Movement interpolated smoothly
- [ ] Animation states sync
- [ ] Facing direction correct
- [ ] No stuttering or teleporting

**Network Sync:**
- [ ] Position updates at 60fps
- [ ] Client-side prediction enabled
- [ ] Server reconciliation (snap if error >50px)
- [ ] Latency compensation active
- [ ] Extrapolation when lag >100ms

---

### 5. VS Mode - Combat System

**Melee Attack (X key):**
- [ ] Animation plays
- [ ] Hits players within 30px
- [ ] Must be facing target
- [ ] Deals 15 damage (base)
- [ ] Hit feedback shown
- [ ] Health bar updates

**Arrow Attack (C key):**
- [ ] Arrow fires in facing direction
- [ ] Travels up to 400px
- [ ] Hits players in projectile path
- [ ] Deals 20 damage (base)
- [ ] Arrow visible to all players

**Magic Attack (V key):**
- [ ] AoE effect at cast position
- [ ] 80px radius
- [ ] Hits all players in radius
- [ ] Deals 25 damage (base)
- [ ] Visual effect shown

**Server Authority:**
- [ ] All damage calculated server-side
- [ ] No client-side cheating possible
- [ ] Hit detection consistent across clients
- [ ] Health synced to all players

**Death & Respawn:**
- [ ] Player dies when health reaches 0
- [ ] Death animation plays
- [ ] `player_death` message broadcast
- [ ] Players alive count decrements
- [ ] Match ends when 1 or 0 players alive

**Match End:**
- [ ] Winner displayed on game over screen
- [ ] Option to return to lobby
- [ ] Option to return to main menu
- [ ] Stats shown (kills, damage dealt, etc.)

---

### 6. VS Mode - Power-Ups

**Power-Up Types:**
- [ ] **Health Pack** (red): Instant +50 HP
- [ ] **Speed Boost** (green): +100 speed for 10s
- [ ] **Damage Up** (orange): 2x damage for 15s
- [ ] **Invincibility** (yellow): Invulnerable for 5s

**Collection:**
- [ ] Power-up visible on map
- [ ] Collision detection works
- [ ] Power-up disappears when collected
- [ ] `powerup_collected` message broadcast
- [ ] Effect applies to collector

**Effects:**
- [ ] Health restored instantly
- [ ] Speed boost affects movement
- [ ] Damage multiplier applied to attacks
- [ ] Invincibility prevents damage
- [ ] Duration tracked correctly
- [ ] Visual feedback for active effects

**Respawn:**
- [ ] Power-ups respawn after timer (10-30s)
- [ ] Respawn time depends on type
- [ ] Visible again after respawn
- [ ] Multiple collections possible

**Conflicts:**
- [ ] Only one player can collect
- [ ] Server decides winner (first to arrive)
- [ ] No duplication bugs

---

### 7. Performance & Optimization

**FPS Counter:**
- [ ] Displayed in top-right corner
- [ ] Updates every second
- [ ] Green color when ≥55fps
- [ ] Yellow when 30-54fps
- [ ] Red when <30fps
- [ ] Click to toggle detailed stats

**Detailed Stats:**
- [ ] Frame time (current, avg, min/max)
- [ ] Entity count
- [ ] System count
- [ ] Network latency
- [ ] Remote player count
- [ ] Memory usage (if available)

**Network Optimization:**
- [ ] Message batching enabled (16ms interval)
- [ ] Only latest `player_state` sent
- [ ] Reduced network traffic (~50-70%)
- [ ] No noticeable lag introduced

**60fps Target:**
- [ ] Maintains 60fps with 2 players
- [ ] Maintains 60fps with 4 players
- [ ] Maintains 60fps with 4 players + 8 power-ups
- [ ] No frame drops during combat
- [ ] Smooth animations throughout

---

### 8. Edge Cases & Bugs

**Lobby Edge Cases:**
- [ ] Player joins during countdown
- [ ] Player leaves during countdown
- [ ] Host leaves mid-game
- [ ] Room full (5th player tries to join)
- [ ] Invalid room code entered
- [ ] Network disconnect during lobby
- [ ] Spam ready/unready button

**Game Edge Cases:**
- [ ] Both players die simultaneously
- [ ] Player disconnects mid-match
- [ ] Network timeout during combat
- [ ] Multiple players collect same power-up
- [ ] Attack while dead (should be blocked)
- [ ] Respawn outside map bounds
- [ ] Match timer reaches 0:00

**Performance Edge Cases:**
- [ ] Chrome DevTools Network throttling (Fast 3G)
- [ ] Simulated high latency (>200ms)
- [ ] Packet loss simulation
- [ ] 10+ entities on screen
- [ ] Rapid attacks (spam X/C/V keys)

---

## 🛠️ How to Test

### Prerequisites

1. **Start Backend Server:**
```bash
cd server
go run main.go
# Server should start on port 8080
```

2. **Start Frontend Server:**
```bash
python3 -m http.server 8000
# Or any static file server
```

3. **Open Browser:**
```
http://localhost:8000
```

### Test with Multiple Players

**Option 1: Multiple Browser Windows**
- Open 2-4 browser windows
- Use different browsers (Chrome, Firefox, Safari)
- Each window = 1 player

**Option 2: Incognito/Private Windows**
- Open 2-4 incognito windows
- Same browser works

**Option 3: Multiple Devices**
- Use different computers/phones
- Connect to same network
- Replace `localhost` with server IP

### Testing Workflow

1. **Lobby Test:**
   - Player 1: Create room, get room code
   - Player 2: Join with room code
   - Both: Test chat, ready system
   - Verify countdown starts
   - Let countdown finish

2. **Movement Test:**
   - Both players move with WASD
   - Verify smooth sync
   - Test jumping
   - Check interpolation

3. **Combat Test:**
   - Player 1 attacks Player 2 (X/C/V)
   - Verify damage applied
   - Test all attack types
   - Check health bars update

4. **Power-Up Test:**
   - Collect each power-up type
   - Verify effects work
   - Test respawn timers
   - Check visual feedback

5. **Performance Test:**
   - Click FPS counter
   - Verify 60fps maintained
   - Check detailed stats
   - Monitor network latency

6. **Edge Case Test:**
   - Disconnect during match
   - Try to join full room
   - Spam attacks rapidly
   - Collect power-up simultaneously

---

## 🐛 Bug Reporting

If you find bugs, please note:

1. **What you did** (exact steps)
2. **What happened** (actual result)
3. **What you expected** (expected result)
4. **Browser console errors** (F12 → Console)
5. **Server logs** (terminal output)
6. **Network tab** (F12 → Network → WS tab)

---

## 📝 Testing Status

**Last Tested**: [DATE]
**Tested By**: [NAME]
**Browser**: [Chrome/Firefox/Safari]
**OS**: [Windows/Mac/Linux]

**Results**:
- Adventure Mode: [ ] Pass / [ ] Fail
- VS Lobby: [ ] Pass / [ ] Fail
- VS Game: [ ] Pass / [ ] Fail
- Combat: [ ] Pass / [ ] Fail
- Power-Ups: [ ] Pass / [ ] Fail
- Performance: [ ] Pass / [ ] Fail

**Issues Found**: [List any bugs discovered]

---

## ✅ Definition of Done

VS Mode is complete when:

- ✅ All features implemented (Phases 1-5)
- [ ] All test cases pass
- [ ] No critical bugs
- [ ] 60fps maintained with 4 players
- [ ] Adventure mode still works perfectly
- [ ] Code documented
- [ ] ROADMAP.md updated to 100%

**Current Status**: Development Complete - Testing Pending
