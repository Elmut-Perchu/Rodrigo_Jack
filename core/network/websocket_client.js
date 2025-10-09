/**
 * WebSocket Client for VS Mode
 * Handles real-time communication with Go server
 *
 * Phase 3 - Real WebSocket implementation
 */

export class WebSocketClient {
    constructor() {
        this.ws = null;
        this.serverUrl = 'ws://localhost:8080/ws';
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 3000;
        this.messageHandlers = new Map();
        this.roomCode = null;
        this.playerName = null;

        // Message batching for performance
        this.batchEnabled = true;
        this.batchQueue = [];
        this.batchInterval = 16; // ~60fps (16ms)
        this.batchTimer = null;
        this.connected = false;
    }

    /**
     * Connect to WebSocket server
     * @param {string} roomCode - Room to join
     * @param {string} playerName - Player display name
     */
    connect(roomCode, playerName) {
        this.roomCode = roomCode;
        this.playerName = playerName;

        console.log(`[WebSocketClient] Connecting to ${this.serverUrl}...`);
        console.log(`[WebSocketClient] Room: ${roomCode}, Player: ${playerName}`);

        return new Promise((resolve, reject) => {
            try {
                this.ws = new WebSocket(this.serverUrl);

                this.ws.onopen = () => {
                    console.log('[WebSocketClient] Connected successfully');
                    this.reconnectAttempts = 0;
                    this.connected = true;

                    // Start batch timer
                    if (this.batchEnabled) {
                        this.startBatchTimer();
                    }

                    // Send lobby_join message (immediate, not batched)
                    this.send('lobby_join', {
                        roomCode: this.roomCode,
                        playerName: this.playerName
                    }, false); // Don't batch

                    resolve({ success: true });
                };

                this.ws.onmessage = (event) => this._handleMessage(event);
                this.ws.onerror = (error) => {
                    console.error('[WebSocketClient] Connection error:', error);
                    reject(error);
                };
                this.ws.onclose = () => this._handleClose();

            } catch (error) {
                console.error('[WebSocketClient] Failed to create WebSocket:', error);
                reject(error);
            }
        });
    }

    /**
     * Disconnect from server
     */
    disconnect() {
        // Stop batch timer
        if (this.batchTimer) {
            clearInterval(this.batchTimer);
            this.batchTimer = null;
        }

        // Flush remaining batched messages
        this.flushBatch();

        if (this.ws) {
            this.ws.close();
            this.ws = null;
            this.connected = false;
            console.log('[WebSocketClient] Disconnected');
        }
    }

    /**
     * Send message to server
     * @param {string} type - Message type
     * @param {Object} data - Message payload
     * @param {boolean} batch - Whether to batch this message (default: true for player_state)
     */
    send(type, data, batch = null) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            console.warn('[WebSocketClient] Cannot send - not connected');
            return false;
        }

        const message = {
            type,
            data,
            timestamp: Date.now()
        };

        // Auto-detect batching for player_state messages
        if (batch === null) {
            batch = (type === 'player_state') && this.batchEnabled;
        }

        if (batch && this.batchEnabled) {
            // Add to batch queue
            this.batchQueue.push(message);
            return true;
        } else {
            // Send immediately
            console.log('[WebSocketClient] Sending:', message);
            this.ws.send(JSON.stringify(message));
            return true;
        }
    }

    /**
     * Start batch timer
     * @private
     */
    startBatchTimer() {
        if (this.batchTimer) return;

        this.batchTimer = setInterval(() => {
            this.flushBatch();
        }, this.batchInterval);

        console.log('[WebSocketClient] Message batching enabled (interval: ' + this.batchInterval + 'ms)');
    }

    /**
     * Flush batched messages
     * @private
     */
    flushBatch() {
        if (this.batchQueue.length === 0) return;

        // Only keep the latest player_state message (discard older ones)
        const latestPlayerState = this.batchQueue.filter(m => m.type === 'player_state').pop();
        const otherMessages = this.batchQueue.filter(m => m.type !== 'player_state');

        // Combine messages
        const messages = otherMessages;
        if (latestPlayerState) {
            messages.push(latestPlayerState);
        }

        // Send each message
        for (const message of messages) {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify(message));
            }
        }

        // Clear queue
        this.batchQueue = [];
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
        if (this.reconnectAttempts < this.maxReconnectAttempts && this.roomCode && this.playerName) {
            this.reconnectAttempts++;
            console.log(`[WebSocketClient] Reconnecting... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

            setTimeout(() => {
                this.connect(this.roomCode, this.playerName);
            }, this.reconnectDelay);
        } else {
            console.error('[WebSocketClient] Max reconnect attempts reached or no room info');
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
