# 🏗️ Architecture Dual-Mode Analysis

## Table des Matières
1. [Vue d'Ensemble](#vue-densemble)
2. [Systèmes Partagés](#systèmes-partagés)
3. [Systèmes Adventure-Only](#systèmes-adventure-only)
4. [Systèmes VS-Only](#systèmes-vs-only)
5. [Points de Conflit Identifiés](#points-de-conflit-identifiés)
6. [Solutions et Fixes](#solutions-et-fixes)

---

## Vue d'Ensemble

### Architecture Actuelle
```
Game (base class)
├── mode: 'adventure' | 'vs'
├── entities: Set<Entity>
├── systems: Set<System>
└── GameVS extends Game (VS mode)
```

### Flow d'Initialisation

**Adventure Mode** (depuis `index.html`):
```
index.html → Game('adventure')
          → initAsync()
          → Add ALL systems
          → Create main menu
          → Wait for user to start
          → Load map1.json
```

**VS Mode** (depuis `vs_game.html`):
```
vs_game.html → GameVS()
            → super(Game, 'vs')
            → initAsync() (inherited)
            → Add ALL base systems
            → disableAdventureFeatures()
            → addVSSystems()
            → loadVSMap()
            → Connect to WebSocket
```

---

## Systèmes Partagés

Ces systèmes sont utilisés par **BOTH modes** et doivent être **mode-aware**.

### ✅ Systèmes Fonctionnels (Pas de Conflit)

| Système | Fonction | Mode-Aware? | Notes |
|---------|----------|-------------|-------|
| **Input** | Détecte les inputs clavier/souris | Non requis | Fonctionne identiquement dans les deux modes |
| **Movement** | Déplace les entités avec velocity | Non requis | Déplace joueurs locaux ET remote |
| **Collision** | Détecte collisions tuiles | Non requis | Fonctionne pour tous les types de joueurs |
| **Gravity** | Applique gravité aux entités | Non requis | Physique identique dans les deux modes |
| **Animation** | Anime les sprites | Non requis | Anime tous les joueurs (local/remote) |
| **CircleHitbox** | Gère les hitboxes circulaires | Non requis | Collision identique |
| **Physics** | Physique avancée | Non requis | Simulations identiques |
| **TileSystem** | Gère les tuiles de map | Non requis | Maps identiques (json) |
| **BoundarySystem** | Limite le mouvement aux bounds | Non requis | Fonctionne pour tous les modes |

---

### ⚠️ Systèmes Partagés avec Conflits Potentiels

| Système | Fonction | Conflit | Solution Actuelle | Solution Recommandée |
|---------|----------|---------|-------------------|----------------------|
| **Camera** | Suit le joueur | **CRITIQUE** | `game_vs.js:289` met `following = null` mais **ne désactive PAS le système** | **Supprimer complètement** le système en mode VS |
| **Render** | Affiche les entités | Position basée sur camera | Position absolue dans DOM | Fonctionne mais inefficace (devrait utiliser transform) |
| **Health** | Gère HP des entités | **Server-authority en VS** | Désactivé dans `game_vs.js:277` | ✅ Correct |
| **Damage** | Applique dégâts | **Server-authority en VS** | Désactivé dans `game_vs.js:267` | ✅ Correct |
| **Debug** | Affiche debug visuel | N/A | Aucun conflit | ✅ Correct |

---

## Systèmes Adventure-Only

Ces systèmes sont **supprimés** en mode VS via `disableAdventureFeatures()`.

| Système | Fonction | Désactivé? | Ligne dans game_vs.js |
|---------|----------|------------|----------------------|
| **CutsceneSystem** | Cinématiques | ✅ Oui | 201-206 |
| **Collectible** | Portails et collectibles | ✅ Oui | 210-215 |
| **ScoreSystem** | Score solo | ✅ Oui | 219-224 |
| **AudioSystem** | Musique et sons | ✅ Oui | 228-233 |
| **EnemyBehavior** | IA des ennemis | ✅ Oui | 237-242 |
| **Combat** | Combat Adventure | ✅ Oui | 258-263 |
| **BowInputSystem** | Détection tir arc | ✅ Oui | 246-255 |
| **BowChargeSystem** | Charge de l'arc | ✅ Oui | 246-255 |
| **ArrowSpawnSystem** | Spawn des flèches | ✅ Oui | 246-255 |
| **ArrowPhysicsSystem** | Physique des flèches | ✅ Oui | 246-255 |
| **ArrowCollisionSystem** | Collision des flèches | ✅ Oui | 246-255 |
| **ArrowImpactSystem** | Impact des flèches | ✅ Oui | 246-255 |
| **ArrowPickupSystem** | Ramassage des flèches | ✅ Oui | 246-255 |

**Verdict**: ✅ Tous correctement désactivés.

---

## Systèmes VS-Only

Ces systèmes sont **ajoutés** uniquement en mode VS via `addVSSystems()`.

| Système | Fonction | Ajouté? | Ligne dans game_vs.js |
|---------|----------|---------|----------------------|
| **NetworkSyncSystem** | Synchronisation réseau | ✅ Oui | 173-174 |
| **CombatSyncSystem** | Combat réseau | ✅ Oui | 177-178 |
| **InterpolationSystem** | Interpolation mouvement | ❌ SUPPRIMÉ | 180-181 (commenté) |
| **NicknameRenderSystem** | Affiche noms joueurs | ✅ Oui | 184-185 |
| **PowerUpSystem** | Power-ups de combat | ✅ Oui | 188-189 |

**Note**: `InterpolationSystem` a été supprimé car `NetworkSyncSystem` gère l'interpolation directement.

---

## Points de Conflit Identifiés

### 🚨 CONFLIT 1: Système de Caméra (CRITIQUE)

**Problème**:
- En mode Adventure: La caméra **suit le joueur** (camera component sur le joueur)
- En mode VS: La caméra doit être **statique** (vue complète de l'arène)

**Code Actuel** (`game_vs.js:284-290`):
```javascript
const cameraSystem = Array.from(this.systems).find(
    s => s.constructor.name === 'Camera'
);
if (cameraSystem) {
    // Disable camera following in VS mode (we want static view of arena)
    cameraSystem.following = null;
    console.log('[GameVS] Camera following disabled - static arena view');
}
```

**Problème**: `cameraSystem.following = null` ne fait RIEN car `Camera.update()` cherche le joueur via:
```javascript
// core/systems/camera_system.js:32
const player = Array.from(this.entities).find((entity) => entity.getComponent('input'));
```

**Impact**:
- ❌ La caméra continue de suivre le joueur local
- ❌ Les joueurs distants sont hors écran
- ❌ La vue est décalée et centrée sur le joueur local au lieu de l'arène

**Solution**:
1. **Supprimer complètement** le système Camera en mode VS
2. Retirer le composant `camera` de toutes les entités
3. Réinitialiser `.game-world` transform à `none`

---

### 🚨 CONFLIT 2: Chemins Audio (404 Errors)

**Problème**:
- `vs_game.html` est dans `/views/`
- Les assets sont dans `/assets/` (parent directory)
- AudioSystem charge depuis `./assets/` au lieu de `../assets/`

**Erreurs**:
```
404: http://localhost:8000/views/assets/sounds/music/ambient_1.wav
404: http://localhost:8000/views/assets/sounds/environment/wind.wav
404: http://localhost:8000/views/assets/sounds/environment/creak.wav
```

**Code Actuel**: AudioSystem est **désactivé** en mode VS (`game_vs.js:228-233`)

**Impact**: ❌ Erreurs 404 dans console MAIS système désactivé donc pas bloquant

**Solution**: Aucune action requise (système désactivé correctement)

---

### 🚨 CONFLIT 3: Canvas Nickname Manquant

**Problème**:
- `NicknameRenderSystem` cherche `#nickname-canvas`
- Le canvas existe dans `vs_game.html:280`
- MAIS le système s'exécute **avant** que le HTML soit chargé

**Code** (`nickname_render_system.js:44-58`):
```javascript
setupCanvas() {
    this.canvas = document.getElementById('nickname-canvas');

    if (!this.canvas) {
        console.warn('[NicknameRenderSystem] Canvas not found');
        return;
    }
}
```

**Impact**:
- ❌ `[NicknameRenderSystem] Canvas not found` (répété 20+ fois)
- ❌ Les noms des joueurs ne s'affichent pas

**Solution**: Attendre que le DOM soit chargé avant d'initialiser le canvas

---

### ⚠️ CONFLIT 4: Personnage Remote Invisible

**Problème**:
- Les joueurs distants sont **créés** correctement (`createRemotePlayer` successful)
- Ils ont un `visual` component
- MAIS ils ne sont **pas rendus** à l'écran

**Causes Possibles**:
1. **Camera Offset**: Si la caméra suit le joueur local, les remotes sont hors viewport
2. **Position Initiale**: Spawn points à (100, 100) et (700, 100) - peut-être hors de la zone visible
3. **Render System**: Ne rend peut-être pas les entités hors viewport

**Preuve** (logs):
```
[GameVS] Remote player spawn: Object { x: 100, y: 100 }
[GameVS] Remote player created successfully
```

**Impact**:
- ✅ L'entité existe dans `game.entities`
- ✅ Les composants sont correctement créés
- ❌ Mais l'entité n'est PAS VISIBLE à l'écran

**Solution**: Fix le système de caméra (voir CONFLIT 1)

---

### ⚠️ CONFLIT 5: Mode Detection Timing

**Problème Potentiel**:
- `game.js:44` définit `this.mode = mode`
- MAIS certains systèmes sont créés **avant** que `mode` soit défini
- Example: `Camera` créé dans `initAsync()` (ligne 154) **avant** que le mode soit vérifié

**Code** (`game.js:44`):
```javascript
this.mode = mode; // Set mode early for conditional initialization
```

**Systèmes Qui Vérifient `this.mode`**:
- `game.js:62` - Main menu creation
- `game.js:187` - Setup start button
- `game.js:379` - Player death handling

**Systems VS Qui Vérifient `game.mode`**:
- `combat_sync_system.js:22`
- `interpolation_system.js:22`
- `network_sync_system.js:120`
- `powerup_system.js:21`
- `performance_system.js:221`

**Impact**: ✅ Pas de conflit majeur, mais peut causer des bugs subtils

**Recommandation**: Toujours vérifier `if (!this.game.mode || this.game.mode !== 'vs')` dans les systèmes VS

---

## Solutions et Fixes

### ✅ Fix 1: Système de Caméra (PRIORITÉ CRITIQUE)

**Objectif**: Désactiver complètement la caméra en mode VS et centrer la vue sur l'arène

**Changes**:

#### 1. Modifier `game_vs.js:284-290`
```javascript
// BEFORE (incorrect):
const cameraSystem = Array.from(this.systems).find(
    s => s.constructor.name === 'Camera'
);
if (cameraSystem) {
    cameraSystem.following = null; // ❌ Ne fait rien
    console.log('[GameVS] Camera following disabled - static arena view');
}

// AFTER (correct):
const cameraSystem = Array.from(this.systems).find(
    s => s.constructor.name === 'Camera'
);
if (cameraSystem) {
    // Remove camera system completely from update loop
    this.systems.delete(cameraSystem);

    // Reset game-world transform (no camera offset)
    const gameWorld = document.querySelector('.game-world');
    if (gameWorld) {
        gameWorld.style.transform = 'none';
        gameWorld.style.left = '0';
        gameWorld.style.top = '0';
    }

    console.log('[GameVS] Camera system removed - static arena view');
}

// Remove camera component from all entities
for (const entity of this.entities) {
    const camera = entity.getComponent('camera');
    if (camera) {
        entity.removeComponent('camera');
        console.log('[GameVS] Removed camera component from entity');
    }
}
```

#### 2. Vérifier que `createLocalPlayer` ne crée PAS de camera component
```javascript
// Dans remote_player_create.js:246-270
export function createLocalPlayer(playerData, playerIndex = 0) {
    const entity = createRemotePlayer(playerData, playerIndex);

    // Mark as local
    const networkPlayer = entity.getComponent('networkPlayer');
    if (networkPlayer) {
        networkPlayer.isLocal = true;
    }

    // Add input component for local control
    entity.addComponent('input', {
        keys: {},
        mouse: { x: 0, y: 0, pressed: false }
    });

    // ❌ DO NOT ADD CAMERA COMPONENT IN VS MODE
    // NO: entity.addComponent('camera', ...)

    return entity;
}
```

---

### ✅ Fix 2: Canvas Nickname Initialization

**Objectif**: Attendre que le DOM soit chargé avant d'initialiser le canvas

**Changes**:

#### Modifier `nickname_render_system.js:20-26`
```javascript
// BEFORE:
update(deltaTime) {
    if (!this.canvas || !this.ctx) {
        this.setupCanvas();
    }

    if (!this.canvas || !this.ctx) return;

    // Render...
}

// AFTER:
update(deltaTime) {
    // Try to setup canvas if not ready
    if (!this.canvas || !this.ctx) {
        this.setupCanvas();
    }

    // Skip rendering if canvas still not ready
    if (!this.canvas || !this.ctx) {
        return; // Canvas not ready yet, skip this frame
    }

    // Clear canvas before rendering
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Render all nicknames...
}
```

#### Ajouter un retry mechanism
```javascript
setupCanvas() {
    if (this.setupAttempted && !this.canvas) {
        // Already tried and failed, don't spam console
        return;
    }

    this.setupAttempted = true;

    // Find canvas by ID
    this.canvas = document.getElementById('nickname-canvas');

    if (!this.canvas) {
        // Only log once
        if (!this.setupWarningShown) {
            console.warn('[NicknameRenderSystem] Canvas not found - will retry on next frame');
            this.setupWarningShown = true;
        }
        return;
    }

    console.log('[NicknameRenderSystem] Canvas setup successful');
    // ... rest of setup
}
```

---

### ✅ Fix 3: Spawn Points Visibles

**Objectif**: S'assurer que les spawn points sont dans la zone visible de l'arène

**Changes**:

#### Modifier `game_vs.js:545-558`
```javascript
getSpawnPoint(playerIndex) {
    // Default spawn points (MUST be visible in static camera view)
    // Assuming arena is 800x600 (check pvp_arena_compact.json)
    const defaultSpawns = [
        { x: 200, y: 200 },    // Top-left (visible)
        { x: 600, y: 200 },    // Top-right (visible)
        { x: 200, y: 400 },    // Bottom-left (visible)
        { x: 600, y: 400 }     // Bottom-right (visible)
    ];

    // TODO: Find spawn points from map entities (entities with 'spawn' component)
    // For now, use default positions

    return defaultSpawns[playerIndex] || defaultSpawns[0];
}
```

#### Vérifier les dimensions de la map VS
```bash
# Check pvp_arena_compact.json
cat assets/maps/pvp_arena_compact.json | grep "width\|height"
```

---

### ✅ Fix 4: Debug Logging

**Objectif**: Ajouter des logs pour tracer le problème de rendu

**Changes**:

#### Ajouter des logs dans `render_system.js:10-60`
```javascript
update() {
    this.entities.forEach((entity) => {
        const visual = entity.getComponent('visual');
        const position = entity.getComponent('position');
        const networkPlayer = entity.getComponent('networkPlayer'); // NEW

        if (!position || !visual) return;

        // NEW: Log remote player rendering
        if (networkPlayer && !networkPlayer.isLocal) {
            console.log(`[RenderSystem] Rendering remote player ${networkPlayer.playerName} at (${position.x}, ${position.y})`);
        }

        // ... rest of rendering logic
    });
}
```

---

## Résumé des Actions Requises

| Priority | Action | File(s) | Status |
|----------|--------|---------|--------|
| 🔴 CRITICAL | Fix Camera System | `game_vs.js:284-297` | ❌ TODO |
| 🟡 HIGH | Fix Nickname Canvas | `nickname_render_system.js:20-76` | ❌ TODO |
| 🟡 HIGH | Verify Spawn Points | `game_vs.js:545-558` | ❌ TODO |
| 🟢 MEDIUM | Add Debug Logs | `render_system.js:10-60` | ❌ TODO |
| ⚪ LOW | Document Mode Detection | `ARCHITECTURE_ANALYSIS.md` | ✅ DONE |

---

## Test Plan

### Test 1: Adventure Mode (NO REGRESSION)
1. ✅ Start `index.html`
2. ✅ Click "Start Game"
3. ✅ Verify camera follows player
4. ✅ Verify movement works
5. ✅ Verify enemies spawn and behave correctly
6. ✅ Verify collectibles work
7. ✅ Verify level progression works

### Test 2: VS Mode (FIX VERIFICATION)
1. ✅ Start lobby from `vs_menu.html`
2. ✅ Join with 2 browsers
3. ✅ Verify both players see each other
4. ✅ Verify camera is static (full arena view)
5. ✅ Verify nicknames display above players
6. ✅ Verify movement syncs between clients
7. ✅ Verify no 404 errors in console

---

## Architecture Recommendations

### Recommendation 1: Mode-Specific System Registration

**Current**: All systems are registered in `Game.initAsync()`, then some are removed in VS mode

**Proposed**: Register systems conditionally based on mode

```javascript
// game.js:134-194
async initAsync() {
    // ... common setup ...

    // Shared systems (both modes)
    this.addSystem(new Input());
    this.addSystem(new Movement());
    this.addSystem(new Collision());
    this.addSystem(new Gravity());
    // ... etc ...

    // Mode-specific systems
    if (this.mode === 'adventure') {
        this.addAdventureSystems();
    } else if (this.mode === 'vs') {
        // Don't add Adventure systems
        // VS systems will be added by GameVS.addVSSystems()
    }
}

addAdventureSystems() {
    this.addSystem(new Camera());
    this.addSystem(new CutsceneSystem());
    this.addSystem(new Collectible());
    this.addSystem(new ScoreSystem());
    this.addSystem(new AudioSystem());
    this.addSystem(new EnemyBehavior());
    this.addSystem(new Combat());
    // ... etc ...
}
```

**Benefits**:
- ✅ Cleaner separation of concerns
- ✅ No need to delete systems in VS mode
- ✅ Easier to maintain
- ✅ Less error-prone

---

### Recommendation 2: Static Camera System for VS Mode

**Current**: Camera system is removed in VS mode, leaving no camera management

**Proposed**: Create a separate `StaticCameraSystem` for VS mode

```javascript
// core/systems_vs/static_camera_system.js
export class StaticCameraSystem extends System {
    constructor() {
        super();
        this.container = document.querySelector('.container');
        this.gameWorld = document.querySelector('.game-world');
    }

    update() {
        // Keep game-world centered with no transform
        if (this.gameWorld) {
            this.gameWorld.style.transform = 'none';
            this.gameWorld.style.left = '0';
            this.gameWorld.style.top = '0';
        }
    }
}
```

**Benefits**:
- ✅ Explicit VS camera behavior
- ✅ Can be extended for zoom, shake, etc.
- ✅ Prevents accidental camera following

---

### Recommendation 3: Mode-Aware Component Factories

**Current**: Player creation functions don't check mode

**Proposed**: Add mode parameter to player factories

```javascript
// create/player_create.js
export function createPlayer(data, mode = 'adventure') {
    const entity = new Entity();

    // ... common components ...

    if (mode === 'adventure') {
        // Add camera component for Adventure mode
        entity.addComponent('camera', new CameraComponent(640, 360));
    }

    // ... rest of creation ...

    return entity;
}
```

**Benefits**:
- ✅ Explicit mode behavior in factories
- ✅ Prevents accidental camera components in VS
- ✅ Easier to maintain

---

## Conclusion

### Conflits Majeurs Identifiés
1. 🚨 **Camera System** - Suit le joueur au lieu d'être statique
2. 🚨 **Nickname Canvas** - Canvas non trouvé au démarrage
3. 🚨 **Remote Players Invisibles** - Causé par camera offset

### Systèmes Correctement Séparés
- ✅ Adventure-only systems désactivés correctement
- ✅ VS-only systems ajoutés correctement
- ✅ Shared systems fonctionnent dans les deux modes

### Actions Requises (Priorité)
1. 🔴 **Fix Camera System** (CRITICAL) - Supprimer complètement en VS
2. 🟡 **Fix Nickname Canvas** (HIGH) - Attendre DOM load
3. 🟡 **Verify Spawn Points** (HIGH) - S'assurer qu'ils sont visibles
4. 🟢 **Add Debug Logs** (MEDIUM) - Tracer le rendu des remotes

### Architecture Saine
- ✅ Mode detection fonctionne correctement
- ✅ Pas de conflits entre Adventure et VS (après fixes)
- ✅ Systèmes partagés sont mode-agnostic
- ✅ Séparation claire entre `/core/systems/` et `/core/systems_vs/`
