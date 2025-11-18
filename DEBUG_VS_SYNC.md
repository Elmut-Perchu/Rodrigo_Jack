# 🔧 DEBUG MODE VS - SYNCHRONISATION WEBSOCKET

## 🚨 PROBLÈME IDENTIFIÉ

**Les personnages restent bloqués au point de spawn (300,200) et (1200,200)**

### Analyse de la chaîne de communication :

1. **✅ SERVEUR GO** - Fonctionne correctement
   - Game loop tourne (Tick 0, 1, 2...)
   - Envoie `game_state_sync` à 20Hz
   - Reçoit les `player_state` du client

2. **✅ CLIENT REÇOIT** - Messages arrivent
   - Reçoit `game_state_sync` correctement
   - `handleGameStateSync()` stocke les états

3. **❌ PROBLÈME** - Position bloquée
   - Client envoie toujours `x:300 y:200` (position spawn)
   - Vélocités toujours à 0
   - Le joueur local ne bouge PAS

## 🔍 LOGS DE DEBUG AJOUTÉS

J'ai ajouté des logs de debug dans plusieurs fichiers pour identifier le problème :

### 1. `network_sync_system.js` (ligne 238)
```javascript
🔍 [SEND RAW] position.x=300, position.y=200
🔍 [SEND RAW] velocity.vx=0, velocity.vy=0
🔍 [SEND RAW] has input: true, networkPlayer.isLocal: true
```

### 2. `movement_system.js` (ligne 27)
```javascript
🔍 [MOVEMENT] Local player: pos(300.0, 200.0) vel(0.0, 0.0)
```

### 3. `input_system.js` (ligne 23)
```javascript
🔍 [INPUT] Processing local player: has input=true, vector={"h":0,"v":0}, movable=true
```

## 🎯 TESTS À EFFECTUER

### TEST 1 : Vérifier les logs de base
1. Rafraîchir les navigateurs
2. Rejoindre une room avec 2 joueurs
3. Ouvrir la console (F12)
4. Chercher ces logs :
   - `🔍 [SEND RAW]` - Positions envoyées
   - `🔍 [MOVEMENT]` - MovementSystem
   - `🔍 [INPUT]` - InputSystem

### TEST 2 : Tester les contrôles
1. **Appuyer sur les touches fléchées** :
   - `ArrowLeft` / `ArrowRight` pour bouger
   - `ArrowUp` pour sauter
2. Vérifier dans les logs si `vector` change :
   - Devrait passer de `{"h":0,"v":0}` à `{"h":1,"v":0}` ou `{"h":-1,"v":0}`

### TEST 3 : Vérifier l'Input component
Dans la console, taper :
```javascript
// Trouver le joueur local
const localPlayer = Array.from(game.entities).find(e => {
  const np = e.getComponent('networkPlayer');
  return np && np.isLocal;
});

// Vérifier ses components
console.log('Has input:', !!localPlayer?.getComponent('input'));
console.log('Has position:', !!localPlayer?.getComponent('position'));
console.log('Has velocity:', !!localPlayer?.getComponent('velocity'));
console.log('Has property:', !!localPlayer?.getComponent('property'));

// Tester manuellement l'input
const input = localPlayer?.getComponent('input');
if (input) {
  console.log('Input keys:', Array.from(input.keys));
  console.log('Input vector:', input.vector);

  // Forcer un mouvement
  input.vector.h = 1;  // Bouger à droite
  console.log('Forced vector to:', input.vector);
}
```

## 🔧 HYPOTHÈSES DU PROBLÈME

### H1 : Input component ne capture pas les touches
- Les event listeners ne sont pas attachés
- Ou les touches utilisées sont mauvaises (WASD vs Flèches)

### H2 : InputSystem.update() n'est pas appelé
- Le système n'est pas enregistré dans game_vs.js
- Ou il est désactivé pour le mode VS

### H3 : Property component manquant ou incorrect
- `movable: false` empêche le mouvement
- Ou `speed: 0` annule la vélocité

## 📊 SOLUTION RAPIDE

Si les touches ne fonctionnent pas, essayer dans la console :
```javascript
// Forcer le mouvement manuellement
const localPlayer = Array.from(game.entities).find(e => {
  const np = e.getComponent('networkPlayer');
  return np && np.isLocal;
});

if (localPlayer) {
  const vel = localPlayer.getComponent('velocity');
  const pos = localPlayer.getComponent('position');

  // Forcer une vélocité
  vel.vx = 100;
  console.log('Forced velocity, should move now!');

  // Vérifier après 1 seconde
  setTimeout(() => {
    console.log('New position:', pos.x, pos.y);
  }, 1000);
}
```

## 🚨 ACTIONS SUIVANTES

1. **Tester avec les logs** pour voir où ça bloque
2. **M'envoyer les résultats** des tests ci-dessus
3. **Je pourrai alors appliquer le fix** approprié

---

**Note** : Le problème est probablement dans l'Input component qui ne capture pas les touches ou dans l'InputSystem qui ne met pas à jour les vélocités.