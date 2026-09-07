// core/systems_vs/vs_sparks.js - Pixel spark burst for blade clashes

/**
 * Throws a short burst of square pixels outward from a point.
 *
 * Deliberately built from plain divs animated with the Web Animations API
 * rather than a spritesheet: the effect is a handful of 4px squares, and it
 * matches the game's pixel look without adding an asset or a particle system.
 *
 * The sparks live in the same .game-world as everything else, so they sit in
 * arena coordinates and scale with the stage.
 */
export function spawnSparks(x, y, options = {}) {
    const world = document.querySelector('.game-world');
    if (!world) return;

    // Sized for the scaled-down stage: the arena is rendered smaller than its
    // 1536x896 coordinate space, so 3px pixels came out as barely visible
    // specks. These numbers are in arena units, before that scaling.
    const count = options.count ?? 20;
    const colors = options.colors ?? ['#ffffff', '#fff3b0', '#ffd23f', '#ff9505'];
    const spread = options.spread ?? 110;  // px travelled by the fastest spark
    const life = options.life ?? 460;      // ms

    for (let i = 0; i < count; i++) {
        const pixel = document.createElement('div');
        const size = 5 + Math.floor(Math.random() * 5);

        pixel.style.cssText = `
            position: absolute;
            left: ${x}px;
            top: ${y}px;
            width: ${size}px;
            height: ${size}px;
            background: ${colors[Math.floor(Math.random() * colors.length)]};
            box-shadow: 0 0 6px rgba(255, 214, 102, 0.9);
            image-rendering: pixelated;
            pointer-events: none;
            z-index: 400;
        `;
        world.appendChild(pixel);

        // Bias the spread sideways: two blades meeting throw sparks out along
        // the line of contact rather than in a neat circle.
        const angle = (Math.random() * Math.PI * 2);
        const distance = spread * (0.35 + Math.random() * 0.65);
        const dx = Math.cos(angle) * distance * 1.4;
        const dy = Math.sin(angle) * distance * 0.7 - 12; // slight upward lift

        const duration = life * (0.6 + Math.random() * 0.4);

        const animation = pixel.animate(
            [
                { transform: 'translate(0, 0) scale(1)', opacity: 1 },
                { transform: `translate(${dx * 0.6}px, ${dy * 0.6}px) scale(1)`, opacity: 1, offset: 0.5 },
                { transform: `translate(${dx}px, ${dy + 26}px) scale(0.4)`, opacity: 0 }
            ],
            { duration, easing: 'cubic-bezier(0.15, 0.7, 0.4, 1)' }
        );

        animation.onfinish = () => pixel.remove();
    }

    // Brief flash at the point of contact
    const flash = document.createElement('div');
    flash.style.cssText = `
        position: absolute;
        left: ${x - 30}px;
        top: ${y - 30}px;
        width: 60px;
        height: 60px;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(255,255,235,1) 0%, rgba(255,214,80,0.6) 40%, transparent 72%);
        pointer-events: none;
        z-index: 399;
    `;
    world.appendChild(flash);
    flash.animate(
        [{ opacity: 1, transform: 'scale(0.6)' }, { opacity: 0, transform: 'scale(1.8)' }],
        { duration: 220, easing: 'ease-out' }
    ).onfinish = () => flash.remove();
}
