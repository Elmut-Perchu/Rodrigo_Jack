# Fix Déconnexion v2

## 🐛 Problèmes Identifiés dans les Logs

### 1. "Unknown message type: pong"
**Logs** : `[17:03:18] Unknown message type: pong`
**Cause** : Le client ne gérait pas le message "pong" du serveur
**Fix** : Ajouté `case 'pong':` dans `handleMessage()`

### 2. Déconnexion après ~30 secondes
**Logs** :
```
[17:02:11] Jump!
[17:02:13] WebSocket disconnected  (2 secondes après jump)
[17:03:48] WebSocket disconnected  (30 secondes après dernier jump)
```

**Hypothèse** : La goroutine `broadcastRoomState` s'arrête parce que `findPlayerConnection()` retourne `nil`

## ✅ Fixes Appliqués

### Fix #1 : Handler pour "pong"
**Fichier** : `test_sync.js`
```javascript
case 'pong':
    // Server responded to our ping, just acknowledge
    // No action needed
    break;
```

### Fix #2 : Log de Warning pour Debug
**Fichier** : `server/test_handler.go` ligne 264
```go
if p := findPlayerConnection(player.ConnID); p != nil {
    connectedPlayerObjects = append(connectedPlayerObjects, p)
} else {
    log.Printf("[TEST] WARNING: Could not find player connection for ConnID=%s, player=%s", player.ConnID, player.Name)
}
```

### Fix #3 : Throttle des Logs Position
**Fichier** : `test_sync.js`
- Réduit les logs "Received my own position" à 1 par seconde au lieu de 20/seconde
- Évite le spam dans la console

## 🧪 Test à Faire

### 1. Redémarrer le Serveur
```bash
cd server
go run .
```

### 2. Ouvrir test_sync.html

### 3. Observer Logs Serveur
Chercher ce log :
```
[TEST] WARNING: Could not find player connection for ConnID=abc123
```

**Si ce log apparaît** → Le problème est identifié : race condition dans allPlayers
**Si ce log N'apparaît PAS** → Le problème est ailleurs

### 4. Observer Logs Client
Chercher :
- ❌ Plus de "Unknown message type: pong"
- ❌ "WebSocket disconnected" après 30 secondes
- ✅ Connexion stable pendant plusieurs minutes

## 🔍 Analyse

### Flux de Connexion/Déconnexion

```
Client Connect:
1. NewPlayer() créé → registerPlayer() → ajouté à allPlayers
2. test_join → handleTestJoin()
3. TestPlayer.ConnID = p.ID (nouveau ID)
4. TestPlayer.Connected = true

Client Disconnect:
1. Close() appelé → unregisterPlayer() → supprimé de allPlayers
2. handleTestLeave() → TestPlayer.Connected = false
3. TestPlayer.ConnID reste avec ancien ID

Client Reconnect:
1. NewPlayer() créé avec NOUVEL ID → registerPlayer()
2. test_join → existingPlayer trouvé
3. TestPlayer.ConnID = p.ID (NOUVEAU ID mis à jour)
4. TestPlayer.Connected = true

Broadcast Goroutine (toutes les 50ms):
1. Lit room.Players
2. Pour chaque player.Connected=true:
   - Appelle findPlayerConnection(player.ConnID)
   - Si retourne nil → WARNING log
   - Si retourne *Player → ajoute à connectedPlayerObjects
3. Si connectedPlayerObjects vide → STOP goroutine
```

### Race Condition Possible

```
Thread 1 (Client)           Thread 2 (Broadcast)
─────────────────           ────────────────────
Close()
  unregisterPlayer()
  (allPlayers[oldID] deleted)
                            findPlayerConnection(oldID)
                            → returns nil !
  handleTestLeave()
  (Connected = false)
```

**Timing** : Si le broadcast thread lit le TestPlayer AVANT que handleTestLeave() marque Connected=false, mais APRÈS que unregisterPlayer() supprime de allPlayers, alors findPlayerConnection() retourne nil.

## 🎯 Solutions Possibles

### Solution A : Lock Plus Large
Utiliser le même mutex pour allPlayers et room.Players

### Solution B : Vérifier Connected AVANT findPlayerConnection
```go
if player.Connected {
    if p := findPlayerConnection(player.ConnID); p != nil {
        // OK
    } else {
        // Mark as disconnected
        player.Connected = false
    }
}
```

### Solution C : Ne Pas Arrêter la Goroutine
Continuer même si connectedPlayerObjects est vide temporairement

---

**Status** : Logs de debug ajoutés, en attente du prochain test pour confirmer l'hypothèse