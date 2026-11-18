class WebSocketService {
  constructor() {
    this.ws = null;
    this.listeners = new Map();
    this.reconnectAttempts = 0;
    this.maxReconnectDelay = 10000;
    this.reconnectTimer = null;
    this.pingTimer = null;
    this.currentConvId = null;
    this.currentToken = null;
    this.isConnected = false;
  }

  getWsUrl(token) {
    const encodedToken = encodeURIComponent(token || '');

    // 1. Explicit WebSocket URL
    const env = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : {};
    if (env.VITE_WS_URL) {
      const base = env.VITE_WS_URL.replace(/\/+$/, '');
      return `${base}/ws/chat/?token=${encodedToken}`;
    }

    // 2. Derive from API Base URL (e.g. https://<backend>.onrender.com -> wss://<backend>.onrender.com/ws/chat/)
    const apiUrl = env.VITE_API_URL;
    if (apiUrl && typeof apiUrl === 'string' && apiUrl.startsWith('http')) {
      const wsBase = apiUrl
        .replace(/^http:\/\//i, 'ws://')
        .replace(/^https:\/\//i, 'wss://')
        .replace(/\/+$/, '');
      return `${wsBase}/ws/chat/?token=${encodedToken}`;
    }

    // 3. Fallback for local development or same-host deployments
    const host = window.location.hostname || '127.0.0.1';
    const isDev = host === 'localhost' || host === '127.0.0.1';
    const port = isDev ? ':8000' : (window.location.port ? `:${window.location.port}` : '');
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${host}${port}/ws/chat/?token=${encodedToken}`;
  }

  connect(token) {
    if (!token) return;

    // Prevent duplicate WebSocket connections during authentication
    if (this.currentToken === token && this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    // Cancel any pending reconnect timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // Cleanly close any existing socket if switching tokens
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }

    this.currentToken = token;
    const wsUrl = this.getWsUrl(token);

    try {
      this.ws = new WebSocket(wsUrl);
    } catch (err) {
      console.error('WebSocket connection error:', err);
      this.scheduleReconnect(token);
      return;
    }

    this.ws.onopen = () => {
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.emit('connection_status', { isConnected: true });

      // Start ping heartbeat every 30s
      this.startHeartbeat();

      // Re-join current conversation if any
      if (this.currentConvId) {
        this.send({ type: 'join_conversation', conversation_id: this.currentConvId });
      }
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.emit(data.type, data);
      } catch (e) {
        console.error('Error parsing WS message:', e);
      }
    };

    this.ws.onclose = (event) => {
      this.isConnected = false;
      this.stopHeartbeat();
      this.emit('connection_status', { isConnected: false, code: event.code });

      if (event.code !== 4001) {
        this.scheduleReconnect(token);
      } else {
        this.currentToken = null;
      }
    };

    this.ws.onerror = (err) => {
      console.warn('WebSocket error:', err);
    };
  }

  scheduleReconnect(token) {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    const baseDelay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), this.maxReconnectDelay);
    // Add jitter (±20%) to prevent thundering herd problems on network reconnect
    const jitter = baseDelay * (0.8 + Math.random() * 0.4);
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => {
      const activeToken = token || this.currentToken || (typeof localStorage !== 'undefined' ? localStorage.getItem('lynqo_token') : null);
      if (activeToken) {
        this.connect(activeToken);
      }
    }, jitter);
  }

  startHeartbeat() {
    this.stopHeartbeat();
    this.pingTimer = setInterval(() => {
      if (this.isConnected && this.ws?.readyState === WebSocket.OPEN) {
        this.send({ type: 'ping' });
      }
    }, 30000);
  }

  stopHeartbeat() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
      return true;
    }
    return false;
  }

  joinConversation(convId) {
    this.currentConvId = convId;
    this.send({ type: 'join_conversation', conversation_id: convId });
  }

  leaveConversation(convId) {
    if (this.currentConvId === convId) {
      this.currentConvId = null;
    }
    this.send({ type: 'leave_conversation', conversation_id: convId });
  }

  sendMessage(convId, content, clientMessageId) {
    return this.send({
      type: 'chat_message',
      conversation_id: convId,
      content,
      client_message_id: clientMessageId,
    });
  }

  sendTyping(convId, isTyping) {
    return this.send({
      type: 'typing',
      conversation_id: convId,
      is_typing: isTyping,
    });
  }

  markDelivered(convId, messageIds) {
    if (!convId || !messageIds) return false;
    const ids = Array.isArray(messageIds) ? messageIds : [messageIds];
    if (ids.length === 0) return false;
    return this.send({
      type: 'mark_delivered',
      conversation_id: convId,
      message_ids: ids,
    });
  }

  markSeen(convId) {
    return this.send({
      type: 'mark_seen',
      conversation_id: convId,
    });
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
    return () => this.off(event, callback);
  }

  off(event, callback) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(callback);
    }
  }

  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach((cb) => {
        try {
          cb(data);
        } catch (e) {
          console.error(`Error in WS event listener for ${event}:`, e);
        }
      });
    }
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    this.currentToken = null;
    this.isConnected = false;
    this.currentConvId = null;
  }
}

export const wsService = new WebSocketService();
export default wsService;
