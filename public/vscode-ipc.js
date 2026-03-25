/**
 * vscode-ipc.js
 *
 * Thin wrapper around VS Code's acquireVsCodeApi() message-passing API.
 * This is the ONLY file allowed to call acquireVsCodeApi().
 *
 * Replaces WebSocketClient from Tau. All messages go through VS Code IPC,
 * not a WebSocket. The API is intentionally similar to Tau's wsClient so
 * app.js stays familiar.
 *
 * Usage:
 *   import { VscodeIPC } from './vscode-ipc.js';
 *   VscodeIPC.send({ type: 'prompt', text: 'Hello' });
 *   VscodeIPC.on('pi_event', (msg) => { ... });
 *   VscodeIPC.on('sync', (msg) => { ... });
 */

// acquireVsCodeApi() can only be called ONCE per webview lifetime.
// Calling it again throws. Store the result.
const vscode = acquireVsCodeApi();

// Map of message type → array of handlers
const handlers = {};

// Route all incoming messages from the extension host
window.addEventListener('message', (event) => {
  const message = event.data;
  if (!message || !message.type) return;

  const typeHandlers = handlers[message.type];
  if (typeHandlers) {
    for (const handler of typeHandlers) {
      handler(message);
    }
  }

  // Also fire wildcard listeners registered with type '*'
  const wildcards = handlers['*'];
  if (wildcards) {
    for (const handler of wildcards) {
      handler(message);
    }
  }
});

export const VscodeIPC = {
  /**
   * Send a message from the webview to the extension host.
   * @param {object} message - Must have a `type` field.
   */
  send(message) {
    vscode.postMessage(message);
  },

  /**
   * Register a handler for a specific message type received from the extension host.
   * Use type '*' to listen to ALL messages.
   * @param {string} type - Message type (e.g. 'pi_event', 'sync', 'editor_context')
   * @param {function} handler - Called with the full message object
   * @returns {function} unsubscribe — call to remove the handler
   */
  on(type, handler) {
    if (!handlers[type]) handlers[type] = [];
    handlers[type].push(handler);
    return () => {
      handlers[type] = handlers[type].filter((h) => h !== handler);
    };
  },
};
