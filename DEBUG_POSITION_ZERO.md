# 🔍 DEBUG: Position (0, 0) Investigation

**Date**: 2025-11-17
**Issue**: Server receives all player positions as (0.0, 0.0) instead of actual spawn coordinates

---

## 🚨 CRITICAL FINDINGS FROM LOGS

### Evidence from `tampon.md`:

1. **Server perspective**:
```
"Updating sgsrg: (0.0, 0.0) -> (0.0, 0.0)"
```
   - Server is receiving (0.0, 0.0) positions from client

2. **Client game_state_sync logs**:
```javascript
🔍 [DEBUG] First player in game_state_sync: {
  playerId: 'sgsrg',
  x: 300,
  y: 200,
  vx: 0,
  vy: 0
}
```
   - Server broadcasts show players ALWAYS at spawn points (300,200 and 1200,200)
   - No movement ever detected
   - Velocities always 0

---

## 🔍 ROOT CAUSE HYPOTHESIS

**The client is sending (0.0, 0.0) positions to the server**

### Possible causes:

1. ❌ **Position component not initialized** - BUT createLocalPlayer() properly sets spawn coordinates (x: spawn.x, y: spawn.y)

2. ❌ **Position component exists but is 0** - BUT spawn.x and spawn.y come from getSpawnPoint() which returns valid coordinates

3. ❓ **Position is being RESET to 0 after player creation** - NEED TO INVESTIGATE

4. ❓ **sendLocalPlayerState() is called BEFORE player is added to game** - NEED TO VERIFY timing

5. ❓ **getLocalPlayer() is returning the WRONG entity** - NEED TO VERIFY player ID matching

6. ❓ **Position component is being OVERWRITTEN by another system** - NEED TO CHECK MovementSystem, GravitySystem

---

## 🛠️ DEBUGGING ADDITIONS

### Added to `network_sync_system.js` (lines 183-249):

#### 1. Check if local player exists:
```javascript
if (!localPlayer) {
    console.error('🚨 [SEND] No local player found!');
    return;
}
```

#### 2. Check if position component exists:
```javascript
if (!position) {
    console.error('🚨 [SEND] Local player has NO position component!');
    return;
}
```

#### 3. Log RAW position values BEFORE rounding:
```javascript
if (this._rawPosLogCount % 60 === 0) {
    console.warn(`🔍 [SEND RAW] position.x=${position.x}, position.y=${position.y}`);
    console.warn(`🔍 [SEND RAW] velocity.vx=${velocity.vx}, velocity.vy=${velocity.vy}`);
}
```

This will show us:
- If position.x/y are ACTUALLY 0 in the component
- If they're being read correctly
- If the rounding is causing issues

---

## 🧪 NEXT STEPS: Testing Instructions

### Step 1: Clear Logs
```bash
# Open browser console
# Clear with Cmd+K (Mac) or Ctrl+L (Windows)
```

### Step 2: Start Fresh Session
```bash
# Terminal 1: Start Go server
cd server
go run .

# Terminal 2: Start Python server
python3 -m http.server 8000
```

### Step 3: Open 2 Browsers
- Browser 1: `http://localhost:8000` → VS Mode → Create room "TEST" → Player name "P1"
- Browser 2: `http://localhost:8000` → VS Mode → Join "TEST" → Player name "P2"

### Step 4: Capture New Logs

**In EACH browser console, filter for**:
```
🔍 [SEND RAW]
🔍 [SEND]
🚨 [SEND]
```

**What we're looking for**:
1. Does `🚨 [SEND] No local player found!` appear?
2. Does `🚨 [SEND] Local player has NO position component!` appear?
3. What values do `🔍 [SEND RAW]` show for position.x and position.y?
4. What values do `🔍 [SEND]` show in the final state object?

---

## 📋 EXPECTED OUTCOMES

### If position.x/y are 0 in component:
→ **Problem**: Position component is being reset or overwritten
→ **Next**: Add debug logging to createLocalPlayer() to verify initial spawn values
→ **Next**: Check if MovementSystem, GravitySystem, or CollisionSystem are resetting position

### If position.x/y are VALID but sending 0:
→ **Problem**: Bug in Math.round() or state object creation
→ **Next**: Check if position is a getter/setter that returns 0

### If "No local player found" appears:
→ **Problem**: getLocalPlayer() not finding the entity
→ **Next**: Check localPlayerId matching and entity creation timing

---

## 🎯 THEORY: Timing Issue

**Suspicion**: NetworkSyncSystem.update() might be called BEFORE player is fully initialized

**Evidence needed**:
- Check if sendLocalPlayerState() is called immediately after handleRoomState()
- Check if player entity is added to game.entities BEFORE or AFTER NetworkSyncSystem starts
- Check order of system updates in game loop

**If timing is the issue**:
- Add a flag `this.localPlayerReady = false` in NetworkSyncSystem
- Set to `true` only AFTER createLocalPlayer() completes
- Skip sendLocalPlayerState() if `!this.localPlayerReady`

---

## 📝 FILES MODIFIED

1. **core/systems_vs/network_sync_system.js** (lines 183-249)
   - Added defensive checks for localPlayer, position, velocity
   - Added RAW position logging before rounding
   - Added detailed error messages

---

## ⏭️ IMMEDIATE NEXT STEPS

1. ✅ **User refreshes browser with new debug code**
2. ⏳ **User captures console logs filtered for `🔍 [SEND RAW]`, `🔍 [SEND]`, `🚨 [SEND]`**
3. ⏳ **Analyze new logs to identify exact failure point**
4. ⏳ **Apply targeted fix based on findings**

---

**Status**: Waiting for new debug logs with RAW position values
