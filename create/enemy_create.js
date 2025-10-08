import { Entity } from '../core/entities/entity.js';
import { Position } from '../core/components/position_component.js';
import { Visual } from '../core/components/visual_component.js';
import { Property } from '../core/components/property_component.js';
import { Health } from '../core/components/health_component.js';
import { Damage } from '../core/components/damage_component.js';
import { SatiroAnimation } from '../core/components/animation_component.js';
import { Velocity } from '../core/components/velocity_component.js';
import { CircleHitbox } from '../core/components/circle_hitbox_component.js';
import { Audio } from '../core/components/audio_component.js'

export function createEnemy(x = 0, y = 0, width = 128, height = 128, maxHealth = 100, color = 'transparent') {
    const enemy = new Entity();
    // Composants de base
    enemy.addComponent('position', new Position(x, y));
    enemy.addComponent('velocity', new Velocity());
    enemy.addComponent('visual', new Visual(color, height, width));
    enemy.addComponent('health', new Health(3));

    const property = new Property(false, 0, true, 0, true);
    property.isEnemy = true; // IMPORTANT: Marquer comme ennemi pour collision avec flèches
    enemy.addComponent('property', property);

    enemy.addComponent('damage', new Damage(10));
    enemy.addComponent('audio', new Audio());
    enemy.addComponent('animation', new SatiroAnimation());
    enemy.addComponent('circle_hitbox', new CircleHitbox(
        0,    // offsetX
        10,   // offsetY agrandi (5 × 2)
        30,   // rayon de collision agrandi (15 × 2)
        120,  // rayon d'attaque corps à corps agrandi (60 × 2)
        300   // rayon d'attaque à distance agrandi (150 × 2)
    ));
    return enemy;
}
