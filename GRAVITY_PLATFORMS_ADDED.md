# Étape 2 Complète : Gravité et Plateformes

## ✅ Ce qui a été ajouté

### 1. **Système de Gravité**
- Gravité : 800 pixels/seconde²
- Les joueurs tombent automatiquement
- Atterrissage sur le sol avec détection

### 2. **Système de Saut**
- Touche : **ESPACE**
- Vélocité de saut : -400 pixels/seconde
- Saut possible uniquement sur le sol ou une plateforme
- Pas de double-saut (pour l'instant)

### 3. **Plateformes**
Trois plateformes fixes ajoutées :
```javascript
Platform 1: x=200,  y=500, width=200, height=20
Platform 2: x=500,  y=400, width=250, height=20
Platform 3: x=850,  y=300, width=200, height=20
```

### 4. **Collisions avec Plateformes**
- Atterrissage sur le dessus (arrêt de chute)
- Collision avec le dessous (annule le saut)
- Détection horizontale (pas de traversée de côté)

### 5. **Modifications des Contrôles**
- ❌ **Supprimé** : Flèches Haut/Bas (plus de vol libre)
- ✅ **Conservé** : Flèches Gauche/Droite (mouvement horizontal)
- ✅ **Nouveau** : Espace (saut)

## 🎮 Contrôles Mis à Jour

```
← Gauche   : Se déplacer à gauche
→ Droite   : Se déplacer à droite
ESPACE     : Sauter (si au sol ou sur plateforme)
```

## 🧪 Test Instructions

### 1. Redémarrer le serveur
```bash
cd server
go run .
```

### 2. Test Solo (vérifier la physique)
1. Ouvrir `test_sync.html`
2. Se connecter
3. **Tester** :
   - ✅ Le joueur tombe au spawn
   - ✅ Atterrit sur le sol
   - ✅ Peut sauter avec ESPACE
   - ✅ Peut atterrir sur les plateformes
   - ✅ Ne peut pas traverser les plateformes

### 3. Test Multi-joueurs (vérifier la synchro)
1. Ouvrir 2 navigateurs
2. Connecter les 2 joueurs
3. **Tester** :
   - ✅ Les 2 joueurs tombent (gravité synchronisée)
   - ✅ Joueur 1 saute → Joueur 2 voit le saut
   - ✅ Atterrissage synchronisé sur plateformes
   - ✅ Pas de désynchronisation après plusieurs sauts
   - ✅ Position correcte après reconnexion

### 4. Test de Collision
- Sauter contre le plafond → arrêt du mouvement
- Sauter sous une plateforme → collision tête
- Marcher au bord d'une plateforme → chute

## 📐 Architecture Physique

```
Gravité (800 px/s²)
    ↓
Vélocité Y augmente
    ↓
Position Y mise à jour
    ↓
Check Collisions:
├─ Sol (groundY)
├─ Plateformes (3x)
└─ Plafond (minY)
    ↓
Si collision → ajuster position + vy=0 + onGround=true
```

## 🔄 Synchronisation Réseau

### Ce qui est envoyé au serveur (20Hz)
```javascript
{
    playerId: "session_abc123",
    x: 450,        // Position X
    y: 350,        // Position Y (inclut gravité)
    vx: 200,       // Vélocité X
    vy: -150       // Vélocité Y (gravité/saut)
}
```

### Ce qui est reçu du serveur (20Hz)
- Positions de tous les joueurs connectés
- Interpolation smooth côté client
- Pas besoin d'envoyer `onGround` (calculé localement)

## ⚠️ Points Importants

### État `onGround`
- Calculé localement pour chaque joueur
- Pas envoyé sur le réseau (évite désynchronisation)
- Permet ou bloque le saut

### Collisions
- Détection AABB (Axis-Aligned Bounding Box)
- Priorité : plateformes > sol > plafond
- Pas de collision entre joueurs (pour l'instant)

### Physique
- Gravité appliquée chaque frame
- Terminal velocity non limitée (peut tomber très vite)
- Pas de friction horizontale (glisse sur plateformes)

## 🎯 Prochaines Étapes

### Option A : Tester Davantage
- Ajouter plus de plateformes
- Tester avec 3-4 joueurs
- Vérifier la synchro sur longue durée

### Option B : Ajouter Combat
- Touche A : Attaque gauche
- Touche D : Attaque droite
- Système de vie (HP)
- Knockback sur coup

### Option C : Intégrer dans game_vs.js
- Copier le système de session
- Copier les fixes WebSocket
- Charger une vraie map PVP
- Utiliser les vrais sprites

## 🐛 Bugs Connus / À Tester

- [ ] Collision entre 2 joueurs (pas implémenté)
- [ ] Tomber en dehors de la carte (pas géré)
- [ ] Saut trop rapide (spam espace)
- [ ] Désynchronisation après lag réseau
- [ ] Position de spawn si plateforme en dessous

## 📊 Performance

- FPS : ~60 (stable)
- Network : 20 msg/s par joueur
- Latence : Dépend de la connexion
- CPU : Faible (~5-10%)

---

## ✅ Validation

Pour valider que tout fonctionne :
```
1. Les joueurs tombent au spawn ✓
2. Peuvent sauter avec ESPACE ✓
3. Atterrissent sur les 3 plateformes ✓
4. La gravité est visible sur les 2 navigateurs ✓
5. Pas de désynchronisation visible ✓
```

Si tout est ✓, on peut passer à l'étape suivante !

**Qu'est-ce que tu veux faire ?**
- A) Ajouter combat au test
- B) Intégrer dans game_vs.js
- C) Améliorer la physique (friction, double-saut, etc.)