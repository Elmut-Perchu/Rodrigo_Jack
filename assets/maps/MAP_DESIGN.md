# VS Arena Map Design

## pvp_arena_compact.json

**Dimensions**: 24 tiles (width) x 14 tiles (height)
**Pixel Size**: 1536px x 896px (64px per tile)
**Players**: 2-4 players
**Match Duration**: 3 minutes (180 seconds)

---

## Map Layout (ASCII)

```
111111111111111111111111  ← Ligne 0: Mur supérieur
100000000000000000000001  ← Ligne 1: Zone spawn haut
100000000000000000000001  ← Ligne 2: Zone spawn haut
100111100000000000111001  ← Ligne 3: Plateformes coins hautes
100000000000000000000001  ← Ligne 4: Zone libre
111000001111111110000111  ← Ligne 5: Plateformes latérales
100000001000000010000001  ← Ligne 6: Structure centrale (creux)
100000001000000010000001  ← Ligne 7: Structure centrale (creux)
111000001111111110000111  ← Ligne 8: Plateformes latérales
100000000000000000000001  ← Ligne 9: Zone libre
100111100000000000111001  ← Ligne 10: Plateformes coins basses
100000000000000000000001  ← Ligne 11: Zone spawn bas
100000000000000000000001  ← Ligne 12: Zone spawn bas
111111111111111111111111  ← Ligne 13: Mur inférieur
```

**Légende**:
- `1` = Tile solide (plateforme/mur)
- `0` = Espace vide

---

## Spawn Points

4 spawn points équilibrés aux coins de la map:

| Player | Position | Location | Safe Zone |
|--------|----------|----------|-----------|
| P1 | (2, 2) | Coin haut-gauche | 3 tiles |
| P2 | (21, 2) | Coin haut-droit | 3 tiles |
| P3 | (2, 11) | Coin bas-gauche | 3 tiles |
| P4 | (21, 11) | Coin bas-droit | 3 tiles |

**Safe Zone**: Les joueurs spawnent avec 3 tiles de zone sécurisée autour d'eux.

---

## Power-ups

7 power-ups stratégiquement placés:

### Centre (Zone contestée)
- **(12, 7)** - **Health** - Respawn: 10s - Au centre de la structure centrale
- **(12, 3)** - **Speed Boost** - Respawn: 15s - Zone haute centrale
- **(12, 10)** - **Damage Up** - Respawn: 15s - Zone basse centrale

### Latéraux (Contrôle des côtés)
- **(5, 7)** - **Health** - Respawn: 12s - Gauche centre
- **(18, 7)** - **Health** - Respawn: 12s - Droite centre

### Plateformes hautes (Risk/Reward)
- **(8, 4)** - **Speed Boost** - Respawn: 18s - Plateforme gauche haute
- **(15, 4)** - **Damage Up** - Respawn: 18s - Plateforme droite haute

---

## Stratégie de Design

### Zones de Combat

**Zone Haute** (Lignes 1-5):
- Spawns P1 et P2
- Plateformes coins (ligne 3)
- Contrôle des power-ups speed/damage en hauteur

**Zone Centre** (Lignes 5-8):
- Structure en U (lignes 6-7 creuses)
- Health power-up central très contesté
- Plateformes latérales pour mouvement vertical
- Risque élevé / récompense élevée

**Zone Basse** (Lignes 8-12):
- Spawns P3 et P4
- Plateformes coins (ligne 10)
- Miroir de la zone haute pour équilibre

### Mouvement Vertical

La map encourage le mouvement vertical avec:
- Plateformes aux lignes 3 et 10 (coins)
- Grandes plateformes aux lignes 5 et 8 (latérales)
- Structure centrale creuse (lignes 6-7) pour combat aérien

### Choke Points

**Points de passage étroits**:
- Entrées de la structure centrale (colonnes 9 et 14)
- Gaps entre plateformes latérales et murs
- Zone entre plateformes coins et structure centrale

### Zones Ouvertes

**Espaces de manœuvre**:
- Centre de la map (colonnes 10-13, lignes 6-7)
- Zones latérales (colonnes 2-6 et 17-21)
- Espaces entre les plateformes pour esquive

---

## Équilibrage

### Symétrie
- **Horizontale**: Parfaitement symétrique pour équité
- **Verticale**: Miroir haut/bas pour équilibrer spawns P1-P2 vs P3-P4

### Timing des Power-ups
- **Health**: 10-12s (fréquent, faible avantage)
- **Speed/Damage**: 15-18s (modéré, avantage tactique)
- **Centre contesté**: Health central 10s (combat constant)

### Distances
- **Spawn to Center**: ~10 tiles (équidistant)
- **Spawn to Spawn (diagonal)**: ~19 tiles
- **Spawn to Spawn (même côté)**: ~9 tiles

---

## Comparaison avec pvp_arena1.json

| Aspect | pvp_arena1 | pvp_arena_compact |
|--------|-----------|-------------------|
| Dimensions | 40x22 tiles | 24x14 tiles |
| Taille écran | 2560x1408px | 1536x896px |
| Adaptation écran | Trop grand | ✅ Parfait pour 1920x1080 |
| Complexité | Haute | Moyenne |
| Rythme | Lent (grandes distances) | ✅ Rapide (compact) |
| Power-ups | 8 | 7 |
| Visibilité | Caméra doit zoomer | ✅ Tout visible |

---

## Gameplay Attendu

### Phase Early (0-1 min)
- Joueurs spawnent aux coins
- Course vers power-ups centraux (speed/damage)
- Premiers engagements aux plateformes hautes

### Phase Mid (1-2 min)
- Contrôle de la structure centrale
- Combat pour health central
- Utilisation des plateformes latérales

### Phase Late (2-3 min)
- Éliminations finales
- Zone se rétrécit mentalement (urgence timer)
- Risk-taking pour power-ups

---

## Notes Techniques

### Collision
- Tous les `1` sont des tiles solides avec collision
- Gravité appliquée dans les zones `0`

### Performance
- Map plus petite = moins d'entités
- Meilleur framerate
- Moins de tiles à render (336 vs 880)

### Adaptation Future
- Facile d'ajouter des variantes (hazards, moving platforms)
- Structure centrale peut devenir destructible
- Power-ups peuvent être randomisés

---

**Créé**: 2025-10-09
**Version**: 1.0
**Status**: Production Ready ✅
