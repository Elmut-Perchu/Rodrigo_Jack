# 🚨 BUGS CRITIQUES TROUVÉS - ANALYSE LOGS tampon.md

**Date**: 2025-01-17
**Statut**: 🔴 CRITIQUE - Système cassé après Fix #2

---

## ❌ PROBLÈME #1: VISUAL UPDATES = 0 (SYSTÈME CASSÉ)

### Symptômes dans logs
**Lignes 208-254**:
```
📊 [AUDIT STATS] NetworkSyncSystem:
   - Position updates: 1688
   - Visual updates: 0        ← ❌ ZÉRO!
```

**Lignes 1-67**: RenderSystem update un joueur à (1110, 535)
**Lignes 260-504**: NetworkSync update un joueur à (1200, 535)

**Conclusion**: **DEUX JOUEURS DIFFÉRENTS!**

### Cause Racine
En supprimant `visual.div` update de NetworkSyncSystem, j'ai créé un bug:
- NetworkSyncSystem update le component `position`
- RenderSystem lit `position` et update `visual.div`
- **MAIS**: RenderSystem ne voit PAS les changements de position!

**Pourquoi?**
1. `position.x` est un `Number` (primitive)
2. Quand NetworkSync fait `position.x += delta`, ça crée une NOUVELLE valeur
3. RenderSystem compare `parseInt(visual.div.style.left)` avec `position.x`
4. Si égal → skip update

**Le problème**: RenderSystem utilise `parseInt()` qui arrondit!
```javascript
position.x = 1200.6  // NetworkSync
parseInt(visual.div.style.left) = 1200  // RenderSystem pense "pas changé"
```

---

## ❌ PROBLÈME #2: DELTA TOUJOURS 0.0

### Symptômes dans logs
**Lignes 269-505** (répété):
```
║ SERVER Position: (1200.0, 535.0)
║ Delta: (0.0, 0.0) = 0.0px
```

### Causes possibles

**Option A**: Le joueur ne bouge PAS
- Tu n'as pas bougé pendant la capture des logs
- Ou: Input system ne fonctionne pas

**Option B**: Server n'envoie pas les vraies positions
- `game_state_sync` contient toujours la même valeur
- Bug côté serveur

**Option C**: `handleGameStateSync()` ne stocke pas correctement
- `lastServerState.set()` appelé mais pas avec bonnes valeurs

### Test requis
Dans console, quand tu bouges (WASD), cherche:
```
game_state_sync
```
Et regarde si les valeurs `x`, `y` changent!

---

## ❌ PROBLÈME #3: SPAWN MULTIPLES DE JOUEURS

### Symptômes reportés
> "régulièrement de nouveaux personnages apparaissent, je peux en diriger pleins"

### Causes probables

**Cause A**: `player_joined` events multiples
- Server envoie `player_joined` plusieurs fois
- Chaque event crée un nouveau joueur

**Cause B**: `room_state` reçu plusieurs fois
- `handleRoomState()` crée tous les joueurs à chaque appel
- Pas de check "joueur déjà existe"

**Cause C**: Reconnexion WebSocket
- WebSocket disconnect/reconnect
- Chaque reconnect crée nouveaux joueurs sans supprimer les anciens

### Code problématique
**game_vs.js:476-497** `handlePlayerJoined()`:
```javascript
async handlePlayerJoined(data) {
    // Skip if it's the local player (already created)
    if (data.playerId === this.localPlayerId) return;

    // Skip if player already exists (prevent duplicates)
    if (this.players.has(data.playerId)) {
        console.log(`[GameVS] Player ${data.playerId} already exists, skipping`);
        return;  // ✅ Devrait empêcher duplicates
    }

    // NEW PLAYER - create entity
    await this.createRemotePlayer(...);
}
```

**Le check existe déjà!** Donc pourquoi duplicates?

**Hypothèse**: `playerId` change à chaque `player_joined` event
- Server génère nouveau UUID au lieu de réutiliser
- Fix dans `server/room.go` (reconnexion) ne marche pas?

---

## 🔍 DIAGNOSTIC REQUIS

### Test #1: Vérifier positions dans game_state_sync

**Dans console, filtre**:
```
game_state_sync
```

**Puis clique sur un message et regarde `data.players`**:
```javascript
{
  players: [
    {playerId: "xxx", x: ???, y: ???, ...},
    {playerId: "yyy", x: ???, y: ???, ...}
  ]
}
```

**Questions**:
1. Les valeurs `x`, `y` CHANGENT quand tu bouges?
2. Combien de players dans l'array? (devrait être 2)
3. Les `playerId` sont stables ou changent?

---

### Test #2: Vérifier nombre de joueurs créés

**Dans console, tape**:
```javascript
document.querySelectorAll('[uuid]').length
```

**Attendu**: 2 joueurs + tiles
**Si >10**: Trop de joueurs, spawn multiples confirmé

---

### Test #3: Vérifier player_joined events

**Dans console, filtre**:
```
player_joined
```

**Questions**:
1. Combien d'events `player_joined` au total?
2. Est-ce que ça continue après le match start?
3. Les `playerId` sont différents ou identiques?

---

## 🔧 FIXES PROPOSÉS

### Fix #1: Forcer RenderSystem à update même si arrondi pareil

**Fichier**: `core/systems/render_system.js`

**Ligne 35**: Changer le check

**AVANT**:
```javascript
if (currentLeft !== position.x || currentTop !== position.y) {
```

**APRÈS**:
```javascript
// Always update for remote players (interpolation creates micro-movements)
const needsUpdate = networkPlayer && !networkPlayer.isLocal
    ? true  // Remote: always update
    : (currentLeft !== Math.round(position.x) || currentTop !== Math.round(position.y));

if (needsUpdate) {
```

---

### Fix #2: Debug game_state_sync data

**Fichier**: `core/systems_vs/network_sync_system.js`

**Ligne 242**: Ajouter log détaillé

**AJOUTER après ligne 250**:
```javascript
// DEBUG: Log FIRST player state to see actual values
if (data.players.length > 0) {
    const firstPlayer = data.players[0];
    console.warn('🔍 [DEBUG] First player in game_state_sync:', {
        playerId: firstPlayer.playerId,
        x: firstPlayer.x,
        y: firstPlayer.y,
        vx: firstPlayer.vx,
        vy: firstPlayer.vy
    });
}
```

---

### Fix #3: Prevent duplicate player spawns

**Fichier**: `game_vs.js`

**Ligne 433**: Ajouter log détaillé dans `handleRoomState()`

**AJOUTER après ligne 435**:
```javascript
console.warn('🔍 [DEBUG] handleRoomState called!');
console.warn('🔍 Current players in game:', Array.from(this.players.keys()));
console.warn('🔍 Players in room_state:', data.players.map(p => p.playerId));
```

---

## 🚀 PROCHAINES ÉTAPES

1. **Applique Fix #1** (RenderSystem always update remote)
2. **Applique Fix #2** (Debug game_state_sync)
3. **Applique Fix #3** (Debug handleRoomState)
4. **Refresh navigateurs** (Ctrl+F5)
5. **Capture nouveaux logs** avec filtres:
   - `DEBUG`
   - `game_state_sync`
   - `player_joined`
6. **Partage logs** dans tampon.md

---

## ⚠️ ROLLBACK SI NÉCESSAIRE

Si système complètement cassé, on peut temporairement **RESTAURER** l'update visual.div dans NetworkSyncSystem:

**Fichier**: `core/systems_vs/network_sync_system.js`

**Ligne 363**: AJOUTER (temporaire):
```javascript
position.x += deltaX * this.smoothingFactor;
position.y += deltaY * this.smoothingFactor;

// TEMPORARY: Restore visual.div update until RenderSystem fixed
if (visual && visual.div) {
    visual.div.style.left = `${position.x}px`;
    visual.div.style.top = `${position.y}px`;
    console.warn('⚠️ [TEMP] NetworkSync updating visual.div (rollback)');
}
```

Mais **SEULEMENT si absolument nécessaire** car ça réintroduit le race condition.

---

**PRIORITÉ**: Applique Fix #1, #2, #3 et partage nouveaux logs! 🚀
