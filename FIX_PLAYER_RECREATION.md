# Fix: Player Recreation Loop

## Problem

Le `localPlayer` était recréé plusieurs fois pendant la session, causant:
- Téléportations soudaines du joueur
- Reset de la vélocité
- Positions incohérentes
- Message d'erreur: `❌ localPlayer is NULL but connected! Recreating...`

## Root Cause Analysis

### Symptômes observés
```javascript
🎨 Local player: index=1, color=#4ECDC4, data= { x: 383, y: 608 }
📍 Local player spawn: (439.5, 832.5)
...
🎨 Local player: index=1, color=#4ECDC4, data= { x: 195, y: 680 }  ← RECREATED!
📍 Local player spawn: (251.5, 904.5)
...
❌ localPlayer is NULL but connected! Recreating...
```

### Causes identifiées

**1. Client recréait le player à chaque `test_joined`**
- Fichier: `test_sync.js` ligne 427
- Problème: `this.localPlayer = this.createPlayer(...)` appelé sans vérifier si le player existe déjà
- Impact: Chaque message `test_joined` du serveur reset complètement le player

**2. Serveur envoyait plusieurs `test_joined`**
- Fichier: `server/test_handler.go` ligne 134
- Problème: Aucune vérification si le joueur est déjà connecté avec le même ConnID
- Impact: Messages `test_join` duplicates causaient plusieurs réponses `test_joined`

**3. LocalPlayer devenait NULL sur disconnect**
- Fichier: `test_sync.js` ligne 363
- Problème: `this.localPlayer = null` sur disconnect, mais pas recréé immédiatement
- Impact: Boucle de jeu continuait à tourner avec `localPlayer === null`

## Solutions Implemented

### Fix 1: Client - Protection contre recréation (test_sync.js:427-448)

**Avant:**
```javascript
handleTestJoined(data) {
    // Always create new player
    this.localPlayer = this.createPlayer(...);
    this.localPlayer.x = mapX + (data.x || 400);
    this.localPlayer.y = mapY + (data.y || 300);
}
```

**Après:**
```javascript
handleTestJoined(data) {
    // CRITICAL FIX: Only create player if doesn't exist yet
    if (!this.localPlayer) {
        const colorIndex = data.playerIndex !== undefined
            ? data.playerIndex
            : this.hashPlayerId(this.localPlayerId);
        this.localPlayer = this.createPlayer(...);
        this.localPlayer.x = mapX + (data.x || 400);
        this.localPlayer.y = mapY + (data.y || 300);
    } else {
        // Player already exists - just update position from server
        console.log(`♻️ Player already exists, updating position from server`);
        this.localPlayer.x = mapX + (data.x || this.localPlayer.x - mapX);
        this.localPlayer.y = mapY + (data.y || this.localPlayer.y - mapY);
    }
}
```

**Résultat**: Le player n'est créé qu'une seule fois, les `test_joined` suivants mettent juste à jour la position.

### Fix 2: Serveur - Détection des duplicates (test_handler.go:95-137)

**Avant:**
```go
if existingPlayer != nil {
    // Reconnection - always update and send test_joined
    testPlayer = existingPlayer
    testPlayer.Connected = true
    testPlayer.ConnID = p.ID
}
```

**Après:**
```go
if existingPlayer != nil {
    testPlayer = existingPlayer
    playerIndex = testPlayer.Index

    // Check if already connected with same connection ID
    if testPlayer.Connected && testPlayer.ConnID == p.ID {
        log.Printf("[TEST] Player %s is ALREADY CONNECTED with same ConnID, ignoring duplicate join", playerName)
        alreadyConnected = true
        // Don't update anything, just skip
    } else {
        // Real reconnection (different ConnID or was disconnected)
        testPlayer.Connected = true
        testPlayer.ConnID = p.ID
    }
}

// Early return if already connected - don't send duplicate test_joined
if alreadyConnected {
    return
}
```

**Résultat**: Le serveur détecte les messages `test_join` duplicates et ne renvoie pas `test_joined` si le joueur est déjà connecté.

### Fix 3: Debug logs pour traçabilité

**Logs ajoutés:**

1. **Compteur de messages `test_joined`** (test_sync.js:388):
```javascript
case 'test_joined':
    console.log(`📨 Received test_joined message #${++this.joinedCount || 1}`);
    this.handleTestJoined(data);
```

2. **Log de disconnect** (test_sync.js:363):
```javascript
console.log('🔴 DISCONNECT: Setting localPlayer to NULL');
this.localPlayer = null;
```

3. **Log de mise à jour position** (test_sync.js:441):
```javascript
console.log(`♻️ Player already exists, updating position from server`);
```

## Testing Instructions

1. **Recompiler le serveur:**
```bash
cd server
go build -o rodrigo-jack-vs
./rodrigo-jack-vs
```

2. **Ouvrir 2 navigateurs** sur `http://localhost:8000/test_sync.html`

3. **Vérifier dans les console logs:**
   - ✅ Un seul message `🎨 Local player: index=X` par connexion
   - ✅ Pas de messages `📍 Local player spawn` répétés
   - ✅ Pas de `❌ localPlayer is NULL but connected!` pendant le jeu
   - ✅ Si reconnexion: message `♻️ Player already exists, updating position`

4. **Tester les mouvements:**
   - Déplacements fluides sans téléportation
   - Gravité et sauts fonctionnent sans interruption
   - Les deux joueurs se voient avec des couleurs différentes

5. **Tester la stabilité:**
   - Connexion stable pendant plusieurs minutes
   - Pas de disconnect/reconnect en boucle
   - Pas de recreation du player pendant le jeu

## Expected Behavior

### Au connect:
```
📨 Received test_joined message #1
🎨 Local player: index=0, color=#FF6B6B, data= { ... }
📍 Local player spawn: (223, 336)
```

### Pendant le jeu:
```
ℹ️ Received my own position from server: 200, 480
ℹ️ Received my own position from server: 312, 450
// NO player recreation messages
```

### Si reconnexion (rare):
```
📨 Received test_joined message #2
♻️ Player already exists, updating position from server
📍 Updated position: (312, 450)
```

## Files Modified

- ✅ `test_sync.js` - Client protection contre recréation
- ✅ `server/test_handler.go` - Serveur détection duplicates
- ✅ `server/rodrigo-jack-vs` - Binary recompilé

## Status

🔧 **Fixes appliquées** - En attente de test utilisateur pour validation.

Si le problème persiste après ces fixes, vérifier:
1. Le serveur Go a bien été recompilé et redémarré
2. Les browsers ont bien rechargé les fichiers JS (Ctrl+Shift+R)
3. Les logs serveur pour voir si `handleTestJoin` est encore appelé plusieurs fois
