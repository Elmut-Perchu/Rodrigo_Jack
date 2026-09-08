// constants/vs_tileset.js - Choosing which tile to draw
//
// The arena used to draw every solid cell with tile (0,0), which is the
// top-left corner of a hollow stone frame: a light block with a dark bite out
// of one side. Repeated across a whole map it read as rows of arches with
// holes in them rather than as ground you can stand on.
//
// The sheet has proper pieces for this. They are not a full autotile blob set
// - the art is decorative, and its 3x3 frame has a hollow middle - but it does
// carry complete horizontal and vertical bars, which is exactly what an arena
// of one-tile-thick platforms and walls is made of.

/** Column and row of each piece in assets/sprites/Tileset_Base.png (32px). */
export const TILES = {
    // Solid stone bar running left to right. The workhorse: every platform
    // and every stretch of floor or ceiling is one of these three.
    barLeft: [0, 3],
    barMid: [1, 3],
    barRight: [2, 3],

    // The same bar stood on end, for the side walls.
    columnTop: [3, 0],
    columnMid: [3, 1],

    // A block with nowhere to continue to.
    block: [3, 3]
};

/**
 * Picks the piece that fits a cell, from what it is joined to.
 *
 * Horizontal is tested first because horizontal is what this arena is: floors,
 * ceilings and ledges all run left to right, and a cell that continues both
 * ways should read as part of that run even when something also sits above or
 * below it. Only a cell with no horizontal neighbour at all is treated as part
 * of a column.
 *
 * @param {boolean} west   solid cell to the left
 * @param {boolean} east   solid cell to the right
 * @param {boolean} north  solid cell above
 * @param {boolean} south  solid cell below
 * @returns {[number, number]} column and row in the tileset
 */
export function pickTile(west, east, north, south) {
    if (west && east) return TILES.barMid;
    if (east) return TILES.barLeft;
    if (west) return TILES.barRight;

    if (north && south) return TILES.columnMid;
    if (south) return TILES.columnTop;
    if (north) return TILES.columnMid;

    return TILES.block;
}
