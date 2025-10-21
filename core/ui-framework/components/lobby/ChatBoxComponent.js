/**
 * ChatBoxComponent.js - Reactive chat for VS lobby
 *
 * Features:
 * - Scrollable message history
 * - System and user messages
 * - Auto-scroll to bottom on new messages
 * - Input field with send button
 * - Enter key to send
 */

import { h } from '../../ui-framework.js';

/**
 * Chat message component
 * @param {Object} message - Message data
 * @param {string} message.type - 'system' or 'user'
 * @param {string} message.username - Username (for user messages)
 * @param {string} message.text - Message text
 * @param {number} message.timestamp - Message timestamp
 */
function ChatMessage(message) {
  if (message.type === 'system') {
    return h('div', { className: 'chat-message' },
      h('span', { className: 'system' }, `System: ${message.text}`)
    );
  }

  return h('div', { className: 'chat-message' },
    h('span', { className: 'username' }, `${message.username}: `),
    h('span', {}, message.text)
  );
}

/**
 * Chat box component
 * @param {Object} state - Framework state
 * @param {Array} state.chatMessages - Array of message objects
 * @param {Function} actions.sendChatMessage - Action to send a message
 * @returns {VNode} Virtual DOM node
 */
export function ChatBoxComponent(state, actions) {
  const { chatMessages = [] } = state;

  // Handle send button click
  const handleSend = () => {
    const input = document.getElementById('chat-input');
    if (input && input.value.trim()) {
      actions.sendChatMessage(input.value.trim());
      input.value = '';
    }
  };

  // Handle Enter key in input
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleSend();
    }
  };

  return h('div', { className: 'chat-section' },
    h('h2', {}, 'Chat'),
    h('div', {
      className: 'chat-messages',
      id: 'chat-messages'
    },
      ...chatMessages.map(ChatMessage)
    ),
    h('div', { className: 'chat-input-container' },
      h('input', {
        type: 'text',
        className: 'chat-input',
        id: 'chat-input',
        placeholder: 'Type a message...',
        maxLength: 100,
        onkeydown: handleKeyDown
      }),
      h('button', {
        className: 'chat-send-btn',
        id: 'chat-send',
        onclick: handleSend
      }, 'Send')
    )
  );
}

/**
 * Utility to auto-scroll chat to bottom
 * Call this after messages update
 */
export function scrollChatToBottom() {
  const chatMessages = document.getElementById('chat-messages');
  if (chatMessages) {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
}
