# 🧠 RÈGLES DE CODAGE POUR CLAUDE CODE

> Ce document définit les principes à suivre systématiquement lors de la génération de code, quel que soit le projet ou le langage.  
> Objectif : produire un code **simple, efficace, moderne**, lisible et facile à maintenir.

---

## ✅ PRINCIPES GÉNÉRAUX À TOUJOURS RESPECTER

### 1. 🎯 Simplicité avant tout
- Priorise la solution **la plus simple possible** qui fonctionne.
- Supprime tout code inutile ou prématurément abstrait.

### 2. 🧱 Lisibilité maximale
- Noms explicites (fonctions, variables, classes).
- Indentation propre, commentaires utiles, pas de "raccourcis magiques".
- Le code doit être compréhensible **sans documentation**.

### 3. ♻️ DRY – Don’t Repeat Yourself
- Aucun code ou logique dupliquée.
- Extraire les patterns communs dans des fonctions réutilisables.

### 4. 📦 Modularité
- Diviser en modules ou composants.
- Chaque fonction/module doit avoir **une seule responsabilité claire** (SRP – Single Responsibility Principle).

### 5. 🧪 Testabilité
- Favoriser les fonctions **pures** et indépendantes du contexte global.
- Pas d'effet de bord implicite.

### 6. 🧼 Clean Code
- Pas de code commenté mort.  
- Pas de variables temporaires inutiles.
- Pas de console.log oubliés en production.

### 7. 🚦 KISS – Keep It Simple, Stupid
- Code le plus direct possible, même s’il est un peu plus long.
- Évite les "hacks intelligents" illisibles.

### 8. 🛑 YAGNI – You Ain’t Gonna Need It
- Ne pas ajouter de fonctionnalités, d’abstractions ou d’options "au cas où".

### 9. 📚 Séparation des responsabilités (SOC)
- Séparer la logique métier, l’UI, les données, les animations, etc.

### 10. ⚡ Performance sans complexité
- Optimise **si nécessaire**, sans rendre le code illisible.
- Évite les recalculs, boucles inutiles, manipulations DOM coûteuses.

---

## 🔐 GESTION DES BORDURES, RENDUS ET COLLISIONS

### 11. 🧩 Trouver la solution la plus adaptée et moderne
- Utiliser des **solutions modernes, natives ou légères**, adaptées au contexte.
- Préférer les API stables et reconnues (IntersectionObserver, GSAP plugins, Motion One...).
- Réduire les effets de bord non prévisibles.

### 12. 🧃 Maîtrise des zones à risques ("bords logiques")
Claude doit porter une attention **particulière aux éléments suivants** :

#### 🌀 Boucles
- Éviter les boucles inutiles ou imbriquées, surtout dans les `render()`, `animationFrame`, ou events DOM.
- Favoriser `map`, `filter`, `reduce` si la logique est simple.
- Utiliser `throttle` ou `debounce` pour tous les événements fréquents (`scroll`, `resize`, `mousemove`, etc.).

#### 🔄 Rendus (React, Vue, etc.)
- Ne jamais déclencher d'effets secondaires dans un render.
- Toute animation, DOM access ou logique asynchrone doit être déclenchée via `useEffect`, lifecycle hooks ou gestion propre.
- Nettoyage systématique des effets (`return () => ...`).

#### 🎯 Collisions
- Éviter les noms globaux ambigus (`.active`, `toggle()`, `state`, etc.).
- Préférer les noms "scopés" et clairs (`.menu--open`, `handleMenuToggle()`).
- Éviter les conflits de logique : une animation ou un effet ne doit **jamais impacter un autre composant de façon implicite**.

#### 🧹 Exemples à éviter
- Plusieurs scroll listeners déclenchés sur le même container.
- GSAP timelines créées dans une boucle sans `kill()` ou `context`.
- Variables redéclarées dans des closures ou callbacks async.

---

## ⚙️ STANDARDS TECHNIQUES À SUIVRE

> Claude doit **s’adapter à la stack utilisée** dans le projet (React, Next.js, Astro, Vanilla, Tailwind, etc.) tout en suivant des principes modernes, performants et maintenables.

### JavaScript / Front-End
- Utiliser **ES6+** (const, let, arrow functions, destructuring, spread).
- Pas de `var`, pas de `==`, toujours `===`.
- Favoriser les fonctions pures, les `map`, `filter`, `reduce` vs `for` si lisible.
- Utiliser des modules (`import/export`), pas de code monolithique.
- Adapter le style et l’organisation à la stack (Astro = composant statique + client hydraté, React = hooks, SSR, etc.).

### CSS / HTML
- Suivre l'architecture adaptée à la stack :
  - **Tailwind** : classes explicites, `@apply` si besoin, pas d’abus de `!important`.
  - **CSS Modules / SCSS** : BEM, structure claire, noms scoped.
- Responsive by default (`flex`, `grid`, `clamp()`, media queries modernes).
- Pas de style inline sauf besoin spécifique (override rapide, perf ponctuelle).

### Frameworks et composants (React, Astro, Next.js…)
- Utiliser les API natives du framework : `useEffect`, `load()`, `onMount()`, `getStaticProps()`, etc.
- Éviter les hacks ou mixins complexes.
- Découper les composants de manière claire et modulaire.
- Ne jamais mélanger logique métier et effet de bord dans un composant.

### UI / Animation (GSAP, Motion, WebGL…)
- Isoler les animations dans des modules dédiés.
- Utiliser les plugins officiels et les méthodes performantes (`transform`, `opacity` vs `width`, `left`).
- Nettoyer les listeners et timelines (`kill()`, `context`, `dispose()`).

---

## 🧩 PRINCIPES RECOMMANDÉS

| Principe | Description |
|---------|-------------|
| **DRY**  | Ne jamais dupliquer de logique |
| **KISS** | Garder tout simple et clair |
| **YAGNI**| N’implémenter que ce qui est nécessaire |
| **SRP**  | Une fonction / module = une seule responsabilité |
| **SOC**  | Séparer la logique métier, données, affichage |
| **AHA**  | Ne pas abstraire trop tôt – abstraction seulement quand un besoin est clair |
| **LOD**  | Réduire le couplage (`obj.sub.prop` = mauvais) |
| **TDA**  | Ne pas interroger l’état d’un objet pour agir, mais lui dire quoi faire |
| **BEM**  | Convention CSS claire et scalable |
| **SOLID** | Utiliser S et D même en JS fonctionnel (optionnel) |

---

## 🧾 FORMAT DE LIVRAISON ATTENDU

Claude doit rendre :

- 🔹 Un code **exécutable immédiatement ou facilement intégrable**.
- 🔹 Avec **commentaires utiles**, sans surcharger.
- 🔹 Avec **fonctions séparées et nommées**.
- 🔹 En format modulaire (import/export, composants, etc.).
- 🔹 Sans dépendance inutile (choisir la lib la plus adaptée et légère).

---

## 🔚 CONCLUSION

Ces règles sont là pour guider Claude Code vers un **code propre, durable et professionnel**, utilisable dans n’importe quel type de projet, seul ou en équipe.

💡 *Mieux vaut un code simple qui fonctionne, qu’un code "génial" qui casse tout plus tard.*
