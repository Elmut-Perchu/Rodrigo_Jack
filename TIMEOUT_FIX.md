# Timeout Fix - WebSocket Connection

## Problem
Le mouvement se bloquait après environ 60 secondes d'inactivité. Le joueur ne pouvait plus bouger.

## Cause Racine
Le serveur Go avait un `ReadDeadline` de 60 secondes qui se réinitialisait SEULEMENT quand il recevait un message "pong". Si le joueur ne bougeait pas pendant 60 secondes, aucun message "test_update" n'était envoyé, et la connexion expirait.

## Solutions Appliquées

### 1. Côté Serveur (player.go)
Réinitialiser le `ReadDeadline` à CHAQUE message reçu, pas seulement les "pong":
```go
// Reset read deadline on ANY message received (not just pongs)
p.Conn.SetReadDeadline(time.Now().Add(60 * time.Second))
```

### 2. Côté Client (test_sync.js)
Le client envoie maintenant des "test_update" toutes les 50ms MÊME si le joueur ne bouge pas:
```javascript
// Send position update (even if not moving, to keep connection alive)
if (now - this.lastSendTime >= this.UPDATE_RATE) {
    this.send('test_update', {...});
}
```

### 3. Heartbeat Existant
Le client envoie déjà un "ping" toutes les 30 secondes comme sécurité supplémentaire.

## Architecture de Keep-Alive

```
Client                          Server
  |                               |
  |------ test_update (50ms) ---->|  Reset deadline (60s)
  |                               |
  |------ ping (30s) ------------>|  Reset deadline (60s)
  |<----- pong -------------------|
  |                               |
  |------ ANY message ----------->|  Reset deadline (60s)
  |                               |
```

## Test de la Solution

1. Redémarrer le serveur Go pour appliquer les changements:
```bash
cd server
go run .
```

2. Connecter deux joueurs dans des navigateurs différents

3. Tester l'inactivité:
   - Bouger les joueurs pour vérifier que tout fonctionne
   - Arrêter de bouger pendant >60 secondes
   - Vérifier que la connexion reste active
   - Essayer de bouger à nouveau après 60+ secondes

## Résultat Attendu
- La connexion reste active indéfiniment
- Les joueurs peuvent bouger à tout moment
- Pas de déconnexion après 60 secondes d'inactivité
- Les messages "test_update" maintiennent la connexion vivante

## Monitoring
Dans la console du serveur, vous devriez voir:
- Messages "test_update" toutes les 50ms par joueur connecté
- Messages "ping/pong" toutes les 30 secondes
- Aucun message "Unexpected close error" après 60 secondes