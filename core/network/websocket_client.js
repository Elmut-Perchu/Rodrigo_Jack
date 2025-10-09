/**
 * WebSocket Client for VS Mode
 * Handles real-time communication with Go server
 *
 * Phase 1 Day 2 - Placeholder
 * Will be implemented in Phase 2
 */

export class WebSocketClient {
    constructor() {
        this.ws = null;
        this.serverUrl = 'ws://localhost:8080/ws';
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 3000;
        this.messageHandlers = new Map();
    }

    /**
     * Connect to WebSocket server
     * @param {string} roomCode - Room to join
     * @param {string} playerName - Player display name
     */
    connect(roomCode, playerName) {
        console.log(`[WebSocketClient] Connecting to ${this.serverUrl}...`);

        // Placeholder - will implement actual WebSocket connection in Phase 2
        console.log(`[WebSocketClient] Room: ${roomCode}, Player: ${playerName}`);
        console.log('[WebSocketClient] Connection will be implemented in Phase 2');

        return new Promise((resolve, reject) => {
            // Simulate successful connection for placeholder
            setTimeout(() => {
                console.log('[WebSocketClient] Placeholder connection successful');
                resolve({
                    success: true,
                    message: 'Placeholder mode - no actual server connection'
                });
            }, 100);
        });
    }

    /**
     * Disconnect from server
     */
    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
            console.log('[WebSocketClient] Disconnected');
        }
    }

    /**
     * Send message to server
     * @param {string} type - Message type
     * @param {Object} data - Message payload
     */
    send(type, data) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            console.warn('[WebSocketClient] Cannot send - not connected');
            return false;
        }

        const message = {
            type,
            data,
            timestamp: Date.now()
        };

        console.log('[WebSocketClient] Sending:', message);
        this.ws.send(JSON.stringify(message));
        return true;
    }

    /**
     * Register message handler
     * @param {string} type - Message type to handle
     * @param {Function} handler - Handler function
     */
    on(type, handler) {
        if (!this.messageHandlers.has(type)) {
            this.messageHandlers.set(type, []);
        }
        this.messageHandlers.get(type).push(handler);
        console.log(`[WebSocketClient] Handler registered for: ${type}`);
    }

    /**
     * Unregister message handler
     * @param {string} type - Message type
     * @param {Function} handler - Handler function to remove
     */
    off(type, handler) {
        if (this.messageHandlers.has(type)) {
            const handlers = this.messageHandlers.get(type);
            const index = handlers.indexOf(handler);
            if (index !== -1) {
                handlers.splice(index, 1);
                console.log(`[WebSocketClient] Handler removed for: ${type}`);
            }
        }
    }

    /**
     * Handle incoming message
     * @private
     */
    _handleMessage(event) {
        try {
            const message = JSON.parse(event.data);
            console.log('[WebSocketClient] Received:', message);

            const handlers = this.messageHandlers.get(message.type);
            if (handlers) {
                handlers.forEach(handler => handler(message.data));
            }
        } catch (error) {
            console.error('[WebSocketClient] Error handling message:', error);
        }
    }

    /**
     * Handle WebSocket error
     * @private
     */
    _handleError(error) {
        console.error('[WebSocketClient] Error:', error);
    }

    /**
     * Handle WebSocket close
     * @private
     */
    _handleClose() {
        console.log('[WebSocketClient] Connection closed');

        // Attempt reconnect if not max attempts reached
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`[WebSocketClient] Reconnecting... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

            setTimeout(() => {
                this.connect();
            }, this.reconnectDelay);
        } else {
            console.error('[WebSocketClient] Max reconnect attempts reached');
        }
    }

    /**
     * Get connection status
     * @returns {string} - Connection status
     */
    getStatus() {
        if (!this.ws) return 'disconnected';

        switch (this.ws.readyState) {
            case WebSocket.CONNECTING:
                return 'connecting';
            case WebSocket.OPEN:
                return 'connected';
            case WebSocket.CLOSING:
                return 'closing';
            case WebSocket.CLOSED:
                return 'closed';
            default:
                return 'unknown';
        }
    }
}
