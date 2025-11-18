# 🧪 INSTRUCTIONS DE TEST - AUDIT WEBSOCKET

## ⚡ Test Rapide (5 minutes)

### 1. Démarrer les serveurs

**Terminal 1 - Serveur Go**:
```bash
cd server
go run .
```

**Terminal 2 - Client web**:
```bash
python3 -m http.server 8000
```

---

### 2. Ouvrir 2 navigateurs

**Navigateur 1 (Chrome)**:
1. Aller à `http://localhost:8000`
2. Cliquer "VS Mode"
3. Créer room code: **AUDIT**
4. **Ouvrir Console DevTools** (F12)
5. Cliquer Ready

**Navigateur 2 (Firefox ou autre Chrome)**:
1. Aller à `http://localhost:8000`
2. Cliquer "VS Mode"
3. Rejoindre room: **AUDIT**
4. **Ouvrir Console DevTools** (F12)
5. Cliquer Ready

---

### 3. Observer le match

**Match démarre après countdown 3-2-1-GO**

**Dans Navigateur 1**:
- Bouger avec **WASD**
- Observer console logs

**Dans Navigateur 2**:
- **OBSERVER LE MOUVEMENT** du joueur 1
- Est-ce que ça bouge fluidement?
- Ou est-ce qu'il "rattrape" par saccades?

---

### 4. Analyser les Console Logs

**Chercher ces messages**:

```
╔════════════════════════════════════════════════════════════
║ 🔍 [AUDIT] Remote Player Update - [Nom Joueur]
╠════════════════════════════════════════════════════════════
║ BEFORE Position: (X, Y)
║ SERVER Position: (X, Y)
║ Delta: (X, Y) = Distance px
║ Smoothing Factor: 0.2
║ Will Move: (X, Y)
╚════════════════════════════════════════════════════════════
```

**ET**:

```
║ ⚠️  [CONFLICT] NetworkSyncSystem updated visual.div directly!
```

**ET/OU**:

```
║ 🎨 [RENDER CONFLICT?] RenderSystem also updated visual.div!
```

---

### 5. Noter les Observations

**Questions à répondre**:

1. **Y a-t-il des logs `[CONFLICT]` ET `[RENDER CONFLICT?]` ensemble?**
   - ✅ OUI → Les deux systèmes se battent pour le visual!
   - ❌ NON → Problème ailleurs

2. **Quelle est la distance (Delta) moyenne?**
   - <20px → Bon
   - 20-50px → Retard modéré
   - >50px → Retard important (explique "catch-up")

3. **Le mouvement est-il fluide visuellement?**
   - ✅ Fluide → Pas de problème visible
   - ❌ Saccadé / "rattrapage" → Problème confirmé

4. **Update rates dans stats (toutes les 5 sec)**:
   ```
   📊 [AUDIT STATS] 5-second summary:
      - Update rate: X Hz
   ```
   - Devrait être ~60Hz pour les deux systèmes
   - Si différent → Désynchronisation

---

### 6. Sauvegarder les Résultats

**Copier-coller dans `AUDIT_WEBSOCKET_SYNC.md` section "Test 0"**:
- Logs console
- Observations visuelles
- Update rates
- Delta distance moyenne

---

## 🎯 Après le Test

**Si conflit détecté** (les deux systèmes log):
→ Appliquer **Fix #1**: Supprimer visual.div update de NetworkSyncSystem

**Si delta >30px constant**:
→ Appliquer **Fix #2**: Augmenter smoothingFactor à 0.6

**Si mouvement toujours saccadé**:
→ Tests additionnels requis (timing pipeline, rate limiting)

---

## 🚨 Problèmes Courants

### "Aucun log [AUDIT] n'apparaît"
- Vérifier que diagnostic mode = true dans les deux fichiers
- Refresh navigateurs (F5)
- Vérifier que match a démarré

### "Joueur distant n'apparaît pas"
- Problème connu (voir SIMPLIFICATION_COMPLETE.md)
- Vérifier logs serveur pour game_state_sync
- Check que les deux joueurs ont envoyé game_ready

### "Logs trop rapides, impossible de lire"
- Modifier `% 60` → `% 120` dans les fichiers (log moins souvent)
- Ou filtrer console avec "[AUDIT]"

---

## 📝 Template de Résultats

Copier dans `AUDIT_WEBSOCKET_SYNC.md`:

```markdown
### Test 0: Baseline avec Diagnostic Logging
**Date**: [Date]
**Smoothing Factor**: 0.2

**Console Logs**:
[Copier logs ici]

**Observations**:
- Mouvement fluide? [OUI/NON + Description]
- Conflit détecté? [OUI/NON + Logs]
- Delta moyen: [X]px
- Update rate NetworkSync: [X] Hz
- Update rate Render: [X] Hz

**Conclusion**:
[Hypothèse confirmée ou infirmée]
```

---

**BON TEST!** 🚀
