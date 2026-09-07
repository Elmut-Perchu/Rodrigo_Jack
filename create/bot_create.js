// create/bot_create.js - Computer-controlled fighter factory
import { createRemotePlayer } from './remote_player_create.js';
import { BotInput } from '../core/components/bot_input_component.js';
import { Bot } from '../core/components/bot_component.js';
import { BowState } from '../core/components/bow_state_component.js';
import { SpectreState } from '../core/components/spectre_state_component.js';
import { getBotLevel, BOT_NAMES, DEFAULT_BOT_LEVEL } from '../constants/bot_constants.js';

/**
 * Builds an AI opponent.
 *
 * A bot is a remote player that happens to be simulated on this machine: same
 * sprite, same hitbox, same components. The two differences are the input
 * (a BotInput nobody types on) and the `simulated` flag, which tells the
 * physics systems to run gravity and collision on it instead of interpolating
 * a stream of positions that will never arrive.
 */
export function createBot({ x, y, playerId, levelId = DEFAULT_BOT_LEVEL, name }, playerIndex = 1) {
    const level = getBotLevel(levelId);
    const displayName = name || BOT_NAMES[level.id] || 'Computer';

    const entity = createRemotePlayer({
        x,
        y,
        playerId,
        playerName: displayName
    }, playerIndex);

    const networkPlayer = entity.getComponent('networkPlayer');
    if (networkPlayer) {
        networkPlayer.isBot = true;
        networkPlayer.simulated = true; // Physics runs here, not over the wire
    }

    // Keyboard-shaped, driven by VSBot
    entity.addComponent('input', new BotInput());
    entity.addComponent('bot', new Bot(level.id));

    // Its own quiver: arrows must be spent and fetched like anyone else's
    entity.addComponent('bow_state', new BowState());

    // And its own spirit gauge, filled at the same rate and spent the same
    // way. A bot that could not answer a spectre would make the third weapon
    // a one-sided advantage against the computer.
    entity.addComponent('spectre_state', new SpectreState());

    const property = entity.getComponent('property');
    if (property) {
        property.type = 'bot_player';
        // Difficulty partly shows in raw footspeed, so a Rookie can be
        // outrun and a Master cannot.
        property.speed = Math.round(450 * level.speedFactor);
    }

    // Positions come from local physics, never from an interpolation buffer.
    const interpolation = entity.getComponent('interpolation');
    if (interpolation) interpolation.enabled = false;

    const nickname = entity.getComponent('nickname');
    if (nickname) nickname.text = displayName;

    console.log(`[Bot] Created ${displayName} (${level.label}) at (${x}, ${y})`);

    return entity;
}
