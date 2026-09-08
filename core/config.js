// core/config.js - Backend URLs for VS mode and the score API
//
// Render's free tier serves each service at https://<service-name>.onrender.com.
// The service names below are the ones pinned in render.yaml at the repo
// root, so they only need to change here if that blueprint is renamed.
// Localhost is auto-detected so the local dev workflow (python3 -m
// http.server + go run) keeps working unchanged.

const isLocal = ['localhost', '127.0.0.1', ''].includes(window.location.hostname);

export const WS_SERVER_URL = isLocal
    ? 'ws://localhost:8080/ws'
    : 'wss://rodrigo-jack-vs-server.onrender.com/ws';

export const SCORE_API_URL = isLocal
    ? 'http://localhost:8081/api/scores'
    : 'https://rodrigo-jack-score-api.onrender.com/api/scores';
