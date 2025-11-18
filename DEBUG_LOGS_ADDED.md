# Logs de Débogage Ajoutés

## 🔍 Logs Ajoutés pour Diagnostiquer le Problème

### 1. Vérification localPlayer NULL
**Fichier** : `test_sync.js` ligne 557-560
**Log** : `❌ localPlayer is NULL but connected! Recreating...`
**Déclencheur** : Si `this.localPlayer` est `null` alors que `this.connected` est `true`

### 2. Position du Joueur Local Reçue du Serveur
**Fichier** : `test_sync.js` ligne 443-447
**Log** : `ℹ️ Received my own position from server: X, Y`
**Déclencheur** : Quand le serveur envoie la position du joueur local dans `test_state`

### 3. Élément DOM du Joueur NULL
**Fichier** : `test_sync.js` ligne 540-543
**Log** : `❌ Player element is NULL!`
**Déclencheur** : Quand `updatePlayerVisual()` est appelée mais que `player.element` est `null`

## 🧪 Comment Tester avec les Logs

### 1. Redémarrer le Serveur
```bash
cd server
go run .
```

### 2. Ouvrir la Console du Navigateur
- Chrome: F12 → Console
- Firefox: F12 → Console

### 3. Se Connecter et Observer les Logs

#### A. Au Démarrage
Logs attendus :
```
🎨 Local player: index=0, color=#FF6B6B, data={...}
📍 Local player spawn: (X, Y)
```

#### B. Pendant le Jeu
Logs normaux (toutes les 50ms environ) :
```
ℹ️ Received my own position from server: X, Y
```

#### C. Quand le Joueur Disparaît
Logs d'erreur possibles :
```
❌ localPlayer is NULL but connected! Recreating...
OU
❌ Player element is NULL! {player object}
```

## 📊 Scénarios Possibles

### Scénario 1 : localPlayer devient NULL
```
Cause: this.localPlayer = null quelque part dans le code
Solution: Trouver où localPlayer est réinitialisé à null
```

### Scénario 2 : player.element est supprimé
```
Cause: Le DOM element est détaché ou supprimé
Solution: Vérifier removePlayer(), disconnect(), etc.
```

### Scénario 3 : Position sort de l'écran
```
Cause: Calcul de position incorrect (mapX/mapY)
Solution: Vérifier les coordonnées dans les logs
```

### Scénario 4 : CSS display:none ou visibility:hidden
```
Cause: Style CSS cache le joueur
Solution: Inspecter l'élément dans le navigateur
```

## 🎯 Ce Qu'on Cherche

Quand tu appuies sur ESPACE et que le joueur disparaît, regarde la console :

1. **Si tu vois** `❌ localPlayer is NULL` → Le joueur est détruit quelque part
2. **Si tu vois** `❌ Player element is NULL` → L'élément DOM est supprimé
3. **Si tu vois** `ℹ️ Received my own position` avec des valeurs bizarres → Problème de synchronisation
4. **Si tu ne vois RIEN** → Le problème est ailleurs (CSS, canvas, etc.)

## 📝 Instructions pour Toi

1. Redémarre le serveur Go
2. Ouvre `test_sync.html` avec la console ouverte (F12)
3. Connecte-toi
4. Appuie sur ESPACE plusieurs fois
5. **Copie-colle tous les logs** de la console quand le joueur disparaît
6. Envoie-moi les logs, je pourrai identifier le problème exact !

---

**Status** : Logs de débogage prêts, en attente des résultats du test