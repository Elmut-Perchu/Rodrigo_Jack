# Adventure Mode - Paramètres de Référence

**Document de référence pour adapter le mode Adventure au mode VS**

Date: 2025-01-18
Source: Extraction du code Adventure existant

---

## 🎮 Paramètres Physiques (Physics)

### Gravité
**Fichier**: `core/systems/gravity_system.js`
```javascript
gravity = 1000; // pixels per second²
```
- **Application**: `velocity.vy -= this.gravity * deltaTime`
- **Direction**: Vers le bas (négatif sur l'axe Y)
- **Type**: Constante (pas de terminal velocity définie)

### Mouvement
**Fichier**: `core/systems/movement_system.js`
```javascript
// Position update
position.x += velocity.vx * deltaTime;
position.y -= velocity.vy * deltaTime; // NOTE: Y inversé (- pour descendre)
```

### Knockback Damping
**Fichier**: `core/systems/movement_system.js`
```javascript
// Amortissement pendant knockback
velocity.vx *= 0.95;
velocity.vy *= 0.95;
```

---

## 👤 Paramètres du Joueur (Player)

### Création du Joueur
**Fichier**: `create/player_create.js`

#### Dimensions
```javascript
width = 110;  // pixels
height = 110; // pixels
```

#### Propriétés (Property Component)
```javascript
movable = true;
speed = 450;           // pixels per second (vitesse horizontale)
solid = false;
jumpStrength = 425;    // pixels per second (vélocité verticale initiale)
applyGravity = true;
```

#### Santé
```javascript
health = 3; // 3 vies (correspond au bomberman: 3 vies)
```

#### Hitbox Circulaire
```javascript
offsetX = 0;            // Décalage horizontal depuis coin supérieur gauche
offsetY = 24;           // Décalage vertical
terrainRadius = 26;     // Rayon de collision avec terrain
meleeRadius = 60;       // Rayon des attaques corps à corps
rangedRadius = 300;     // Rayon des attaques à distance
```

---

## ⌨️ Contrôles (Input)

Les touches sont communes aux deux modes et définies une seule fois dans
`constants/controls.js`. Adventure et l'arène les lisent toutes les deux :
un seul personnage, une seule paire de mains, une seule disposition.

### Touches de Mouvement
**Fichier**: `constants/controls.js`, lu par `core/components/input_component.js`
```javascript
ArrowLeft  | 'q' → vector.h = -1  // Gauche
ArrowRight | 'd' → vector.h = 1   // Droite
' '              → jump++         // Saut (max 2 sauts: double jump)
```

Haut et bas ne servent à rien en Adventure (il n'y a rien à viser) et restent
volontairement libres plutôt que de doubler la touche de saut : une habitude
qui marche dans un mode et pas dans l'autre est pire que pas d'habitude.

### Touches d'Action
```javascript
'x' → attack1 | attack2 | attack3  // Épée : une touche, trois coups enchaînés
'c' → magicAttack
'w' → arrowShoot (tir à l'arc)
'n' → roll (roulade) — Adventure uniquement pour l'instant
```

L'épée avait une touche par coup. Elle n'en a plus qu'une, et les coups
s'enchaînent dans l'ordre de `SWING_CYCLE` (`constants/vs_combat_constants.js`)
comme dans l'arène : les trois animations restent atteignables, la variété
vient de rester à l'attaque. Rompre plus de `COMBO_RESET_MS` recommence la
chaîne.

### Système de Saut
**Fichier**: `core/components/input_component.js`, `core/systems/input_system.js`
```javascript
jump < 2              // Max 2 sauts (double jump)
jumpPressed = false   // Flag pour empêcher spam
```

**Application du Saut**:
```javascript
if (input.vector.v > 0) {
    input.vector.v = 0;
    property.isOnGround = false;
    velocity.vy = property.jumpStrength; // 425 px/s
}
```

---

## 🎯 Système de Collision (Collision)

### Détection de Sol (Ground Detection)
**Fichier**: `core/systems/collision_system.js`
```javascript
// Quand collision verticale vers le bas
if (normalY < 0) {
    property.isOnGround = true;
    if (input) input.jump = 0; // Reset jump counter
}
velocity.vy = 0;
```

### Collisions Circulaires avec Tiles
**Méthode**: AABB vs Circle (Axis-Aligned Bounding Box vs Cercle)

```javascript
// 1. Trouver le point le plus proche du rectangle
closestPoint = {
    x: Math.max(rect.left, Math.min(circleCenter.x, rect.right)),
    y: Math.max(rect.top, Math.min(circleCenter.y, rect.bottom))
};

// 2. Calculer distance
dx = circleCenter.x - closestPoint.x;
dy = circleCenter.y - closestPoint.y;
distance = Math.sqrt(dx * dx + dy * dy);

// 3. Si collision (distance < radius)
if (distance < circleRadius) {
    overlap = circleRadius - distance;
    normalX = dx / distance;
    normalY = dy / distance;

    // Résolution collision horizontale
    if (Math.abs(normalX) > 0.7) {
        velocity.vx = 0;
        position.x += normalX * overlap;
    }

    // Résolution collision verticale
    if (Math.abs(normalY) > 0.7) {
        velocity.vy = 0;
        position.y += normalY * overlap;
    }
}
```

### Seuil de Normalisation
```javascript
// 0.7 = ~45 degrés
// Collision considérée horizontale si |normalX| > 0.7
// Collision considérée verticale si |normalY| > 0.7
```

---

## 📊 Comparaison: Adventure vs Test Framework Actuel

| Paramètre | Adventure | Test Framework | Status |
|-----------|-----------|----------------|--------|
| **Gravité** | 1000 px/s² | 800 px/s² | ⚠️ Différent |
| **Vitesse déplacement** | 450 px/s | 200 px/s | ⚠️ Différent |
| **Force de saut** | 425 px/s | -400 px/s | ⚠️ Différent (signe opposé) |
| **Double jump** | ✅ Oui (max 2) | ❌ Non (1 saut) | ⚠️ Manquant |
| **Player width** | 110 px | 40 px (radius 20) | ⚠️ Très différent |
| **Player height** | 110 px | 40 px (radius 20) | ⚠️ Très différent |
| **Hitbox type** | Circle | Circle | ✅ Identique |
| **Terrain radius** | 26 px | 20 px | ⚠️ Différent |
| **Détection sol** | isOnGround | onGround | ✅ Équivalent |
| **Knockback damping** | 0.95 | ❌ Non | ⚠️ Manquant |
| **Friction** | ❌ Non (instant stop) | ❌ Non | ✅ Identique |

---

## 🎯 Adaptations Nécessaires pour VS Mode

### 1. **Paramètres Physiques** ✅ À adapter
```javascript
// Test actuel
GRAVITY = 800;
PLAYER_SPEED = 200;
JUMP_VELOCITY = -400;

// À remplacer par Adventure
GRAVITY = 1000;
PLAYER_SPEED = 450;
JUMP_VELOCITY = 425; // Attention: signe positif en Adventure
```

### 2. **Dimensions du Joueur** ✅ À adapter
```javascript
// Test actuel
PLAYER_RADIUS = 20; // → diameter = 40px

// À remplacer par Adventure
PLAYER_WIDTH = 110;
PLAYER_HEIGHT = 110;
TERRAIN_RADIUS = 26; // Pour collision circulaire
```

### 3. **Double Jump** ✅ À implémenter
```javascript
// Adventure: max 2 sauts
if (input.jump < 2 && !input.jumpPressed) {
    input.jump++;
    input.jumpPressed = true;
    velocity.vy = jumpStrength;
}
```

### 4. **Contrôles** ⚠️ Déjà correct (flèches + espace)
Le test framework utilise déjà:
- `ArrowLeft` / `ArrowRight` pour mouvement horizontal
- `SPACE` pour saut

**Note**: En mode VS, on n'a besoin que de ces touches. Pas besoin de roulade, tir à l'arc, attaques corps à corps (ces mécaniques sont pour Adventure).

### 5. **Système de Signe Y** ⚠️ CRITIQUE
**Adventure**:
```javascript
position.y -= velocity.vy * deltaTime; // Y inversé
velocity.vy -= gravity * deltaTime;     // Gravité négative
jumpStrength = 425;                     // Saut positif
```

**Test actuel**:
```javascript
position.y += velocity.vy * deltaTime; // Y normal
velocity.vy -= gravity * deltaTime;     // Gravité négative
jumpStrength = -400;                    // Saut négatif
```

**Conclusion**: Les deux systèmes sont cohérents dans leur logique interne. Garder celui du test actuel (Y normal) est OK, mais adapter les valeurs numériques.

---

## 🚀 Recommandations

### Option A: Adapter valeurs numériques seulement (Rapide)
- Changer gravité: 800 → 1000
- Changer vitesse: 200 → 450
- Changer saut: -400 → -425 (garder signe du test)
- Changer radius: 20 → 26
- Ajouter double jump

**Avantages**: Rapide, garde la logique Y du test
**Inconvénients**: Légère différence de "feeling" vs Adventure

### Option B: Copier système Adventure complet (Long)
- Copier gravity_system.js
- Copier movement_system.js
- Copier collision_system.js
- Adapter pour réseau VS

**Avantages**: Feeling identique à Adventure
**Inconvénients**: Risque de casser la synchro réseau actuelle

### Option C: Hybride (Recommandé) ⭐
- **Garder**: Logique Y du test (plus simple)
- **Adapter**: Valeurs numériques Adventure
- **Ajouter**: Double jump
- **Ajuster**: Dimensions joueur (radius 55 pour width 110)

**Avantages**: Meilleur des deux mondes
**Inconvénients**: Nécessite tests pour valider le feeling

---

## 📋 Checklist d'Adaptation

### Phase 2: Adapter Paramètres dans test_sync.js
- [ ] Changer `GRAVITY = 800` → `GRAVITY = 1000`
- [ ] Changer `PLAYER_SPEED = 200` → `PLAYER_SPEED = 450`
- [ ] Changer `JUMP_VELOCITY = -400` → `JUMP_VELOCITY = -425`
- [ ] Changer `PLAYER_RADIUS = 20` → `PLAYER_RADIUS = 55` (pour width 110)
- [ ] Implémenter double jump (max 2 sauts)
- [ ] Ajouter knockback damping si nécessaire

### Phase 3: Tester Feeling
- [ ] Comparer mouvement Adventure vs VS
- [ ] Comparer saut Adventure vs VS
- [ ] Vérifier fluidité réseau avec nouveaux paramètres
- [ ] Ajuster si nécessaire

### Phase 4: Combat Bomberman
- [ ] Système de bombes (pose, explosion, timer)
- [ ] Système de vies (3 vies comme Adventure)
- [ ] Power-ups (Speed, Bombs, Flames)
- [ ] Détection mort par explosion

---

## Notes Importantes

1. **Synchro Réseau**: Les nouveaux paramètres doivent être identiques côté client et serveur
2. **Performance**: Tester avec 4 joueurs pour s'assurer que ça tourne à 60 FPS
3. **Hitbox**: Adventure utilise une hitbox circulaire (comme le test) - bon pour bomberman
4. **Camera**: Adventure utilise following camera, VS doit utiliser static camera (déjà fait)
5. **Map**: VS utilisera des maps PVP dédiées (pvp_*.json), pas les maps Adventure

---

## Fichiers de Référence

**Adventure (à consulter)**:
- `core/systems/gravity_system.js` - Gravité
- `core/systems/movement_system.js` - Mouvement
- `core/systems/input_system.js` - Application des inputs
- `core/systems/collision_system.js` - Collisions
- `create/player_create.js` - Création joueur
- `core/components/property_component.js` - Propriétés physiques
- `core/components/input_component.js` - Gestion inputs

**VS Test (à modifier)**:
- `test_sync.js` - Framework de test VS actuel
- `server/test_handler.go` - Serveur Go (synchro réseau)

---

**Prochaine étape**: Phase 2 - Adaptation des paramètres dans `test_sync.js`
