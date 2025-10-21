# 🔍 Session de Debug WebSocket - Mode VS

**Date**: 2025-10-21
**Problème Initial**: Le mouvement des joueurs ne se synchronise pas entre les navigateurs en mode VS

---

## ✅ Problèmes Résolus

### 1. CORS IPv6 Localhost
**Symptôme**: `BLOCKED unauthorized origin: http://[::1]:8000`
**Cause**: Firefox utilisait IPv6 localhost non autorisé
**Solution**: Ajout de `http://[::1]:8000` dans `allowedOrigins` ([server/main.go](server/main.go))

### 2. Game Loop Non Démarré
**Symptôme**: Server ne broadcast jamais `game_state_sync`
**Cause**: Game loop créé mais jamais démarré après countdown
**Solution**: Ajout de `go r.StartGameLoop()` dans `startCountdown()` ([server/room.go:424](server/room.go#L424))

### 3. Handler Registration Timing
**Symptôme**: `[WebSocketClient] Routing game_state_sync to undefined handler(s)`
**Cause**: `NetworkSyncSystem.registerHandlers()` appelé AVANT création de `networkClient`
**Solution**:
- Sauvegarde de référence `networkSyncSystem` dans GameVS
- Registration explicite APRÈS connexion WebSocket
- Modification de `setGame()` pour ne plus enregistrer les handlers trop tôt

**Fichiers modifiés**:
- [game_vs.js:174](game_vs.js#L174) - Sauvegarde référence system
- [game_vs.js:349](game_vs.js#L349) - Registration après connexion
- [network_sync_system.js:46](core/systems_vs/network_sync_system.js#L46) - Suppression registration dans setGame()

### 4. Positions de Spawn Différentes
**Symptôme**: Tous les joueurs spawn au même endroit (superposés)
**Cause**: Spawn points par défaut identiques
**Solution**: Calcul automatique de positions espacées dans `getSpawnPoint()` ([game_vs.js:577](game_vs.js#L577))

---

## 🧪 Test de Validation Créé

### Page de Test Draw ([views/draw_test.html](views/draw_test.html))
- Canvas collaboratif simple
- WebSocket broadcasting fonctionnel ✅
- Prouve que le WebSocket de base fonctionne
- Handlers `draw_line` et `clear_canvas` ajoutés côté serveur

**Résultat**: Le dessin se synchronise correctement = WebSocket OK ✅

---

## 🔧 Debug Logs Ajoutés

### NetworkSyncSystem
- Emoji 🔥 dans `handleGameStateSync` pour visibilité
- Logs de timing dans `update()` (toutes les secondes)
- Logs détaillés dans `setGame()` et `registerHandlers()`
- Simplification logs dans boucle de traitement des joueurs

### GameVS
- Emoji 👤 pour événement `player_joined`
- Logs de registration des handlers

### WebSocketClient
- Logs existants déjà bons

---

## ❌ Problème Actuel Non Résolu

### Symptôme
```
[NetworkSync] Remote player 56d9006a has insufficient buffer: 0
[NetworkSync] updateRemotePlayers: 0 / 1 players interpolated
```

### Analyse
- `handleGameStateSync` semble être appelé (sinon pas de remote player détecté)
- Remote player entity EXISTE dans le jeu
- MAIS son buffer reste vide (= `bufferRemotePlayerState` ne s'exécute pas OU les IDs ne matchent pas)

### Vérifications Nécessaires
1. ✅ Chercher logs `🔥🔥🔥 [NetworkSync] handleGameStateSync CALLED!` dans console
2. ⏳ Vérifier si `[NetworkSync] Player xxxxxxxx: REMOTE (buffer)` apparaît
3. ⏳ Vérifier si `bufferRemotePlayerState` est appelé
4. ⏳ Comparer player IDs entre server et client

---

## 📊 Architecture Complète

### Client → Server (60fps)
```
NetworkSyncSystem.sendLocalPlayerState()
  → WebSocketClient.send('player_state', {...})
    → Server player.go handlePlayerState()
      → Validation (velocity, bounds, anti-cheat)
      → Update Player struct (X, Y, VX, VY)
```

### Server → Client (20Hz)
```
Room.StartGameLoop() [game_loop.go]
  → Every 50ms: broadcastGameStateLocked()
    → Broadcast 'game_state_sync' to all players
      → Client WebSocketClient receives
        → NetworkSyncSystem.handleGameStateSync()
          → bufferRemotePlayerState() for each remote player
            → updateRemotePlayers() interpolates buffered states
```

---

## 🎯 Prochaines Étapes

1. **Vérifier logs console** pour `🔥🔥🔥 handleGameStateSync`
2. **Si absent**: Handler toujours pas enregistré
3. **Si présent mais buffer vide**: Problème de player ID matching
4. **Si buffer se remplit**: Problème d'interpolation

---

## 📝 Fichiers Modifiés

### Serveur (Go)
- `server/main.go` - CORS IPv6
- `server/room.go` - Game loop start après countdown
- `server/player.go` - Handlers `draw_line` et `clear_canvas`

### Client (JavaScript)
- `game_vs.js` - Handler registration timing fix
- `core/systems_vs/network_sync_system.js` - setGame() modification, debug logs
- `views/draw_test.html` - Page de test WebSocket (NOUVEAU)

---

## 🔍 Commandes de Debug Utiles

### Console Navigateur
```javascript
// Voir tous les messages WebSocket reçus
// Chercher: 🔥🔥🔥 handleGameStateSync
// Chercher: Player xxxxxxxx: REMOTE (buffer)
```

### Logs Serveur
```bash
# Filtrer game_state_sync
tail -f /tmp/rodrigo-server.log | grep "game_state_sync"

# Filtrer player_state reçus
tail -f /tmp/rodrigo-server.log | grep "player_state"
```

---

## 💡 Leçons Apprises

1. **Timing is everything**: Les handlers doivent être enregistrés APRÈS que les dépendances existent
2. **Test simple first**: Le draw test a prouvé que WebSocket fonctionne avant de debugger le jeu complexe
3. **Logs visuels**: Les emojis 🔥👤 rendent les logs importants impossible à manquer
4. **Architecture best practices**: Client-side prediction + server reconciliation + interpolation déjà bien implémenté
