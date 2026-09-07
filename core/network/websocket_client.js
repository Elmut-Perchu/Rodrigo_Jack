/**
 * WebSocket Client for VS Mode
 * Handles real-time communication with Go server
 *
 * Phase 3 - Real WebSocket implementation
 */

/**
 * Per-tab session id identifying this player across the lobby -> arena
 * navigation, which closes the WebSocket.
 *
 * sessionStorage is deliberate: it survives navigation inside a tab but is
 * NOT shared between tabs. localStorage would hand every tab the same id, so
 * opening a second tab to test a 2-player match would make the newcomer
 * reclaim the first player's slot instead of joining as a second player.
 */
export function getVsSessionId() {
    const KEY = 'rodrigoJackVsSession';
    let id = null;
    try {
        id = sessionStorage.getItem(KEY);
    } catch (e) {
        // Storage unavailable (private mode) - fall through to a volatile id
    }
    if (!id) {
        id = 'sess_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
        try {
            sessionStorage.setItem(KEY, id);
        } catch (e) { /* non fatal */ }
    }
    return id;
}

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
        this.batchEnabled = false; // CRITICAL FIX: Disable batching - it was preventing player_state from reaching server!
        this.batchQueue = [];
        this.batchInterval = 16; // ~60fps (16ms)
        this.batchTimer = null;
        this.connected = false;

        // Message queue for early messages (before handlers registered)
        this.earlyMessageQueue = [];
        this.handlersReady = false;
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
                    // sessionId lets the arena page reclaim this exact slot
                    // after the lobby -> vs_game.html navigation closes this
                    // socket. It MUST match the id game_vs_simple.js reads.
                    this.send('lobby_join', {
                        roomCode: this.roomCode,
                        playerName: this.playerName,
                        sessionId: getVsSessionId()
                    }, false); // Don't batch

                    resolve({ success: true });
                };

                this.ws.onmessage = (event) => this._handleMessage(event);
                this.ws.onerror = (error) => {
                    console.error('🚨 [WebSocketClient] Connection error:', error);
                    console.error('🚨 [WebSocketClient] Error type:', error.type);
                    console.error('🚨 [WebSocketClient] Error message:', error.message);
                    reject(error);
                };
                this.ws.onclose = (event) => {
                    console.log('🔌 [WebSocketClient] Connection closed event:', {
                        code: event.code,
                        reason: event.reason,
                        wasClean: event.wasClean,
                        timestamp: new Date().toISOString()
                    });
                    this._handleClose(event);
                };

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
     * Mark handlers as ready and process queued messages
     * Called by NetworkSyncSystem after all handlers are registered
     */
    markHandlersReady() {
        if (this.handlersReady) {
            console.warn('[WebSocketClient] markHandlersReady() called multiple times');
            return;
        }

        console.log(`[WebSocketClient] Handlers ready, processing ${this.earlyMessageQueue.length} queued messages`);
        this.handlersReady = true;

        // Process all queued messages in order
        for (const message of this.earlyMessageQueue) {
            const handlers = this.messageHandlers.get(message.type);
            if (handlers) {
                console.log(`[WebSocketClient] Processing queued message: ${message.type}`);
                handlers.forEach(handler => handler(message.data));
            }
        }

        // Clear queue to free memory
        this.earlyMessageQueue = [];
        console.log('[WebSocketClient] Message queue processed and cleared');
    }

    /**
     * Handle incoming message
     * @private
     */
    _handleMessage(event) {
        try {
            const message = JSON.parse(event.data);
            console.log('[WebSocketClient] Received:', message);

            // DEBUG: Log handlersReady state for game_state_sync
            if (message.type === 'game_state_sync') {
                console.log('🔥 [WebSocketClient] game_state_sync received! handlersReady:', this.handlersReady);
            }

            // Queue messages if handlers not ready yet
            if (!this.handlersReady) {
                console.log('[WebSocketClient] Queueing early message:', message.type);
                this.earlyMessageQueue.push(message);

                // Prevent queue overflow (max 100 messages)
                if (this.earlyMessageQueue.length > 100) {
                    console.warn('[WebSocketClient] Message queue full, dropping oldest');
                    this.earlyMessageQueue.shift();
                }
                return;
            }

            const handlers = this.messageHandlers.get(message.type);
            if (handlers) {
                console.log(`[WebSocketClient] Routing ${message.type} to ${handlers.size} handler(s)`);
                handlers.forEach(handler => handler(message.data));
            } else {
                console.warn(`[WebSocketClient] No handler for message type: ${message.type}`);
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
    _handleClose(event) {
        console.log('🔌 [WebSocketClient] _handleClose called with event:', event);

        // Log close details
        if (event) {
            const closeReasons = {
                1000: 'Normal Closure',
                1001: 'Going Away',
                1002: 'Protocol Error',
                1003: 'Unsupported Data',
                1005: 'No Status Received',
                1006: 'Abnormal Closure (browser closed connection without close frame)',
                1007: 'Invalid frame payload data',
                1008: 'Policy Violation',
                1009: 'Message too big',
                1010: 'Missing Extension',
                1011: 'Internal Error',
                1015: 'TLS Handshake Failed'
            };

            console.log('🔌 [WebSocketClient] Close code:', event.code, '-', closeReasons[event.code] || 'Unknown');
            console.log('🔌 [WebSocketClient] Close reason:', event.reason || '(no reason provided)');
            console.log('🔌 [WebSocketClient] Was clean:', event.wasClean);
        }

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
