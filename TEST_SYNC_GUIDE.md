# 🔴 Test Sync - Guide de Test Rapide

## 🚀 Démarrage

### 1. Lancer le serveur Go
```bash
cd server
./rodrigo-jack-vs
```

### 2. Lancer le serveur web
```bash
# Dans un autre terminal
python3 -m http.server 8000
```

### 3. Ouvrir 2 navigateurs
- **Browser 1**: http://localhost:8000/test_sync.html
- **Browser 2**: http://localhost:8000/test_sync.html (ou incognito)

## 🎮 Test

### Étape 1 : Connection
1. **Browser 1** : Cliquer "Connect" (Room: TEST)
2. **Browser 2** : Cliquer "Connect" (Room: TEST)

### Étape 2 : Mouvement
- Utiliser les **flèches directionnelles** :
  - `↑` `↓` `←` `→` pour bouger
- Les cercles laissent une **traînée colorée**

### Étape 3 : Vérification
✅ **Si ça marche** :
- Les traînées sont synchronisées
- Le mouvement d'un joueur apparaît sur l'autre navigateur
- Les couleurs sont différentes pour chaque joueur

❌ **Si ça ne marche pas** :
- Les traînées ne sont pas synchrones
- Un joueur ne bouge que localement
- Aucun mouvement visible

## 📊 Debug

### Console Browser (F12)
Chercher ces logs :
- `🔴 Test Sync initialized!`
- `WebSocket connected!`
- `Joined room TEST!`

### Console Serveur
Chercher :
- `[TEST] Player X joining room TEST`
- `[TEST] Created new test room: TEST`

## 🎨 Fonctionnalités

- **Cercles colorés** : Chaque joueur a une couleur unique
- **Traînées** : Visualisation du parcours
- **Clear Trails** : Bouton pour effacer les traînées
- **FPS Counter** : En haut à gauche
- **Position** : Coordonnées actuelles
- **Logs** : En bas à droite

## ⚡ Test Rapide (30 secondes)

1. Ouvrir 2 navigateurs
2. Connect dans les deux (room TEST)
3. Bouger avec les flèches dans Browser 1
4. **Vérifier** : Est-ce que le cercle bouge dans Browser 2 ?

---

**Si les cercles bougent et se synchronisent** → Le WebSocket fonctionne !
**Si ça ne marche pas** → Le problème est dans la communication de base.