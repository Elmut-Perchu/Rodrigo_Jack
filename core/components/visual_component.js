// core/components/visual_component.js
import { Component } from './component.js';

/**
 * An entity's div, and everything written to it.
 *
 * Two things are worth knowing about how this draws.
 *
 * **Position goes through `transform`, not `left`/`top`.** Moving an element
 * with left/top invalidates layout, and the browser then has to work out where
 * everything in that container sits again - on a map with three hundred tiles
 * that is a real cost, paid on every frame in which anything moved at all.
 * A transform is not layout: the browser skips straight to painting. The div
 * is pinned at 0,0 once and never moves again as far as layout is concerned.
 *
 * It is a 2D `translate` on purpose, not `translate3d`. The 3D form is the
 * usual advice, but it also asks the browser to give the element a compositing
 * layer of its own - fine for a handful of elements, ruinous for three hundred
 * on a phone, where each layer is texture memory. The 2D form skips layout
 * just the same without the invitation.
 *
 * **The transform is composed in one place.** Position, horizontal flip and
 * rotation all end up in the same CSS property, so they cannot be written
 * independently: whoever writes one has to write the others too, or lose them.
 * Hence the fields below and syncTransform() - callers set what they mean and
 * the property is assembled from all three.
 */
export class Visual extends Component {
  constructor(color, height, width, bg, tx, ty) {
    super();
    this.div = document.createElement('div');
    this.height = height;
    this.width = width;
    this.bgColor = color;
    this.bg = bg;
    this.tx = tx;
    this.ty = ty;

    // The three parts of the transform.
    this.x = 0;
    this.y = 0;
    this.flipped = false;
    // Extra rotation, in radians, applied on top of the horizontal flip.
    // Only VS arrows use it - they can now be loosed up, down and diagonally,
    // and a shaft pointing the wrong way reads as a bug. Everything else
    // leaves it at 0, which renders identically to before.
    this.rotation = 0;

    // What is currently on screen, so a frame that changes nothing writes
    // nothing. Undefined until the first paint, which never equals a real
    // value, so the opening frame always draws.
    this.paintedTransform = undefined;
    this.paintedSprite = undefined;
  }

  /** Moves the div. Cheap and idempotent: an unchanged position writes nothing. */
  place(x, y) {
    if (this.x === x && this.y === y) return;
    this.x = x;
    this.y = y;
    this.syncTransform();
  }

  syncTransform() {
    const flip = this.flipped ? ' scaleX(-1)' : '';
    const spin = this.rotation ? ` rotate(${this.rotation}rad)` : '';
    const value = `translate(${this.x}px, ${this.y}px)${flip}${spin}`;

    if (value === this.paintedTransform) return;
    this.paintedTransform = value;
    this.div.style.transform = value;
  }

  updateSprite(frameX, frameY, isFlipped, spritePath, frameWidth, frameHeight, columns, rows) {
    // Which sheet is showing is remembered rather than read back out of the
    // DOM. It used to be recovered from div.style.backgroundImage and stripped
    // of its url(...) wrapper with two regular expressions - on every entity,
    // on every frame, to answer a question this object already knew.
    if (this.paintedSprite !== spritePath) {
      this.paintedSprite = spritePath;
      this.div.style.backgroundImage = `url(${spritePath})`;
      this.div.style.imageRendering = 'pixelated';
      this.div.style.backgroundRepeat = 'no-repeat';

      // Calcul de l'échelle basé sur les dimensions souhaitées
      const scaleX = this.width / frameWidth;
      const scaleY = this.height / frameHeight;

      // Utilisation des colonnes et lignes spécifiques au sprite
      const totalWidth = frameWidth * columns * scaleX;
      const totalHeight = frameHeight * rows * scaleY;

      this.div.style.backgroundSize = `${totalWidth}px ${totalHeight}px`;
      this.div.style.overflow = 'hidden';
    }

    // Mise à jour de la position du sprite
    const x = -(frameX * this.width);
    const y = -(frameY * this.height);
    const position = `${x}px ${y}px`;

    if (position !== this.paintedFrame) {
      this.paintedFrame = position;
      this.div.style.backgroundPosition = position;
    }

    this.flipped = !!isFlipped;
    this.syncTransform();
  }
}
