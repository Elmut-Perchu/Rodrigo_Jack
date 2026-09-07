// core/components/visual_component.js
import { Component } from './component.js';

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
    // Extra rotation, in radians, applied on top of the horizontal flip.
    // Only VS arrows use it - they can now be loosed up, down and diagonally,
    // and a shaft pointing the wrong way reads as a bug. Everything else
    // leaves it at 0, which renders identically to before.
    this.rotation = 0;
  }

  updateSprite(frameX, frameY, isFlipped, spritePath, frameWidth, frameHeight, columns, rows) {
    // Vérifier si le sprite a changé (pour gérer les switch de spritesheet dynamiques)
    const currentSpritePath = this.div.style.backgroundImage.replace(/^url\(["']?/, '').replace(/["']?\)$/, '');
    const spriteChanged = !this.div.style.backgroundImage || currentSpritePath !== spritePath;

    // Initialisation ou changement de sprite
    if (!this.div.style.backgroundImage || spriteChanged) {
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

    this.div.style.backgroundPosition = `${x}px ${y}px`;

    const flip = isFlipped ? 'scaleX(-1)' : 'scaleX(1)';
    this.div.style.transform = this.rotation
      ? `${flip} rotate(${this.rotation}rad)`
      : flip;
  }
}
