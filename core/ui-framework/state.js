/**
 * state.js - Reactive State Management avec Proxy
 *
 * Système réactif simple mais puissant
 * - Utilise Proxy pour détecter les changements
 * - Notifie les listeners à chaque modification
 * - Support des watchers par clé
 */

/**
 * Crée un état réactif
 *
 * @param {object} initialState - État initial
 * @param {function} onChange - Callback appelé à chaque changement
 * @returns {Proxy} État réactif
 */
export function createState(initialState = {}, onChange = null) {
  const watchers = new Map();
  const globalListeners = new Set();

  if (onChange) {
    globalListeners.add(onChange);
  }

  /**
   * Ajoute un watcher pour une clé spécifique
   */
  function watch(key, callback) {
    if (!watchers.has(key)) {
      watchers.set(key, new Set());
    }
    watchers.get(key).add(callback);

    // Retourne une fonction pour unwatch
    return () => {
      const keyWatchers = watchers.get(key);
      if (keyWatchers) {
        keyWatchers.delete(callback);
      }
    };
  }

  /**
   * Notifie les watchers d'un changement
   */
  function notify(key, value, oldValue) {
    // Watchers spécifiques à la clé
    const keyWatchers = watchers.get(key);
    if (keyWatchers) {
      keyWatchers.forEach(callback => {
        callback(value, oldValue, key);
      });
    }

    // Listeners globaux
    globalListeners.forEach(callback => {
      callback(key, value, oldValue);
    });
  }

  /**
   * Crée un proxy récursif pour détecter les changements profonds
   */
  function createProxy(target, path = '') {
    return new Proxy(target, {
      get(obj, key) {
        // Exposer la fonction watch au root level
        if (key === 'watch' && path === '') return watch;

        const value = obj[key];

        // Proxifier les objets imbriqués (pas les arrays pour l'instant)
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          const nestedPath = path ? `${path}.${key}` : key;
          return createProxy(value, nestedPath);
        }

        return value;
      },

      set(obj, key, value) {
        const oldValue = obj[key];

        // Pas de changement, skip
        if (oldValue === value) {
          return true;
        }

        obj[key] = value;

        const fullKey = path ? `${path}.${key}` : key;
        notify(fullKey, value, oldValue);

        return true;
      },

      deleteProperty(obj, key) {
        const oldValue = obj[key];
        const deleted = delete obj[key];

        if (deleted) {
          const fullKey = path ? `${path}.${key}` : key;
          notify(fullKey, undefined, oldValue);
        }

        return deleted;
      }
    });
  }

  return createProxy(initialState);
}
