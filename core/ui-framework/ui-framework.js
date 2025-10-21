/**
 * ui-framework.js - Mini-Framework Entry Point
 *
 * Reactive UI framework for Rodrigo Jack VS mode
 * - Virtual DOM with efficient diff/patch
 * - Reactive state management
 * - Hash-based routing
 * - Stable event handlers via proxy pattern
 */

// Virtual DOM
export { h, createElement, diff, patch, mount, update } from './vdom.js';

// DOM Properties Management
export { setProp, removeProp, setProps, updateProps } from './dom-props.js';

// State Management
export { createState } from './state.js';

// Router
export { createRouter } from './router.js';

// Framework
export { createApp } from './framework.js';
