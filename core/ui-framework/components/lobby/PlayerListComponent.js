/**
 * PlayerListComponent.js - Reactive player list for VS lobby
 *
 * Four slots, each either a human, a computer opponent, or open. The host can
 * fill an open slot with an AI of a chosen level, take one back out, and pick
 * the team layout for the match.
 */

import { h } from '../../ui-framework.js';
import { BOT_LEVELS, BOT_LEVEL_ORDER } from '../../../../constants/bot_constants.js';

const TEAM_MODES = [
  { id: 'ffa', label: 'Free-for-all', hint: 'Everyone for themselves' },
  { id: '2v2', label: '2 v 2', hint: 'Two a side' },
  { id: '3v1', label: '3 v 1', hint: 'Three against one' }
];

// Sides only mean anything once there are enough fighters to split.
const MIN_PLAYERS_FOR_TEAMS = 3;

/** Side badge. Meaningless in free-for-all, where everyone is their own team. */
function TeamBadge(player, teamMode) {
  if (!teamMode || teamMode === 'ffa') return null;
  if (player.team !== 1 && player.team !== 2) return null;
  return h('div', {
    className: `team-badge team-${player.team}`
  }, player.team === 1 ? 'LEFT' : 'RIGHT');
}

/**
 * A single slot: a human, a machine, or an invitation to add one.
 */
function PlayerSlot(player, isHost, currentPlayerId, state, actions) {
  const canManage = state.isHost;
  const canPickSides = canManage && (state.players || []).length >= MIN_PLAYERS_FOR_TEAMS;

  if (!player) {
    return h('div', { className: 'player-slot' },
      h('div', { className: 'player-status' }, 'Waiting for player...'),
      canManage
        ? h('button', {
            className: 'btn-slot-add',
            onclick: () => actions.addBot(state.botLevelChoice)
          }, '+ Add AI')
        : null
    );
  }

  const classes = ['player-slot', 'occupied'];
  if (isHost) classes.push('host');
  if (player.isBot) classes.push('bot');

  // The slot is tinted by side, so the split is readable at a glance rather
  // than only through the badge.
  if (player.team === 1 || player.team === 2) classes.push(`side-${player.team}`);
  if (canPickSides) classes.push('pickable');

  const isCurrentPlayer = player.id === currentPlayerId;
  const name = player.isBot
    ? `🤖 ${player.name}`
    : isCurrentPlayer ? `🏆 ${player.name} (You)` : player.name;

  const status = player.isBot
    ? (BOT_LEVELS[player.botLevel]?.label || 'Computer')
    : isHost
      ? `Host - ${player.ready ? 'Ready' : 'Not Ready'}`
      : player.ready ? 'Ready' : 'Not Ready';

  return h('div', {
      className: classes.join(' '),
      title: canPickSides ? 'Click to switch sides' : undefined,
      // Clicking swaps between the two sides. Anything else (a lone fighter
      // in free-for-all) joins the left side first.
      onclick: canPickSides
        ? () => actions.setPlayerTeam(player.id, player.team === 1 ? 2 : 1)
        : undefined
    },
    TeamBadge(player, state.teamMode),
    h('div', { className: 'player-name' }, name),
    h('div', { className: 'player-status' }, status),
    player.isBot && canManage
      ? h('button', {
          className: 'btn-slot-remove',
          onclick: (event) => {
            // Do not let the click also flip the slot's side.
            event.stopPropagation();
            actions.removeBot(player.id);
          }
        }, 'Remove')
      : null
  );
}

/** Which difficulty the next added opponent will have. */
function BotLevelPicker(state, actions) {
  if (!state.isHost) return null;
  const chosen = state.botLevelChoice || 'soldier';

  return h('div', { className: 'lobby-picker' },
    h('span', { className: 'lobby-picker-label' }, 'AI level'),
    h('div', { className: 'lobby-picker-options' },
      ...BOT_LEVEL_ORDER.map(id =>
        h('button', {
          className: `picker-option ${chosen === id ? 'selected' : ''}`,
          title: BOT_LEVELS[id].blurb,
          onclick: () => actions.chooseBotLevel(id)
        }, BOT_LEVELS[id].label)
      )
    )
  );
}

function TeamModePicker(state, actions) {
  if (!state.isHost) return null;
  const mode = state.teamMode || 'ffa';

  return h('div', { className: 'lobby-picker' },
    h('span', { className: 'lobby-picker-label' }, 'Teams'),
    h('div', { className: 'lobby-picker-options' },
      ...TEAM_MODES.map(entry =>
        h('button', {
          className: `picker-option ${mode === entry.id ? 'selected' : ''}`,
          title: entry.hint,
          onclick: () => actions.setTeams(entry.id)
        }, entry.label)
      )
    )
  );
}

/**
 * Player list component
 */
export function PlayerListComponent(state, actions = {}) {
  const { players = [], hostId = null, currentPlayerId = null } = state;

  // Ordered the same way the server assigns sides and the arena assigns
  // colours, so a slot means the same thing everywhere.
  const ordered = [...players].sort((a, b) => String(a.id).localeCompare(String(b.id)));

  const slots = Array(4).fill(null);
  ordered.forEach((player, index) => {
    if (index < 4) slots[index] = player;
  });

  const canPickSides = state.isHost && players.length >= MIN_PLAYERS_FOR_TEAMS;

  return h('div', { className: 'players-section' },
    h('h2', {}, `Players (${players.length}/4)`),
    BotLevelPicker(state, actions),
    TeamModePicker(state, actions),
    canPickSides
      ? h('div', { className: 'lobby-hint' }, 'Click a player to switch their side')
      : null,
    h('div', { className: 'players-grid' },
      ...slots.map(player =>
        PlayerSlot(player, player && player.id === hostId, currentPlayerId, state, actions)
      )
    )
  );
}
