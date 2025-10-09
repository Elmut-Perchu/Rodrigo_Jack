# 🔧 Guide de Débogage VS Mode

## 🚀 Démarrage Rapide

### 1. Vérifier que les serveurs tournent

```bash
lsof -i :8000 -i :8080 | grep LISTEN
```

Tu devrais voir 2 lignes:
- Port 8000 (Python - frontend)
- Port 8080 (rodrigo-jack-vs - backend)

**Si pas de résultat:** Redémarre les serveurs avec `./start-servers.sh`

---

## 🔍 Outil de Test WebSocket

### Comment l'utiliser:

**1. Ouvre l'outil dans ton navigateur:**
```
http://localhost:8000/views/ws_test.html
```

**2. Tu verras 4 sections:**

┌─────────────────────────────────────┐
│ 🔌 WebSocket Test Tool              │
├─────────────────────────────────────┤
│ Connection                          │
│ 🔴 Disconnected                     │
│ [Room Code] [Player Name]           │
│ [Connect] [Disconnect]              │
├─────────────────────────────────────┤
│ Actions                             │
│ [Toggle Ready] [Chat] [Send]        │
├─────────────────────────────────────┤
│ Room State                          │
│ {JSON data...}                      │
├─────────────────────────────────────┤
│ Message Log                         │
│ [Clear Log]                         │
│ - Messages sent/received            │
└─────────────────────────────────────┘

**3. Test avec 2 navigateurs:**

**NAVIGATEUR 1 (Host):**
1. Room Code: `TEST` (4 lettres)
2. Player Name: `Player1`
3. Clique `[Connect]`
4. Regarde les logs → Tu devrais voir:
   ```
   ✅ LOBBY JOINED: {...}
   📊 ROOM STATE: {...}
   ```

**NAVIGATEUR 2 (Guest):**
1. Room Code: `TEST` (MÊME CODE!)
2. Player Name: `Player2`
3. Clique `[Connect]`
4. Regarde les logs → Tu devrais voir:
   ```
   ✅ LOBBY JOINED: {...}
   👥 PLAYER JOINED: {...}
   📊 ROOM STATE: {...}
   ```

**4. Dans NAVIGATEUR 1:**
- Tu devrais voir dans les logs: `👥 PLAYER JOINED: Player2`

**5. Les deux cliquent `[Toggle Ready]`**

**6. Compte à rebours:**
- Tu devrais voir: `⏳ COUNTDOWN STARTED: 10s`
- Puis: `⏳ COUNTDOWN: 9s`, `8s`, etc.

---

## 📊 Interprétation des Logs

### Logs normaux (connexion réussie):

```
[13:45:30] 🔧 WebSocket Test Tool ready
[13:45:35] Connecting to room TEST as Player1...
[13:45:35] ✅ Connected successfully!
[13:45:35] ➡️ SENT lobby_join
[13:45:35] ✅ LOBBY JOINED: {roomCode: "TEST", playerId: "...", isHost: true}
[13:45:35] 📊 ROOM STATE: {players: [...], playerCount: 1}
```

### Logs d'erreur (connexion échouée):

```
[13:45:30] 🔧 WebSocket Test Tool ready
[13:45:35] Connecting to room TEST as Player1...
[13:45:40] ❌ Connection failed: Error...
```

**Si tu vois cette erreur:**
→ Le serveur Go n'est pas démarré ou ne répond pas

---

## 🐛 Problèmes Courants

### Problème 1: "Connection failed"

**Symptôme:** Le statut reste "Connecting" puis passe à "Disconnected"

**Cause:** Le serveur Go (port 8080) ne tourne pas

**Solution:**
```bash
cd server
go run main.go
```

Ou redémarre tout:
```bash
./start-servers.sh
```

### Problème 2: Les deux joueurs ne se voient pas

**Symptôme:**
- Player1 se connecte OK
- Player2 se connecte OK
- Mais ils ne se voient pas dans la room

**Cause probable:** Codes de room différents

**Vérification:**
- Dans NAVIGATEUR 1 → Regarde "Room State" → Note le `roomCode`
- Dans NAVIGATEUR 2 → Entre EXACTEMENT le même code

### Problème 3: Countdown ne démarre pas

**Symptôme:** Les deux joueurs sont "Ready" mais pas de countdown

**Causes possibles:**
1. Un des joueurs n'est pas vraiment ready
2. Moins de 2 joueurs dans la room

**Vérification:**
- Regarde "Room State" → `players` → Vérifie `isReady: true` pour tous

---

## 🔬 Test Détaillé Étape par Étape

### Phase 1: Test de connexion (1 joueur)

1. Ouvre l'outil: `http://localhost:8000/views/ws_test.html`
2. Room Code: `XXXX` (4 caractères)
3. Player Name: `Test1`
4. Clique `Connect`

**✅ Succès si tu vois:**
```
✅ Connected successfully!
✅ LOBBY JOINED: {isHost: true, playerId: "..."}
📊 ROOM STATE: {playerCount: 1}
```

**❌ Échec si tu vois:**
```
❌ Connection failed: ...
```
→ Vérifier serveur Go (port 8080)

---

### Phase 2: Test multi-joueur (2 joueurs)

1. **Navigateur 1:**
   - Connecté avec code `XXXX`
   - Note le code exact affiché

2. **Navigateur 2 (nouvel onglet ou navigateur privé):**
   - Ouvre `http://localhost:8000/views/ws_test.html`
   - Entre LE MÊME code `XXXX`
   - Player Name: `Test2`
   - Clique `Connect`

**✅ Succès si dans Navigateur 1 tu vois:**
```
👥 PLAYER JOINED: {playerName: "Test2", playerCount: 2}
💬 CHAT: [System] Test2 joined the room
```

**✅ Succès si dans Navigateur 2 tu vois:**
```
✅ LOBBY JOINED: {isHost: false}
📊 ROOM STATE: {playerCount: 2, players: [{name: "Test1"}, {name: "Test2"}]}
```

---

### Phase 3: Test Ready & Countdown

1. **Navigateur 1:** Clique `[Toggle Ready]`
   - Bouton devient "Not Ready"
   - Log: `➡️ SENT lobby_ready: true`

2. **Navigateur 2:** Clique `[Toggle Ready]`
   - Log: `➡️ SENT lobby_ready: true`

**✅ Succès si les DEUX voient:**
```
⏳ COUNTDOWN STARTED: 10s
⏳ COUNTDOWN: 9s
⏳ COUNTDOWN: 8s
...
🎮 GAME STARTING!
```

---

## 📋 Checklist de Diagnostic

Coche les étapes au fur et à mesure:

- [ ] Frontend tourne (port 8000)
- [ ] Backend tourne (port 8080)
- [ ] Outil de test s'ouvre: `http://localhost:8000/views/ws_test.html`
- [ ] Player1 se connecte avec succès
- [ ] Player1 voit "LOBBY JOINED" dans les logs
- [ ] Player2 entre le MÊME code que Player1
- [ ] Player2 se connecte avec succès
- [ ] Player1 voit "PLAYER JOINED: Player2"
- [ ] Player2 voit "ROOM STATE" avec 2 joueurs
- [ ] Player1 clique "Toggle Ready"
- [ ] Player2 clique "Toggle Ready"
- [ ] Les deux voient "COUNTDOWN STARTED"
- [ ] Les deux voient "GAME STARTING"

**Si toutes les étapes sont cochées → VS Mode fonctionne! 🎉**

---

## 🆘 Si Rien Ne Marche

### 1. Redémarrer complètement

```bash
# Tuer tous les processus
lsof -ti :8000 | xargs kill -9
lsof -ti :8080 | xargs kill -9

# Redémarrer
./start-servers.sh
```

### 2. Vérifier les logs du serveur Go

Dans le terminal où tourne `go run main.go`, tu devrais voir:

```
[Server] Starting Rodrigo Jack VS Mode Server...
[Server] WebSocket server listening on :8080
[WebSocket] New connection attempt from ...
[Player] New player created: ...
[Player] ... received message: lobby_join
[Room] Player ... joined room XXXX
```

**Si tu ne vois RIEN:**
→ Le serveur Go n'a pas reçu la connexion
→ Vérifie le port 8080

### 3. Vérifier la console du navigateur (F12)

```javascript
[WebSocketClient] Connecting to ws://localhost:8080/ws...
[WebSocketClient] Connected successfully
[WebSocketClient] Sending: {type: "lobby_join", ...}
[WebSocketClient] Received: {type: "lobby_joined", ...}
```

**Si tu vois une erreur:**
→ Note l'erreur exacte et cherche dans ce guide

---

## 🎯 Résumé Ultra-Rapide

1. **Démarre les serveurs:** `./start-servers.sh`
2. **Ouvre l'outil:** `http://localhost:8000/views/ws_test.html`
3. **2 navigateurs → Même code de room → Connect**
4. **Les deux Ready → Countdown automatique**

**Problème?** Regarde les logs dans l'outil de test! 📊
