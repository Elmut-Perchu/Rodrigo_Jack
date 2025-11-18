# Fix: Space Key Disconnecting Players (Critical Bug)

## Problem

**Symptom**: Pressing SPACE to jump would disconnect players from the game.

**User Report**: "quand je lache le bouton jump ça disparait, quand je rappuis, il réapparaissent là ou ils on disparu"

**Observed Behavior**:
- Player presses SPACE to jump
- Player disconnects immediately
- WebSocket closes
- Player reconnects automatically
- Player reappears at last known position
- Cycle repeats every time SPACE is pressed

## Root Cause Analysis

### Stack Trace Evidence
```
🔴 DISCONNECT CALLED from: EventListener.handleEvent*setupEventListeners@http://localhost:8000/test_sync.js:113:47
```

### The Bug
The SPACE key has **default browser behavior**: it **activates the currently focused button**.

**What was happening**:
1. User connects → `connectBtn` button gets focus
2. Button text changes to "Disconnect"
3. User plays game and presses SPACE to jump
4. Browser's default behavior: SPACE activates focused button (`connectBtn`)
5. Click handler triggers: `this.disconnect()` is called
6. WebSocket closes, player disappears
7. `ws.onclose` triggers automatic reconnection
8. Player reappears at server position

### Why it appeared intermittent
- Only happened when `connectBtn` had focus
- Focus could shift to canvas or inputs, making it work sometimes
- Appeared to happen "when releasing SPACE" because:
  - SPACE press → button activation → disconnect → player disappears
  - User releases SPACE → reconnection completes → player reappears

## Solution

### Fix: Prevent Default Browser Behavior

**File**: `test_sync.js` lines 88-107

**Before**:
```javascript
window.addEventListener('keydown', (e) => {
    if (!this.connected || !this.localPlayer) return;

    if (e.key === ' ') {
        if (!this.keys.has(' ')) {
            this.handleJump();
        }
        return;
    }

    this.keys.add(e.key);
    this.updateInputVector();
});
```

**After**:
```javascript
window.addEventListener('keydown', (e) => {
    if (!this.connected || !this.localPlayer) return;

    // Prevent default behavior for game keys (space, arrows)
    if (e.key === ' ' || e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault(); // CRITICAL: Prevent space from activating buttons, arrows from scrolling!
    }

    // Handle jump separately (not held down) - DON'T add to keys
    if (e.key === ' ') {
        if (!this.keys.has(' ')) {
            this.handleJump();
        }
        // Don't add space to keys - it's only for jump, not movement
        return;
    }

    this.keys.add(e.key);
    this.updateInputVector();
});
```

## Benefits of the Fix

1. **SPACE key no longer activates buttons** - Only triggers jump action
2. **Arrow keys no longer scroll page** - Only control player movement
3. **Stable gameplay** - No unexpected disconnections
4. **Consistent behavior** - Works regardless of which element has focus

## Related Fixes in Same Session

### 1. Disconnect Loop Prevention (test_sync.js:356-362)
Added `disconnecting` flag to prevent recursive `disconnect()` calls:
- `disconnect()` sets `this.disconnecting = true`
- `ws.onclose` checks flag before calling `disconnect()` again
- `ws.onopen` resets flag to `false`

**Why needed**: `disconnect()` calls `ws.close()` which triggers `onclose` which called `disconnect()` again → infinite loop

### 2. Player Recreation Protection (test_sync.js:444-461)
Only create `localPlayer` once:
- Check `if (!this.localPlayer)` before creating
- If player exists, just update position from server
- Prevents player reset on duplicate `test_joined` messages

**Why needed**: Multiple `test_joined` messages were recreating player, resetting velocity and position

### 3. Server Duplicate Join Detection (server/test_handler.go:95-137)
Server checks if player is already connected:
- Compare `ConnID` to detect duplicate joins
- Skip sending `test_joined` if already connected with same `ConnID`
- Only send on real reconnections (different `ConnID`)

**Why needed**: Prevented server from sending multiple `test_joined` messages for same connection

## Testing Instructions

1. **Connect two players** to `http://localhost:8000/test_sync.html`

2. **Test jump stability**:
   - Press SPACE repeatedly
   - Hold SPACE
   - Release SPACE
   - **Expected**: Player jumps smoothly, NO disconnections

3. **Test arrow keys**:
   - Press arrow keys to move
   - **Expected**: Player moves, page does NOT scroll

4. **Check logs**:
   - ✅ No `🔴 DISCONNECT CALLED from:` messages during gameplay
   - ✅ No `🔴 DISCONNECT: Setting localPlayer to NULL` messages
   - ✅ No repeated `📨 Received test_joined` messages

5. **Test focus scenarios**:
   - Click on button, then press SPACE → Should jump, NOT disconnect
   - Click on input, then press SPACE → Should jump, NOT add space to input
   - Click on canvas, then press SPACE → Should jump normally

## Expected Behavior After Fix

### Normal Gameplay:
```
📨 Received test_joined message #1
🎨 Local player: index=0, color=#FF6B6B, data= { ... }
📍 Local player spawn: (256.5, 424.5)
ℹ️ Received my own position from server: 200, 200
ℹ️ Received my own position from server: 200, 480
[Player moves and jumps smoothly with NO disconnections]
```

### No More Disconnect Messages:
- ❌ No `🔴 DISCONNECT CALLED from: EventListener.handleEvent*setupEventListeners`
- ❌ No `WebSocket connection to 'ws://localhost:8080/ws' failed:`
- ❌ No player disappearing/reappearing

## Impact

**Critical Bug**: This was causing the game to be completely unplayable. Every jump attempt would disconnect the player.

**Severity**: 🔴 **Critical** - Game breaking bug
**Priority**: 🔴 **Immediate fix required**
**Status**: ✅ **Fixed**

## Files Modified

- ✅ `test_sync.js` (lines 88-107) - Added `e.preventDefault()` for game keys
- ✅ `test_sync.js` (lines 47, 315, 356-362) - Disconnect loop prevention
- ✅ `test_sync.js` (lines 444-461) - Player recreation protection
- ✅ `server/test_handler.go` (lines 95-137) - Server duplicate detection

## Lessons Learned

1. **Always prevent default browser behavior for game controls** - Especially for keys like SPACE, arrows
2. **Focus management matters** - Buttons can steal focus and intercept key events
3. **Test with different focus states** - Bugs may only appear when specific elements have focus
4. **Stack traces are invaluable** - The disconnect stack trace immediately revealed the real cause
5. **Intermittent bugs often have hidden triggers** - The "sometimes works" behavior was due to focus state

## Related Issues

- This bug was masked by the player recreation bug (players were being recreated anyway)
- Once player recreation was fixed, this bug became immediately obvious
- The automatic reconnection made it seem like "players disappearing and reappearing" rather than "disconnecting"
