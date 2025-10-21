/**
 * framework.js - Main Framework API
 *
 * Intègre Virtual DOM, State Management et Router
 * - Crée des applications réactives
 * - Monte les composants dans le DOM
 * - Gère le cycle de vie de l'application
 */

import { createState } from './state.js';
import { createRouter } from './router.js';
import { mount, update } from './vdom.js';

/**
 * Crée une application
 *
 * @param {object} config - Configuration de l'app
 * @param {object} config.state - État initial
 * @param {function} config.render - Fonction de rendu (state, router) => vNode
 * @param {object} config.routes - Routes { '/path': callback }
 * @returns {object} Instance de l'application
 */
export function createApp(config = {}) {
  const {
    state: initialState = {},
    render,
    routes = {}
  } = config;

  let container = null;
  let oldVNode = null;
  let isRendering = false;

  // État réactif
  const state = createState(initialState, handleStateChange);

  // Routeur
  const router = createRouter(routes, handleRouteChange);

  /**
   * Gère les changements d'état
   */
  function handleStateChange() {
    scheduleRender();
  }

  /**
   * Gère les changements de route
   */
  function handleRouteChange() {
    scheduleRender();
  }

  /**
   * Planifie un rendu (évite les rendus multiples dans le même tick)
   */
  function scheduleRender() {
    if (isRendering || !container) {
      return;
    }

    isRendering = true;

    // Utiliser requestAnimationFrame pour batching
    requestAnimationFrame(() => {
      performRender();
      isRendering = false;
    });
  }

  /**
   * Effectue le rendu
   */
  function performRender() {
    if (!render || !container) {
      return;
    }

    try {
      // Générer le nouveau vNode
      const newVNode = render(state, router);

      if (!newVNode) {
        console.warn('render() doit retourner un vNode');
        return;
      }

      // Premier rendu ou mise à jour
      if (!oldVNode) {
        // Premier montage
        container.innerHTML = '';
        mount(container, newVNode);
      } else {
        // Mise à jour via diff/patch
        update(container, newVNode, oldVNode);
      }

      oldVNode = newVNode;
    } catch (error) {
      console.error('Erreur lors du rendu:', error);
    }
  }

  /**
   * Monte l'application dans un élément DOM
   *
   * @param {string} selector - Sélecteur CSS de l'élément conteneur
   */
  function mountApp(selector) {
    container = document.querySelector(selector);

    if (!container) {
      throw new Error(`Élément introuvable: ${selector}`);
    }

    // Démarrer le routeur
    router.start();

    // Premier rendu
    performRender();
  }

  /**
   * Démonte l'application
   */
  function unmount() {
    router.stop();
    if (container) {
      container.innerHTML = '';
    }
    container = null;
    oldVNode = null;
  }

  return {
    state,
    router,
    mount: mountApp,
    unmount
  };
}
