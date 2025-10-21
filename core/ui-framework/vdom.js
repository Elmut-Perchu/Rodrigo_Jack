/**
 * vdom.js - Virtual DOM implementation
 *
 * Architecture propre inspirée de Preact/cyan33/v-dom
 * - vNodes immuables
 * - Props stockées DANS le vNode (jamais sur le DOM)
 * - Diff algorithm O(n)
 * - Patch minimal du DOM réel
 */

import { setProps, updateProps } from './dom-props.js';

/**
 * WeakMap pour stocker les props des éléments DOM
 * Évite de polluer le DOM avec des propriétés custom
 */
const elementPropsMap = new WeakMap();

/**
 * Crée un vNode (Virtual DOM Node)
 *
 * @param {string} tag - Nom de la balise HTML
 * @param {object} props - Propriétés/attributs (peut contenir event handlers)
 * @param {...any} children - Enfants (vNodes ou texte)
 * @returns {object} vNode
 */
export function h(tag, props = {}, ...children) {
  return {
    tag,
    props: props || {},
    children: flattenChildren(children)
  };
}

/**
 * Aplatit les enfants et normalise les textes
 */
function flattenChildren(children) {
  return children
    .flat(Infinity)
    .filter(child => child != null && child !== false)
    .map(child =>
      typeof child === 'object' ? child : createTextVNode(child)
    );
}

/**
 * Crée un vNode de type texte
 */
function createTextVNode(text) {
  return {
    tag: 'TEXT_NODE',
    props: {},
    children: [],
    text: String(text)
  };
}

/**
 * Compare deux vNodes et retourne un patch
 *
 * @param {object} oldVNode - Ancien vNode
 * @param {object} newVNode - Nouveau vNode
 * @returns {object|null} Patch à appliquer
 */
export function diff(oldVNode, newVNode) {
  // Cas 1 : Nouveau noeud ajouté
  if (oldVNode === undefined) {
    return { type: 'CREATE', vNode: newVNode };
  }

  // Cas 2 : Noeud supprimé
  if (newVNode === undefined) {
    return { type: 'REMOVE' };
  }

  // Cas 3 : Type de noeud différent (ex: div → span)
  if (oldVNode.tag !== newVNode.tag) {
    return { type: 'REPLACE', vNode: newVNode };
  }

  // Cas 4 : Noeud texte modifié
  if (oldVNode.tag === 'TEXT_NODE') {
    if (oldVNode.text !== newVNode.text) {
      return { type: 'TEXT', text: newVNode.text };
    }
    return null;
  }

  // Cas 5 : Même tag, vérifier les props et enfants
  const propsDiff = diffProps(oldVNode.props, newVNode.props);
  const childrenDiff = diffChildren(oldVNode.children, newVNode.children);

  if (propsDiff || childrenDiff.length > 0) {
    return {
      type: 'UPDATE',
      propsDiff,
      childrenDiff,
      // IMPORTANT : Stocker le vNode pour avoir accès aux props plus tard
      vNode: newVNode
    };
  }

  return null;
}

/**
 * Compare les props de deux vNodes
 */
function diffProps(oldProps, newProps) {
  const patches = {};
  let hasChanges = false;

  // Props supprimées
  for (const key in oldProps) {
    if (!(key in newProps)) {
      patches[key] = undefined;
      hasChanges = true;
    }
  }

  // Props ajoutées ou modifiées
  for (const key in newProps) {
    if (oldProps[key] !== newProps[key]) {
      patches[key] = newProps[key];
      hasChanges = true;
    }
  }

  return hasChanges ? patches : null;
}

/**
 * Compare les enfants de deux vNodes
 */
function diffChildren(oldChildren, newChildren) {
  const patches = [];
  const maxLength = Math.max(oldChildren.length, newChildren.length);

  for (let i = 0; i < maxLength; i++) {
    patches.push(diff(oldChildren[i], newChildren[i]));
  }

  return patches;
}

/**
 * Crée un élément DOM réel depuis un vNode
 *
 * @param {object} vNode - Virtual Node
 * @returns {Node} Élément DOM
 */
export function createElement(vNode) {
  // Texte
  if (vNode.tag === 'TEXT_NODE') {
    return document.createTextNode(vNode.text);
  }

  // Élément
  const el = document.createElement(vNode.tag);

  // Appliquer les props
  setProps(el, vNode.props);

  // IMPORTANT: Stocker les props dans la WeakMap pour le diff futur
  // (Bug v2.0: cela n'était fait que pour la racine dans mount())
  elementPropsMap.set(el, vNode.props);

  // Créer et ajouter les enfants
  vNode.children
    .map(createElement)
    .forEach(child => el.appendChild(child));

  return el;
}

/**
 * Applique un patch au DOM réel
 *
 * @param {Node} parent - Parent DOM node
 * @param {object} patch - Patch à appliquer
 * @param {Node} el - Élément DOM à patcher
 * @param {number} index - Index de l'élément dans le parent
 * @returns {Node} Élément DOM mis à jour
 */
export function patch(parent, patchObj, el, index = 0) {
  if (!patchObj) {
    return el;
  }

  switch (patchObj.type) {
    case 'CREATE': {
      const newEl = createElement(patchObj.vNode);
      parent.appendChild(newEl);
      return newEl;
    }

    case 'REMOVE': {
      parent.removeChild(el);
      return null;
    }

    case 'REPLACE': {
      const newEl = createElement(patchObj.vNode);
      parent.replaceChild(newEl, el);
      return newEl;
    }

    case 'TEXT': {
      el.textContent = patchObj.text;
      return el;
    }

    case 'UPDATE': {
      // Props : IMPORTANT - utiliser les props du vNode, pas du DOM !
      if (patchObj.propsDiff) {
        // Récupérer oldProps depuis la WeakMap
        const oldProps = elementPropsMap.get(el) || {};
        updateProps(el, oldProps, patchObj.vNode.props);
        // Stocker les nouvelles props pour le prochain diff
        elementPropsMap.set(el, patchObj.vNode.props);
      }

      // Enfants
      if (patchObj.childrenDiff) {
        const childNodes = Array.from(el.childNodes);
        patchObj.childrenDiff.forEach((childPatch, i) => {
          patch(el, childPatch, childNodes[i], i);
        });
      }

      return el;
    }

    default:
      return el;
  }
}

/**
 * Monte un vNode dans un container DOM
 *
 * @param {Node} container - Container DOM
 * @param {object} vNode - Virtual Node à monter
 * @returns {Node} Élément DOM créé
 */
export function mount(container, vNode) {
  const el = createElement(vNode);
  // Note: props déjà stockées dans WeakMap par createElement
  container.appendChild(el);
  return el;
}

/**
 * Met à jour un container DOM avec un nouveau vNode
 *
 * @param {Node} container - Container DOM
 * @param {object} newVNode - Nouveau Virtual Node
 * @param {object} oldVNode - Ancien Virtual Node
 */
export function update(container, newVNode, oldVNode) {
  const patches = diff(oldVNode, newVNode);
  const el = container.firstChild;
  patch(container, patches, el);
}
