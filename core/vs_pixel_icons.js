// core/vs_pixel_icons.js - Small things drawn a pixel at a time
//
// Hearts, arrows and a sight, written as pixel grids and turned into SVG.
//
// Grids rather than image files because these are read at a dozen pixels
// across: at that size an anti-aliased icon turns to mush, and a font glyph
// (a heart character, say) belongs to whatever typeface the browser picks.
// One rectangle per lit pixel with shape-rendering left crisp gives the same
// blocky edges as the sprites they sit next to, at any scale, with no asset to
// load and nothing to go missing.

/**
 * Turns a picture drawn in text into an SVG data URI.
 *
 * '#' is a lit pixel and anything else is clear, so the shapes below can be
 * read - and edited - as the things they are.
 */
function pixelSvg(rows, colour) {
    const height = rows.length;
    const width = Math.max(...rows.map(row => row.length));

    let body = '';
    rows.forEach((row, y) => {
        let x = 0;
        while (x < row.length) {
            if (row[x] !== '#') { x++; continue; }
            // Runs rather than single squares: a solid line of pixels becomes
            // one rectangle, which keeps the markup (and the URI) short.
            let run = 1;
            while (row[x + run] === '#') run++;
            body += `<rect x="${x}" y="${y}" width="${run}" height="1"/>`;
            x += run;
        }
    });

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" `
        + `shape-rendering="crispEdges" fill="${colour}">${body}</svg>`;

    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

const HEART = [
    '.##.##.',
    '#######',
    '#######',
    '.#####.',
    '..###..',
    '...#...'
];

/**
 * One arrow, standing up.
 *
 * Pointing up rather than along the shot: these sit above the fighter's head
 * as a tally of what is left in the quiver, and an arrow lying on its side
 * there read as a direction - as though the row were saying which way the bow
 * was aimed. Upright, it is plainly a count.
 *
 * Narrow on purpose too. A full quiver is seven of them over a 110px frame,
 * and the wide chevron made that row nearly as broad as the fighter himself.
 */
const ARROW = [
    '..#..',
    '.###.',
    '#####',
    '..#..',
    '..#..',
    '..#..',
    '..#..'
];

/**
 * A sight, not a dot.
 *
 * Four corner brackets around an empty middle: it says which way the shot
 * goes without covering the thing being aimed at.
 */
const RETICLE = [
    '##.....##',
    '#.......#',
    '.........',
    '.........',
    '....#....',
    '.........',
    '.........',
    '#.......#',
    '##.....##'
];

/**
 * A cup, not a medal - read as a trophy at a glance without needing the
 * handles that would not survive being drawn a dozen pixels wide anyway.
 * Tallies round wins on the scoreboard (see game_vs_simple.js).
 */
const TROPHY = [
    '.#####.',
    '#######',
    '#######',
    '.#####.',
    '..###..',
    '.#####.',
    '#######'
];

export const HEART_ASPECT = HEART[0].length / HEART.length;
export const ARROW_ASPECT = ARROW[0].length / ARROW.length;
export const TROPHY_ASPECT = TROPHY[0].length / TROPHY.length;

export function heartIcon(colour) {
    return pixelSvg(HEART, colour);
}

export function arrowIcon(colour) {
    return pixelSvg(ARROW, colour);
}

export function trophyIcon(colour) {
    return pixelSvg(TROPHY, colour);
}

export function reticleIcon(colour) {
    return pixelSvg(RETICLE, colour);
}

/**
 * The four weapons, as they appear on a phone's buttons.
 *
 * Drawn here with the hearts and the quiver rather than in the touch overlay,
 * because they are the same kind of thing solved the same way: read at forty
 * pixels across over a moving sprite, a pixel grid holds its edges where an
 * emoji glyph would neither match the artwork nor render the same on two
 * phones. Larger grids than the HUD's icons - a button is drawn a good deal
 * bigger than a heart - but the technique is identical.
 */

/** A blade at the diagonal, hilt low, the way the sprite holds it. */
const SWORD = [
    '.........##',
    '........###',
    '.......###.',
    '......###..',
    '.....###...',
    '....###....',
    '...###.....',
    '..###......',
    '#.###......',
    '####.......',
    '##.........'
];

/** A stave, its string, and an arrow on the string flying right. */
const BOW = [
    '..###......',
    '.#.#.#.....',
    '#..#..#....',
    '#..#...#...',
    '#..#....#..',
    '#..########',
    '#..#....#..',
    '#..#...#...',
    '#..#..#....',
    '.#.#.#.....',
    '..###......'
];

/** A wraith: a round head and a ragged hem, which is all a spirit needs. */
const GHOST = [
    '..####..',
    '.######.',
    '########',
    '##.##.##',
    '##.##.##',
    '########',
    '########',
    '########',
    '#.#..#.#'
];

/** An arrow up off a floor line: leaving the ground, not merely "up". */
const JUMP = [
    '...##...',
    '..####..',
    '.######.',
    '########',
    '.#.##.#.',
    '...##...',
    '........',
    '########',
    '########'
];

export function swordIcon(colour) {
    return pixelSvg(SWORD, colour);
}

export function bowIcon(colour) {
    return pixelSvg(BOW, colour);
}

export function ghostIcon(colour) {
    return pixelSvg(GHOST, colour);
}

export function jumpIcon(colour) {
    return pixelSvg(JUMP, colour);
}
