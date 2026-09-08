// core/systems_vs/vs_render_system.js - VS Mode Render System
import { System } from '../systems/system.js';
import { isParalysed } from '../../constants/vs_paralysis_constants.js';

export class VSRender extends System {
    constructor(game) {
        super(game);

        // Drawing runs once per displayed frame, not once per physics step:
        // painting the same sprite twice between two refreshes is wasted DOM
        // work nobody can see.
        this.fixedStep = false;
        this.gameWorld = document.querySelector('.game-world');
        this.initialized = new Set(); // Track initialized entities
        this.paintedTiles = new Set(); // Tiles whose tileset sprite is applied
    }

    update(deltaTime = 0) {
        this.entities.forEach((entity) => {
            const position = entity.getComponent('position');
            const visual = entity.getComponent('visual');

            if (!position || !visual || !visual.div) return;

            // Initialize entity on first encounter
            if (!this.initialized.has(entity.uuid)) {
                this.initializeEntity(entity, visual, position);
                this.initialized.add(entity.uuid);
            }

            // Tiles carry their sprite in a 'tile' component. Adventure mode
            // paints them through TileSystem, which is not part of the VS
            // pipeline, so without this the arena was 118 transparent divs on
            // a black page. The tileset image loads asynchronously, hence the
            // retry until the component reports it is ready.
            //
            // Tested before the position is written, not after: the arena's
            // scenery is placed once by initializeEntity and never moves, so
            // re-writing left and top on ninety of them every frame was two
            // hundred layout invalidations a frame to keep a wall exactly
            // where it already was.
            const tile = entity.getComponent('tile');
            if (tile) {
                if (!this.paintedTiles.has(entity.uuid)) {
                    tile.updateVisual(visual);
                    if (tile.initialized) this.paintedTiles.add(entity.uuid);
                }
                return; // Tiles are static: no animation work to do
            }

            // Moved with a transform, and only when it actually moved (see
            // Visual.place): left/top would put the browser back into layout
            // on every frame in which any fighter took a step.
            visual.place(position.x, position.y);

            const animation = entity.getComponent('animation');
            if (!animation) return;

            // Arrows have their own tiny state machine (flying / stuck) and
            // must not go through the player run/jump/attack selection.
            const arrow = entity.getComponent('arrow');
            if (arrow) {
                this.updateArrow(arrow, animation, visual);
                return;
            }

            // A spectre only ever hovers; it has no run/jump/attack states to
            // choose between, and putting it through the fighter selection
            // below would have it looking for sequences it does not own.
            if (entity.getComponent('spectre')) {
                this.updateSpectre(entity, animation, visual, deltaTime);
                return;
            }

            this.updatePlayerAnimation(entity, animation, visual, deltaTime);
        });
    }

    /**
     * Drives a player's spritesheet.
     *
     * Adventure mode does this in AnimationSystem, which the VS pipeline does
     * not run. VSRender used to call animation.update(visual) - a method that
     * does not exist on the Animation class - behind a typeof guard, so it
     * silently did nothing and every player rendered as an invisible div.
     */
    updatePlayerAnimation(entity, animation, visual, deltaTime) {
        const velocity = entity.getComponent('velocity');
        const property = entity.getComponent('property');
        const input = entity.getComponent('input');

        // A spirit's hold outranks everything else on screen, a swing that was
        // already playing included - the blow being interrupted is precisely
        // what the hold is for. Cleared rather than waited out, so the sword
        // does not resume its arc the moment the fighter comes back.
        if (isParalysed(property)) {
            entity._attackHoldUntil = 0;
            if (animation.currentState !== 'paralysed') animation.setState('paralysed');
            this.drawState(animation, visual, deltaTime);
            return;
        }

        // A swing relayed by the server (see handleRemoteAttack) owns the
        // animation for a moment; otherwise the velocity-derived state below
        // would overwrite it on the very next frame and nothing would show.
        if (entity._attackHoldUntil && performance.now() < entity._attackHoldUntil) {
            if (animation.initialized) this.advanceFrames(animation, visual, deltaTime);
            return;
        }

        // Pick the state from what the entity is doing
        let state = 'idle';
        if (velocity) {
            if (Math.abs(velocity.vx) > 0.1) state = 'run';
            if (property && !property.isOnGround) state = 'jump';
        }
        if (input) {
            // Sword blows are not selected here. VSBow picks which of the
            // three it is and sets it directly, holding it through
            // _attackHoldUntil above - one key produces all of them, so there
            // is no longer a key per animation to read.
            //
            // The draw pose shows only while actually drawing. Once the arrow
            // is on the string the body animates normally again: what says the
            // bow is ready is the nocked arrow out in front, not a frozen pose.
            if (input.arrowShoot && !entity._bowArmed) state = 'arrowShoot';
            else if (input.magicAttack) state = 'magicAttack';
        }

        // Facing follows INTENT, not the resulting velocity.
        //
        // Deriving it from vx turned the fighter around during a rebound: the
        // shove reverses horizontal speed for a moment, so walking into an
        // opponent to hit them left you facing away from them - and since the
        // sword's direction is read from the sprite, the swing went the wrong
        // way. The direction key still says where you meant to go, so use that
        // whenever it is held.
        //
        // facingLock is an explicit override, used by the AI when it needs to
        // keep the bow on a target it is backing away from.
        if (animation.facingLock) {
            animation.isFlipped = animation.facingLock < 0;
        } else if (input && input.vector && Math.abs(input.vector.h) > 0.1) {
            animation.isFlipped = input.vector.h < 0;
        } else if (velocity) {
            // Nobody at the controls: fall back to motion. Networked players
            // get isFlipped from game_state_sync, and their velocity comes
            // from the same frame, so the two agree.
            if (velocity.vx < -0.1) animation.isFlipped = true;
            else if (velocity.vx > 0.1) animation.isFlipped = false;
        }

        if (animation.currentState !== state) animation.setState(state);

        this.drawState(animation, visual, deltaTime);
    }

    /**
     * Paints the current state, waiting out the spritesheet if it is still
     * loading.
     *
     * The sheet is decoded asynchronously, so the first frame is painted as
     * soon as it is there and the clock only starts running afterwards.
     */
    drawState(animation, visual, deltaTime) {
        if (!animation.initialized) {
            if (!animation.spriteSheet || !animation.spriteSheet.complete) return;
            animation.initialized = true;
            this.paintFrame(animation, visual);
            return;
        }

        this.advanceFrames(animation, visual, deltaTime);
    }

    /** Steps the animation clock and repaints. */
    advanceFrames(animation, visual, deltaTime) {
        const sequence = animation.sequences[animation.currentState];
        if (!sequence) return;

        // Death plays once and holds its last frame - looping it back to the
        // wind-up frame made a downed fighter twitch back to life forever.
        const lastFrame = animation.currentSequence.length - 1;
        if (animation.currentState === 'death' && animation.currentFrame >= lastFrame) {
            animation.currentFrame = lastFrame;
            this.paintFrame(animation, visual);
            return;
        }

        animation.frameTimer += deltaTime;
        if (animation.frameTimer >= 1 / sequence.speed) {
            animation.frameTimer = 0;
            animation.currentFrame = (animation.currentFrame + 1) % animation.currentSequence.length;
        }

        this.paintFrame(animation, visual);
    }

    /**
     * Arrows show a single frame, turned to match their flight direction.
     *
     * Rotation rather than a horizontal flip: the arena's bow aims up, down
     * and diagonally, and a flip can only ever express two of the eight
     * directions a shot can take. The sprite points right at zero, so the
     * flight angle is the rotation, and a shot to the left is simply half a
     * turn.
     */
    updateArrow(arrow, animation, visual) {
        animation.isFlipped = false;
        // Read back by updateSprite -> syncTransform, which composes it with
        // the position and the flip into the single transform property.
        visual.rotation = Math.atan2(arrow.direction.y || 0, arrow.direction.x);

        if (!animation.initialized) {
            if (!animation.spriteSheet || !animation.spriteSheet.complete) return;
            animation.initialized = true;
        }

        this.paintFrame(animation, visual);
    }

    /** A spectre hovers on one looping sequence and faces where it is going. */
    updateSpectre(entity, animation, visual, deltaTime) {
        const velocity = entity.getComponent('velocity');
        if (velocity && Math.abs(velocity.vx) > 1) animation.isFlipped = velocity.vx < 0;

        if (!animation.initialized) {
            if (!animation.spriteSheet || !animation.spriteSheet.complete) return;
            animation.initialized = true;
            this.paintFrame(animation, visual);
            return;
        }

        this.advanceFrames(animation, visual, deltaTime);
    }

    paintFrame(animation, visual) {
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

    initializeEntity(entity, visual, position) {
        const div = visual.div;

        // Basic styling
        div.style.position = 'absolute';
        div.style.width = `${visual.width}px`;
        div.style.height = `${visual.height}px`;
        // Pinned at the origin; the transform carries the position.
        div.style.left = '0';
        div.style.top = '0';
        visual.place(position.x, position.y);

        // Check if this is a player (has networkPlayer or animation)
        const networkPlayer = entity.getComponent('networkPlayer');
        const animation = entity.getComponent('animation');

        if (networkPlayer || animation) {
            // Player entity - will be animated
            div.classList.add('player-sprite');
            div.style.zIndex = '100';
        } else {
            // Tile or other entity
            if (visual.bgColor) {
                div.style.backgroundColor = visual.bgColor;
            }
        }

        // Attach to game world
        if (this.gameWorld && !div.parentNode) {
            this.gameWorld.appendChild(div);
        }
    }

    // Clean up when entity is removed
    removeEntity(entity) {
        super.removeEntity(entity);
        this.initialized.delete(entity.uuid);
        this.paintedTiles.delete(entity.uuid);
    }
}
