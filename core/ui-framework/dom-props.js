/**
 * dom-props.js - Gestion intelligente des propriétés DOM
 *
 * Résout les problèmes de la v1 :
 * - Distinction props immuables vs mutables
 * - Event handlers via addEventListener (pas setAttribute)
 * - Propriétés DOM vs attributs HTML
 */

// Props qui ne peuvent PAS changer après création de l'élément
const IMMUTABLE_PROPS = new Set(['type', 'name']);

// Props qui sont des propriétés DOM, pas des attributs HTML
const DOM_PROPERTIES = new Set(['checked', 'value', 'disabled', 'selected']);

/**
 * Vérifie si une prop est un event handler
 */
function isEventProp(name) {
  return name.startsWith('on');
}

/**
 * Extrait le nom de l'événement depuis la prop
 * Ex: 'onclick' -> 'click'
 */
function extractEventName(name) {
  return name.slice(2).toLowerCase();
}

/**
 * Applique une prop sur un élément DOM
 */
export function setProp(el, name, value) {
  // Event handlers : utiliser un PROXY qui ne change jamais
  if (isEventProp(name)) {
    const eventName = extractEventName(name);

    // Stocker le handler actuel
    el._eventHandlers = el._eventHandlers || {};
    el._eventHandlers[eventName] = value;

    // Créer le proxy UNE SEULE FOIS
    if (!el._eventProxies) {
      el._eventProxies = {};
    }

    if (!el._eventProxies[eventName]) {
      // Créer un proxy qui appelle le handler actuel
      const proxy = (e) => {
        const currentHandler = el._eventHandlers?.[eventName];
        if (currentHandler) {
          currentHandler(e);
        }
      };

      el._eventProxies[eventName] = proxy;
      el.addEventListener(eventName, proxy);
    }

    return;
  }

  // className (cas spécial pour éviter 'class')
  if (name === 'className' || name === 'class') {
    el.className = value;
    return;
  }

  // style (objet ou string)
  if (name === 'style') {
    if (typeof value === 'object') {
      Object.assign(el.style, value);
    } else {
      el.style.cssText = value;
    }
    return;
  }

  // Propriétés DOM (checked, value, disabled)
  if (DOM_PROPERTIES.has(name)) {
    el[name] = value;
    return;
  }

  // Attributs HTML standards
  if (value === true) {
    el.setAttribute(name, '');
  } else if (value !== false && value != null) {
    el.setAttribute(name, value);
  }
}

/**
 * Retire une prop d'un élément DOM
 */
export function removeProp(el, name) {
  // Event handlers : simplement effacer le handler, pas le proxy
  if (isEventProp(name)) {
    const eventName = extractEventName(name);
    if (el._eventHandlers && el._eventHandlers[eventName]) {
      delete el._eventHandlers[eventName];
    }
    return;
  }

  // className
  if (name === 'className' || name === 'class') {
    el.className = '';
    return;
  }

  // style
  if (name === 'style') {
    el.style.cssText = '';
    return;
  }

  // Propriétés DOM
  if (DOM_PROPERTIES.has(name)) {
    el[name] = name === 'checked' ? false : '';
    return;
  }

  // Attributs HTML
  el.removeAttribute(name);
}

/**
 * Applique un ensemble de props sur un élément
 */
export function setProps(el, props) {
  Object.keys(props).forEach(name => {
    setProp(el, name, props[name]);
  });
}

/**
 * Met à jour les props d'un élément (diff entre old et new)
 *
 * IMPORTANT : Corrige le bug de la v1 où oldProps était toujours {}
 * Maintenant oldProps vient du vNode, pas du DOM
 */
export function updateProps(el, oldProps, newProps) {
  // Retirer les props qui n'existent plus
  Object.keys(oldProps).forEach(name => {
    if (!(name in newProps)) {
      removeProp(el, name);
    }
  });

  // Ajouter/mettre à jour les props
  Object.keys(newProps).forEach(name => {
    const oldValue = oldProps[name];
    const newValue = newProps[name];

    // Event handlers : TOUJOURS mettre à jour via le proxy
    // Le proxy reste attaché, on change juste le handler qu'il appelle
    if (isEventProp(name)) {
      setProp(el, name, newValue);
      return;
    }

    // Props immuables : NE JAMAIS mettre à jour après création
    // (type ne peut pas changer, sinon input checkbox → input text)
    if (IMMUTABLE_PROPS.has(name)) {
      return;
    }

    // Pas de changement, skip
    if (oldValue === newValue) {
      return;
    }

    // Props mutables : mettre à jour normalement
    setProp(el, name, newValue);
  });
}
