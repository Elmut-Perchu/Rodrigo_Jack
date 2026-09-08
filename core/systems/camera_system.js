// core/systems/camera_system.js
import { System } from './system.js';
import { CAMERA_ZOOM } from '../mobile.js';

export class Camera extends System {
  constructor() {
    super();
    this.container = document.querySelector('.container');
    this.gameWorld = document.createElement('div');
    this.gameWorld.className = 'game-world';
    this.container.appendChild(this.gameWorld);

    // Style the container as viewport
    this.container.style.overflow = 'hidden';
    this.container.style.position = 'relative';

    // Style the game world
    this.gameWorld.style.position = 'absolute';
    this.gameWorld.style.left = '0';
    this.gameWorld.style.top = '0';
    this.gameWorld.style.willChange = 'transform'; // Optimisation des performances

    /**
     * How far back the camera stands.
     *
     * One on a desktop, where a world pixel is a screen pixel and always has
     * been. Less than one on a phone: at 1:1 the player alone fills a third of
     * a landscape phone's height, and the platform being jumped to is off the
     * bottom of the screen - the game becomes a guess. See core/mobile.js for
     * the number and why it is that number.
     *
     * Only the drawing is scaled. Positions, collisions and the camera's own
     * arithmetic all stay in world units, so nothing about the simulation
     * changes with the size of the screen it is watched on.
     */
    this.zoom = CAMERA_ZOOM;

    // The scale is composed with the pan below, so the origin has to be the
    // world's own corner rather than its middle for the two to agree.
    this.gameWorld.style.transformOrigin = '0 0';
  }

  // Méthode pour charger les métadonnées de la carte
  loadMapMetadata(metadata) {
    if (metadata) {
      this.mapWidth = metadata.width * (metadata.tileSize || this.tileSize);
      this.mapHeight = metadata.height * (metadata.tileSize || this.tileSize);
      this.tileSize = metadata.tileSize || this.tileSize;
    }
  }

  update() {
    const player = Array.from(this.entities).find((entity) => entity.getComponent('input'));
    if (!player) return;

    const camera = player.getComponent('camera');
    const position = player.getComponent('position');
    const visual = player.getComponent('visual');
    if (!camera || !position || !visual) return;

    // Récupérer les dimensions du viewport
    const viewportWidth = this.container.clientWidth;
    const viewportHeight = this.container.clientHeight;

    // Suivre le joueur mais respecter les limites de la carte
    camera.follow(position.x, position.y, visual.width, visual.height);

    // How much of the world fits either side of the camera. Divided by the
    // zoom because pulling back shows *more* world, not less: at 0.6 the same
    // window holds nearly twice the width, and clamping to the unscaled half
    // would leave a band of empty page past the edge of the map.
    const halfWidth = viewportWidth / (2 * this.zoom);
    const halfHeight = viewportHeight / (2 * this.zoom);

    // Appliquer les limites de la carte
    if (this.mapWidth > 0 && this.mapHeight > 0) {
      camera.x = clampToMap(camera.x, halfWidth, this.mapWidth);
      camera.y = clampToMap(camera.y, halfHeight, this.mapHeight);
    }

    // Read right to left: put the camera's position at the origin, scale
    // about it, then move it to the middle of the window.
    const centreX = Math.round(viewportWidth / 2);
    const centreY = Math.round(viewportHeight / 2);
    const panX = -Math.round(camera.x);
    const panY = -Math.round(camera.y);

    this.gameWorld.style.transform =
      `translate3d(${centreX}px, ${centreY}px, 0) scale(${this.zoom}) translate3d(${panX}px, ${panY}px, 0)`;
  }
}

/**
 * Keeps the camera inside the map, or centres a map smaller than the view.
 *
 * The second case is the one worth spelling out: zoomed out far enough - or on
 * a wide enough window - the whole map is narrower than what the camera can
 * see, and the two clamps then contradict each other. Taking the low bound
 * first would pin the map to one edge of the screen; centring it is what the
 * player expects, and it is what the arena already does with its fixed stage.
 */
function clampToMap(value, half, extent) {
  if (extent <= half * 2) return extent / 2;
  return Math.min(Math.max(value, half), extent - half);
}
