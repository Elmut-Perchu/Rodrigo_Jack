// core/systems/tile_system.js
import { System } from './system.js';

/**
 * Paints the scenery - once each, not once a frame.
 *
 * A tile's appearance is decided when the map loads and never changes again:
 * same tileset, same cell, same size. Repainting it on every frame was writing
 * five style properties per tile, sixty times a second - on a map with 280 of
 * them that is 84,000 style mutations a second to draw a wall that is standing
 * perfectly still. It measured as the single most expensive system in the
 * solo game, and on a phone it was most of the reason the game stopped
 * responding.
 *
 * So each tile is painted the first time it is seen and then left alone. The
 * arena already worked this way (see VSRender.paintedTiles); this brings the
 * solo game into line with it.
 *
 * The tileset image loads asynchronously, hence painting only counts once the
 * component says it is ready - until then the tile is tried again next frame.
 */
export class TileSystem extends System {
    constructor() {
        super();
        this.painted = new Set(); // uuids of tiles already drawn
    }

    update() {
        this.entities.forEach(entity => {
            if (this.painted.has(entity.uuid)) return;

            const tile = entity.getComponent('tile');
            const visual = entity.getComponent('visual');

            if (!tile || !visual) return;

            tile.updateVisual(visual);
            if (tile.initialized) this.painted.add(entity.uuid);
        });
    }

    removeEntity(entity) {
        super.removeEntity(entity);
        // A level change tears the scenery down and builds it again; the next
        // map's tiles must not inherit this one's "already painted".
        this.painted.delete(entity.uuid);
    }
}
