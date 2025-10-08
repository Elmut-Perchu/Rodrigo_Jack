import { Entity } from '../core/entities/entity.js';
import { Position } from '../core/components/position_component.js';
import { Velocity } from '../core/components/velocity_component.js';
import { Visual } from '../core/components/visual_component.js';
import { Input } from '../core/components/input_component.js';
import { Property } from '../core/components/property_component.js';
import { Health } from '../core/components/health_component.js';
import { Damage } from '../core/components/damage_component.js';
import { PlayerAnimation } from '../core/components/animation_component.js';
import { CircleHitbox } from '../core/components/circle_hitbox_component.js';
import { Camera } from '../core/components/camera_component.js';
import { Audio } from '../core/components/audio_component.js'
import { Timer } from '../core/components/timer_component.js';
import { Score } from '../core/components/score_component.js';
import { BowState } from '../core/components/bow_state_component.js';

export function createPlayer(x = 150, y = 150, width = 110, height = 110, color = null) {
    const entity = new Entity();
    entity.addComponent('position', new Position(x, y));
    entity.addComponent('velocity', new Velocity());
    entity.addComponent('visual', new Visual(color, height, width));
    entity.addComponent('input', new Input());
    entity.addComponent('property', new Property(true, 450, false, 425, true));
    entity.addComponent('health', new Health(3)); // 3 vies
    entity.addComponent('damage', new Damage(10));
    entity.addComponent('audio', new Audio());
    entity.addComponent('animation', new PlayerAnimation());
    entity.addComponent('camera', new Camera(1280, 720, 3000, 2000));
    entity.addComponent('timer', new Timer(300));//  (5 minutes = 300 secondes)
    entity.addComponent('score', new Score());
    entity.addComponent('bow_state', new BowState()); // Système de tir à l'arc
    entity.addComponent(
        'circle_hitbox',
        new CircleHitbox(
            0, // offsetX: décalage horizontal depuis le coin supérieur gauche (width/2 pour centrer)
            24, // offsetY: décalage vertical agrandi (12 × 2)
            26, // terrainRadius: rayon de collision agrandi (13 × 2)
            60, // meleeRadius: rayon des attaques au corps à corps agrandi (30 × 2)
            300 // rangedRadius: rayon des attaques à distance agrandi (150 × 2)
        )
    );
    return entity;
}
