# 🧪 VS MODE TESTING GUIDE

**Status**: Development Complete - Ready for Testing
**Last Update**: 2025-10-09
**Critical Fixes Applied**: 6/6 ✅

---

## ⚠️ BEFORE TESTING: Clear Browser Cache

**CRITICAL**: All fixes are applied but browser cache MUST be cleared!

### Cache Clearing Methods

1. **Hard Refresh** (Recommended)
   - **Windows/Linux**: `Ctrl + Shift + R`
   - **Mac**: `Cmd + Shift + R`

2. **Close Browser Completely**
   - Close ALL browser windows
   - Wait 5 seconds
   - Reopen browser

3. **Incognito/Private Mode** (Cleanest)
   - `Ctrl + Shift + N` (Chrome)
   - `Ctrl + Shift + P` (Firefox)

4. **DevTools Cache Disable**
   - Open DevTools (F12)
   - Network tab → Check "Disable cache"
   - Keep DevTools open while testing

---

## 🎯 Test Phase 1: Basic Initialization (CRITICAL)

### Goal: Verify game launches without errors

**Expected Logs** (in order):
```
[VS Game] Starting battle arena...
[VS Game] Room: [ROOM_CODE]
[GameVS] Initializing VS mode
[GameVS] Step 1: Disabling Adventure features
[GameVS] Audio system disabled
[GameVS] Step 2: Loading VS map
[MapLoader] Loading map from: ../assets/maps/pvp_arena1.json
[GameVS] Step 3: Loading VS map complete
[GameVS] Step 4: Connecting to WebSocket server
[GameVS] Step 5: Adding VS systems
[NetworkSyncSystem] Initialized
[CombatSyncSystem] Initialized
[InterpolationSystem] Initialized
[NicknameRenderSystem] Initialized
[PowerUpSystem] Initialized
[GameVS] VS Mode game instance created
```

### ✅ Success Criteria
- No "Failed to initialize" errors
- All initialization steps complete
- Network connection established
- Map loads correctly (pvp_arena1.json)

### ❌ Failure Indicators
- Empty error message: `[VS Game] Failed to initialize:`
- 404 errors for assets (maps, sprites, tilesets)
- Module import failures
- `Cannot read properties of null` errors

---

## 🎯 Test Phase 2: Player Rendering

### Goal: Verify players appear on screen

**Test Setup**:
1. Open 2 browser tabs (or use 2 devices)
2. Both join same room code
3. Both ready up
4. Wait for countdown
5. Game launches

**Expected Behavior**:
- ✅ Both players appear as sprites in arena
- ✅ Local player has different color (Red/Blue/Green/Orange)
- ✅ Player nicknames visible above sprites
- ✅ Spawn points are safe (not inside walls)

**Expected Logs**:
```
[GameVS] Room state received: {players: [...]}
[GameVS] Created local player: [PLAYER_NAME]
[NetworkSyncSystem] Created remote player: [OTHER_PLAYER_NAME]
[GameVS] All players created (2/2)
```

### ⚠️ Known Limitations
- Camera may follow local player (static camera TODO)
- No respawn logic yet (death = stuck)
- Power-ups may not work yet

---

## 🎯 Test Phase 3: Movement Synchronization

### Goal: Verify player movement syncs between clients

**Test Actions**:
1. **Player 1**: Move with WASD keys
2. **Player 2**: Observe Player 1 movement
3. **Player 2**: Move with WASD keys
4. **Player 1**: Observe Player 2 movement

**Expected Behavior**:
- ✅ Local player moves smoothly (no lag)
- ✅ Remote player movement is visible
- ✅ Interpolation smooths remote movement
- ✅ Facing direction syncs correctly
- ✅ Animation states sync (idle/run/jump)

**Expected Logs** (periodic):
```
[NetworkSyncSystem] Sending state: {x, y, vx, vy, animation}
[NetworkSyncSystem] Received remote state: Player[ID]
[InterpolationSystem] Interpolating [PLAYER_NAME]
```

### Performance Targets
- **Local player**: 60fps, no input lag
- **Remote player**: Smooth interpolation, <100ms lag
- **Network**: 20 updates/second (50ms interval)

---

## 🎯 Test Phase 4: Combat System

### Goal: Verify attacks sync between clients

**Test Actions**:
1. **Melee Attack**: Press Z/X/C keys
2. **Arrow Attack**: Press Space key
3. **Magic Attack**: Press V key
4. **Hit Detection**: Attack near other player

**Expected Behavior**:
- ✅ Attack animations sync
- ✅ Projectiles appear on both clients
- ✅ Hit detection occurs
- ✅ Health bars update
- ✅ Damage values are consistent

**Expected Logs**:
```
[CombatSyncSystem] Sending attack: {type, direction}
[CombatSyncSystem] Received hit: {attacker, victim, damage}
[CombatSyncSystem] Player [NAME] health: 80/100
```

### ⚠️ Known Issues
- No respawn logic (death = game over for that player)
- No invincibility frames after respawn

---

## 🎯 Test Phase 5: Match Flow

### Goal: Complete full match from lobby to game over

**Test Flow**:
1. Create room → Join room
2. Chat messages → Ready up
3. Wait timer (20s) → Countdown (10s)
4. Game starts → Players spawn
5. Movement → Combat
6. Death → Game over

**Expected Behavior**:
- ✅ Smooth transitions between states
- ✅ No disconnections or freezes
- ✅ Match timer counts down (3 min)
- ✅ Game over screen appears
- ✅ Return to lobby button works

---

## 🐛 Common Issues & Solutions

### Issue #1: "Failed to initialize" (empty error)
**Cause**: Browser cache serving old files
**Solution**: Hard refresh (Ctrl+Shift+R) or incognito mode

### Issue #2: 404 for assets
**Cause**: Path detection not working
**Solution**: Check console, verify `basePath` detection, clear cache

### Issue #3: NetworkSyncSystem error
**Cause**: `setGame()` timing issue
**Solution**: Already fixed, clear browser cache

### Issue #4: No players visible
**Cause**: WebSocket not connected or room_state not received
**Solution**: Check Network tab for WebSocket connection (ws://localhost:8080/ws)

### Issue #5: Movement not syncing
**Cause**: Network throttling or server not running
**Solution**: Verify Go server running on port 8080

---

## 📊 Test Results Template

### Session Info
- **Date**: _______
- **Browser**: _______
- **Players**: _______
- **Room Code**: _______

### Phase 1: Initialization
- [ ] No errors in console
- [ ] All logs appear correctly
- [ ] Map loads successfully
- [ ] WebSocket connects

### Phase 2: Player Rendering
- [ ] Local player visible
- [ ] Remote players visible
- [ ] Nicknames displayed
- [ ] Colors correct

### Phase 3: Movement
- [ ] Local movement smooth
- [ ] Remote movement syncs
- [ ] Animations sync
- [ ] Facing direction correct

### Phase 4: Combat
- [ ] Melee attacks sync
- [ ] Arrow attacks sync
- [ ] Magic attacks sync
- [ ] Health updates correctly

### Phase 5: Match Flow
- [ ] Lobby → Game transition smooth
- [ ] No disconnections
- [ ] Match timer works
- [ ] Game over screen works

### Performance
- **FPS**: _____ (target: 60)
- **Network Lag**: _____ ms (target: <100ms)
- **Issues Found**: _______

---

## 🚀 Next Steps After Testing

### If All Tests Pass ✅
1. Mark ROADMAP.md tasks complete
2. Begin Phase 5 (Polish & Testing)
3. Implement static camera
4. Add respawn logic
5. Performance optimization

### If Tests Fail ❌
1. Document exact error messages
2. Share console logs
3. Note which phase failed
4. Check GAME_VS_CRITICAL_FIX.md for similar issues

---

## 📞 Support Resources

- **Fix Documentation**: [GAME_VS_CRITICAL_FIX.md](GAME_VS_CRITICAL_FIX.md)
- **Architecture**: [VS_MODE_COMPLETE_AUDIT.md](VS_MODE_COMPLETE_AUDIT.md)
- **Missing Features**: [VS_MODE_MISSING_PIECES.md](VS_MODE_MISSING_PIECES.md)
- **Roadmap**: [ROADMAP.md](ROADMAP.md)

---

**Testing Priority**: Phase 1 (Initialization) → Phase 2 (Rendering) → Phase 3 (Movement) → Phase 4 (Combat) → Phase 5 (Match Flow)

**Time Estimate**: 30-60 minutes for complete testing cycle
