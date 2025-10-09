# 🔥 CLEAR ALL CACHE - CRITICAL

Le navigateur cache **3 types de fichiers différents**:
1. HTML (vs_game.html)
2. JavaScript (game_vs.js, game.js, etc.)
3. CSS et assets

Un simple "hard refresh" ne suffit PAS. Voici comment vider TOUT:

---

## Option 1: Vider le cache complet (RECOMMANDÉ)

### Firefox
1. **Ouvrir le menu**: ☰ (en haut à droite)
2. **Paramètres** → **Vie privée et sécurité**
3. **Cookies et données de sites** → **Effacer les données...**
4. **Cocher**: "Contenu web en cache"
5. **Effacer**

### Chrome
1. **Ouvrir DevTools**: F12
2. **Clic droit sur le bouton refresh** (à gauche de la barre d'adresse)
3. **Choisir**: "Vider le cache et effectuer une actualisation forcée"

OU

1. **Paramètres** → **Confidentialité et sécurité**
2. **Effacer les données de navigation**
3. **Cocher**: "Images et fichiers en cache"
4. **Période**: "Dernière heure"
5. **Effacer les données**

---

## Option 2: Mode Incognito/Privé (PLUS SIMPLE)

### Firefox
```
Ctrl + Shift + P  (Windows/Linux)
Cmd + Shift + P   (Mac)
```

### Chrome
```
Ctrl + Shift + N  (Windows/Linux)
Cmd + Shift + N   (Mac)
```

**Puis**: Aller sur `http://localhost:8000` et naviguer vers VS mode

---

## Option 3: Désactiver le cache dans DevTools

1. **Ouvrir DevTools**: F12
2. **Network tab** (Réseau)
3. **Cocher**: "Disable cache" (Désactiver le cache)
4. **GARDER DevTools OUVERT** pendant tous les tests

---

## ✅ Comment vérifier que ça marche

Après avoir vidé le cache, tu devrais voir dans les logs:

```javascript
✅ [GameVS] Mode: vs  // PAS undefined!
✅ [GameVS] Loading VS battle map...
✅ GET http://localhost:8000/assets/maps/pvp_arena1.json  // PAS views/assets!
✅ [NicknameRenderSystem] Canvas setup successful  // PAS "Canvas not found"!
```

---

## 🚨 Si ça ne marche TOUJOURS pas

**Dernier recours**: Redémarrer le serveur HTTP

```bash
# Arrêter le serveur (Ctrl+C dans le terminal)
# Puis relancer:
python3 -m http.server 8000
```

Et redémarrer le serveur Go:
```bash
cd server
go run .
```

---

## 📝 Fichiers à recharger

Ces fichiers DOIVENT être rechargés depuis le disque:

- ✅ `views/vs_game.html` (canvas ajouté ligne 250)
- ✅ `game_vs.js` (pendingRoomState ligne 29)
- ✅ `game.js` (mode parameter ligne 35)
- ✅ `core/components/animation_component.js` (basePath ligne 164)
- ✅ `create/tile_create.js` (basePath ligne 22)
- ✅ `core/map_loader.js` (basePath ligne 106)

**Tous ces fichiers sont dans le cache actuellement!**
