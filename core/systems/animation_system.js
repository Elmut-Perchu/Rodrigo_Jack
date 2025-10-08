// core/systems/animation_system.js
import { System } from './system.js';

export class Animation extends System {
    constructor() {
        super();
        this.lastTime = performance.now();
    }

    // Nouvelle méthode pour initialiser les événements
    setGame(game) {
        super.setGame(game);
        // Maintenant on peut s'abonner aux événements car this.game existe
        this.game.eventBus.on('entityDeath', this.handleEntityDeath.bind(this));
    }

    handleEntityDeath(entity) {
        const animation = entity.getComponent('animation');
        const property = entity.getComponent('property');

        if (!animation || !property) return;

        animation.setState('death');
        property.solid = false;
        property.movable = false;

        if (!entity.getComponent('input')) {
            const deathDuration = (animation.sequences.death.frames.length /
                animation.sequences.death.speed) * 1000;

            setTimeout(() => {
                this.game.removeEntity(entity);
            }, deathDuration);
        }
    }

    update(deltaTime) {
        this.entities.forEach((entity) => {
            const animation = entity.getComponent('animation');
            const visual = entity.getComponent('visual');
            const input = entity.getComponent('input');
            const property = entity.getComponent('property');
            const health = entity.getComponent('health');

            if (!animation || !visual) return;

            if (!animation.initialized && animation.spriteSheet.complete) {
                animation.initialized = true;

                // Log pour arrows
                const arrow = entity.getComponent('arrow');
                if (arrow) {
                    console.log('🎯 [AnimationSystem] Arrow sprite initialized');
                    console.log('  - currentState:', animation.currentState);
                    console.log('  - spriteSheet.src:', animation.spriteSheet.src);
                }

                // Force initial sprite update
                const frameNumber = animation.currentSequence[animation.currentFrame];
                const framePosition = animation.getFramePosition(frameNumber);
                visual.updateSprite(
                    framePosition.x,
                    framePosition.y,
                    animation.isFlipped,
                    animation.spriteSheet.src,
                    animation.frameWidth,
                    animation.frameHeight,
                    animation.columns,
                    animation.rows
                );
            }
            if (!animation.initialized) return;

            // Si déjà en animation de mort
            if (animation.currentState === 'death') {
                this.updateAnimation(animation, visual, deltaTime);
                return;
            }

            // Vérifier si c'est une flèche stuck (freeze frame)
            const arrow = entity.getComponent('arrow');
            if (arrow && arrow.state === 'stuck') {
                // Ne pas update l'animation, reste frozen sur currentFrame
                return;
            }

            // Vérifier la mort
            if (health && health.currentLives <= 0) {
                this.game.eventBus.emit('entityDeath', entity);
                return;
            }

            // Animations normales
            if (input && property) {
                // Vérifier si le player est en train de charger l'arc
                const bowState = entity.getComponent('bow_state');
                const isChargingBow = bowState && (bowState.state === 'charging' || bowState.state === 'ready_to_shoot');

                // Si en charge arc, bloquer sur arrowShoot
                if (isChargingBow) {
                    animation.setState('arrowShoot');
                } else if (property.isPushing && input.vector.h !== 0) {
                    animation.setState('push');
                } else if (input.attack1) {
                    animation.setState('attack1');
                } else if (input.attack2) {
                    animation.setState('attack2');
                } else if (input.attack3) {
                    animation.setState('attack3');
                } else if (input.magicAttack) {
                    animation.setState('magicAttack');
                } else if (input.arrowShoot) {
                    animation.setState('arrowShoot');
                } else if (input.roll) {
                    animation.setState('roulade');
                } else if (!property.isOnGround) {
                    animation.setState('jump');
                } else if (input.vector.h !== 0) {
                    animation.setState('run');
                    animation.isFlipped = input.vector.h < 0;
                } else {
                    animation.setState('idle');
                }
            }

            this.updateAnimation(animation, visual, deltaTime);
        });
    }

    updateAnimation(animation, visual, deltaTime) {
        animation.frameTimer += deltaTime;
        if (animation.frameTimer >= 1 / animation.sequences[animation.currentState].speed) {
            animation.frameTimer = 0;

            // Ne pas boucler l'animation de mort (freeze sur dernière frame)
            if (animation.currentState === 'death' &&
                animation.currentFrame >= animation.currentSequence.length - 1) {
                return;
            }

            // Ne pas boucler l'animation arrowShoot si on est en train de charger
            // Freeze à frame 121 (index 4) pendant charge, puis 122-123 après relâchement
            if (animation.currentState === 'arrowShoot') {
                const entity = Array.from(this.entities).find(e => e.getComponent('animation') === animation);
                const bowState = entity?.getComponent('bow_state');

                // Pendant charge/ready: freeze à currentFrame 4 (frame 121)
                if (bowState && (bowState.state === 'charging' || bowState.state === 'ready_to_shoot')) {
                    if (animation.currentFrame >= 4) {
                        animation.currentFrame = 4; // Force freeze à frame 121
                        return;
                    }
                }

                // Après relâchement (cooldown): laisser finir l'animation 122-123 puis retour idle
                if (animation.currentFrame >= animation.currentSequence.length - 1) {
                    // Animation complète, ne pas boucler
                    return;
                }
            }

            animation.currentFrame = (animation.currentFrame + 1) % animation.currentSequence.length;

            // Log pour debugging impact animations
            if (animation.currentState.startsWith('impact_')) {
                console.log('🎯 [AnimationSystem] Impact animation frame update');
                console.log('  - currentState:', animation.currentState);
                console.log('  - currentFrame:', animation.currentFrame);
                console.log('  - currentSequence:', animation.currentSequence);
            }

            const frameNumber = animation.currentSequence[animation.currentFrame];
            const framePosition = animation.getFramePosition(frameNumber);

            // Log pour debugging visual update
            if (animation.currentState.startsWith('impact_')) {
                console.log('🎯 [AnimationSystem] Calling visual.updateSprite for impact');
                console.log('  - frameNumber:', frameNumber);
                console.log('  - framePosition:', framePosition);
                console.log('  - spriteSheet.src:', animation.spriteSheet.src);
            }

            visual.updateSprite(
                framePosition.x,
                framePosition.y,
                animation.isFlipped,
                animation.spriteSheet.src,
                animation.frameWidth,
                animation.frameHeight,
                animation.columns,
                animation.rows
            );
        }
    }
}