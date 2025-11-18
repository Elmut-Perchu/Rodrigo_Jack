# Fix : Messages Pong et Déconnexions

## 🐛 Problèmes Identifiés

### 1. "Unknown message type: pong"
**Symptôme** : Le serveur loggait "Unknown message type: pong"
**Cause** : Le handler de messages ne gérait pas le cas "pong"
**Impact** : Message d'erreur dans les logs (pas critique mais indésirable)

### 2. WebSocket disconnected
**Symptôme** : Déconnexion après ~30 secondes
**Cause Possible** : Logs trop verbeux saturant le serveur
**Impact** : Connexion coupée, perte de session

## ✅ Solutions Appliquées

### 1. Ajout du Handler "pong"
```go
case "pong":
    // Client responded to our ping - just acknowledge, no action needed
    log.Printf("[Player] %s pong received", p.ID)
```

### 2. Réduction des Logs
Avant : TOUS les messages étaient loggés (incluant test_update à 20Hz)
```go
log.Printf("[Player] %s received RAW data: %s", p.ID, string(messageData))
log.Printf("[Player] %s received message type: %s", p.ID, msg.Type)
log.Printf("[Player] %s message data: %+v", p.ID, msg.Data)
```

Après : Seulement les messages importants
```go
// Skip test_update, ping, pong, player_state (trop fréquents)
if msg.Type != "test_update" && msg.Type != "ping" && msg.Type != "pong" && msg.Type != "player_state" {
    log.Printf("[Player] %s received: %s", p.ID, msg.Type)
}
```

### 3. Amélioration des Logs d'Erreur
```go
if !exists {
    log.Printf("[TEST] Room %s not found for player %s", p.testRoomCode, playerId)
    return
}
```

## 🧪 Pour Tester

1. **Redémarre le serveur** :
```bash
cd server
go run .
```

2. **Connecte 2 joueurs** et laisse-les pendant 2-3 minutes

3. **Vérifie** :
   - ✅ Pas de message "Unknown message type: pong"
   - ✅ Connexion reste stable pendant plusieurs minutes
   - ✅ Les logs sont plus propres (moins de spam)
   - ✅ Les sauts/mouvements continuent de se synchroniser

## 📊 Messages Réseau

### Fréquence des Messages
```
test_update : 20 Hz (toutes les 50ms) - pas loggé
ping        : 0.033 Hz (toutes les 30s) - pas loggé
pong        : 0.033 Hz (réponse au ping) - pas loggé
test_join   : 1x au début - loggé ✅
test_leave  : 1x à la fin - loggé ✅
```

### Ce qui est maintenant loggé
- Connexions/Déconnexions de joueurs
- Rejoindre/Quitter une room
- Erreurs de parsing de messages
- Rooms non trouvées
- Joueurs non trouvés dans une room

### Ce qui n'est PLUS loggé (réduit le spam)
- test_update (20x/seconde)
- ping/pong (1x/30s)
- player_state (mode VS, fréquent)
- Données brutes des messages

## 🎯 Résultats Attendus

**Avant** :
```
[16:47:08] Player Player joined with color index 1
[16:47:34] Unknown message type: pong
[16:47:39] Jump!
[16:47:40] Jump!
[16:48:04] WebSocket disconnected
```

**Après** :
```
[16:47:08] Player Player joined with color index 1
[connexion stable pendant des minutes...]
[pas de spam dans les logs]
```

## 🔧 Si Problèmes Persistent

### Vérifier le ReadDeadline
Le serveur a un timeout de 60 secondes qui se réinitialise à chaque message.
Avec test_update à 20Hz, ça devrait être largement suffisant.

### Vérifier la Connexion Réseau
```bash
# Dans le navigateur, console :
setInterval(() => console.log('Still connected:', testSync.connected), 5000)
```

### Activer les Logs Détaillés (temporairement)
Si besoin de déboguer, modifier `player.go` ligne 112 :
```go
// Activer temporairement pour déboguer
log.Printf("[Player] %s received: %s", p.ID, msg.Type)
```

---

**Status** : ✅ Fixes appliqués, prêt à tester