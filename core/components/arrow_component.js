// core/components/arrow_component.js
import { Component } from './component.js';

export class Arrow extends Component {
    constructor() {
        super();
        this.state = 'flying'; // 'flying' | 'impacting_tile' | 'impacting_enemy' | 'stuck'
        this.damage = 1;
        this.ownerUUID = null; // UUID du player qui a tiré
        this.impactStartTime = null; // Timestamp début animation impact
        this.impactTargetUUID = null; // UUID enemy si impact enemy
        this.isRecoverable = true; // Peut être ramassée
        this.direction = { x: 1, y: 0 }; // Direction de vol normalisée
        this.spawnTime = performance.now(); // Timestamp spawn
        this.collisionDelay = 100; // ms avant activation collision (évite collision spawn)
        this.impactPosition = null; // Position d'impact sauvegardée {x, y}

        // VS mode: une flèche perd de la vitesse et retombe passé sa portée,
        // qui dépend du temps de bande. Infinity = portée illimitée, le
        // comportement d'Adventure.
        this.speed = null;
        this.maxRange = Infinity;
        this.travelled = 0;
    }
}
