/**
 * router.js - Hash-based Router
 *
 * Simple routing system based on URL hash
 * - Monitors hash changes
 * - Matches routes and executes callbacks
 * - Integrates with state for reactive navigation
 */

/**
 * Crée un routeur simple basé sur le hash
 *
 * @param {object} routes - Map de routes { '/path': callback }
 * @param {function} onChange - Callback appelé à chaque changement de route
 * @returns {object} Routeur avec méthodes navigate() et getCurrentRoute()
 */
export function createRouter(routes = {}, onChange = null) {
  let currentRoute = null;

  /**
   * Obtient la route actuelle depuis le hash
   */
  function getCurrentHash() {
    const hash = window.location.hash.slice(1) || '/';
    return hash;
  }

  /**
   * Trouve et exécute le callback de la route correspondante
   */
  function handleRouteChange() {
    const hash = getCurrentHash();
    const oldRoute = currentRoute;
    currentRoute = hash;

    // Exécuter le callback de la route si défini
    const routeCallback = routes[hash];
    if (routeCallback) {
      routeCallback(hash, oldRoute);
    }

    // Notifier le listener global
    if (onChange) {
      onChange(hash, oldRoute);
    }
  }

  /**
   * Navigue vers une nouvelle route
   */
  function navigate(path) {
    if (path !== getCurrentHash()) {
      window.location.hash = path;
    }
  }

  /**
   * Obtient la route actuelle
   */
  function getCurrentRoute() {
    return currentRoute;
  }

  /**
   * Démarre le routeur
   */
  function start() {
    // Écouter les changements de hash
    window.addEventListener('hashchange', handleRouteChange);

    // Traiter la route initiale
    handleRouteChange();
  }

  /**
   * Arrête le routeur
   */
  function stop() {
    window.removeEventListener('hashchange', handleRouteChange);
  }

  return {
    navigate,
    getCurrentRoute,
    start,
    stop
  };
}
