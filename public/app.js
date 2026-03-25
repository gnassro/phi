/**
 * app.js — Phi Webview Main Coordinator
 *
 * Adapted from Tau's app.js. Key differences:
 *   - NO WebSocket. All communication via VscodeIPC (VS Code IPC).
 *   - NO session sidebar (session list is embedded in the panel UI).
 *   - Adds "editor context" handling (active file, selection, diagnostics from VS Code).
 *   - Adds "prefill_input" message handler (for Ask About Selection command).
 *
 * Responsibilities:
 *   - Initialize ChatInput, MessageRenderer
 *   - Wire VscodeIPC message handlers → correct renderers
 *   - Handle Pi streaming events (same logic as Tau's handleRPCEvent)
 *   - Manage pendingImages (file attachments)
 *   - Manage message queue (when user sends while Pi is streaming)
 *   - Manage typing indicator
 *   - Manage send/abort button visibility
 */

import { VscodeIPC } from './vscode-ipc.js';
import { ChatInput } from './chat-input.js';
import { MessageRenderer } from './message-renderer.js';

// ─── DOM refs ─────────────────────────────────────────────────────────────────

const messagesEl = document.getElementById('messages');
const sendBtn = document.getElementById('send-btn');
const abortBtn = document.getElementById('abort-btn');
const typingIndicator = document.getElementById('typing-indicator');
const typingTextEl = document.getElementById('typing-text');
const imagePreviews = document.getElementById('image-previews');
const queuedMessagesEl = document.getElementById('queued-messages');
const imageInput = document.getElementById('image-input');
const attachBtn = document.getElementById('attach-btn');

// ─── Core instances ───────────────────────────────────────────────────────────

const messageRenderer = new MessageRenderer(messagesEl);

const chatInput = new ChatInput('message-input', 'chat-form', (text) => {
  sendMessage(text);
});

// ─── App state ────────────────────────────────────────────────────────────────

let isStreaming = false;
let currentStreamingEl = null;   // The DOM element being streamed into
let currentThinking = '';        // Accumulated thinking text during stream
let currentText = '';            // Accumulated text during stream
let lastSentMessage = '';        // To avoid duplicate rendering from server echo
let pendingImages = [];          // { data: base64, mimeType: string }[]
let messageQueue = [];           // Cmds queued while streaming

// ─── Image attachment ─────────────────────────────────────────────────────────

attachBtn?.addEventListener('click', () => imageInput?.click());

imageInput?.addEventListener('change', async (e) => {
  const files = Array.from(e.target.files || []);
  for (const file of files) {
    const img = await processImageFile(file);
    if (img) pendingImages.push(img);
  }
  imageInput.value = '';
  renderImagePreviews();
});

chatInput.onImagePaste = async (files) => {
  for (const file of files) {
    const img = await processImageFile(file);
    if (img) pendingImages.push(img);
  }
  renderImagePreviews();
};

function processImageFile(file) {
  return new Promise((resolve) => {
    // Cap at 5MB
    if (file.size > 5 * 1024 * 1024) {
      console.warn('[Phi] Image too large (>5MB), skipped:', file.name);
      resolve(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target.result;
      // Strip the "data:mime;base64," prefix — SDK wants raw base64
      const base64 = dataUrl.replace(/^data:[^;]+;base64,/, '');
      resolve({ data: base64, mimeType: file.type || 'image/png' });
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

function renderImagePreviews() {
  imagePreviews.innerHTML = '';
  if (pendingImages.length === 0) {
    imagePreviews.classList.add('hidden');
    return;
  }
  imagePreviews.classList.remove('hidden');
  pendingImages.forEach((img, i) => {
    const el = document.createElement('div');
    el.className = 'image-preview-item';
    el.innerHTML = `
      <img src="data:${img.mimeType};base64,${img.data}" alt="Attached image">
      <button class="image-preview-remove" aria-label="Remove image">×</button>
    `;
    el.querySelector('.image-preview-remove').addEventListener('click', () => {
      pendingImages.splice(i, 1);
      renderImagePreviews();
    });
    imagePreviews.appendChild(el);
  });
}

// ─── Send message ─────────────────────────────────────────────────────────────

function sendMessage(text) {
  // Guard against Event objects being passed (e.g. from form submit)
  const message = typeof text === 'string' ? text : chatInput.getText();
  if (!message && pendingImages.length === 0) return;

  chatInput.clear();

  const cmd = { type: 'prompt', message };

  if (pendingImages.length > 0) {
    cmd.images = pendingImages.map((img) => ({
      type: 'image',
      data: img.data,
      mimeType: img.mimeType || 'image/png',
    }));
    pendingImages = [];
    renderImagePreviews();
  }

  if (isStreaming) {
    // Queue it — show the user their message is pending
    messageQueue.push(cmd);
    lastSentMessage = message;
    renderQueuedMessages();
    return;
  }

  lastSentMessage = message;
  messageRenderer.renderUserMessage({ content: message, images: cmd.images });
  VscodeIPC.send(cmd);
}

// ─── Queued messages ──────────────────────────────────────────────────────────

function renderQueuedMessages() {
  queuedMessagesEl.innerHTML = '';
  if (messageQueue.length === 0) {
    queuedMessagesEl.classList.add('hidden');
    return;
  }
  queuedMessagesEl.classList.remove('hidden');
  messageQueue.forEach((cmd, i) => {
    const el = document.createElement('div');
    el.className = 'queued-msg';
    el.innerHTML = `
      <span class="queued-msg-label">Queued</span>
      <span class="queued-msg-text">${escapeHtml(cmd.message)}${cmd.images?.length ? ' <span style="opacity:0.6;font-size:10px">📎 image</span>' : ''}</span>
      <button class="queued-msg-cancel" title="Cancel">×</button>
    `;
    el.querySelector('.queued-msg-cancel').addEventListener('click', () => {
      messageQueue.splice(i, 1);
      renderQueuedMessages();
    });
    queuedMessagesEl.appendChild(el);
  });
}

function flushQueue() {
  if (messageQueue.length === 0) return;
  const next = messageQueue.shift();
  renderQueuedMessages();
  messageRenderer.renderUserMessage({ content: next.message, images: next.images });
  VscodeIPC.send(next);
}

// ─── Pi event handler ─────────────────────────────────────────────────────────

/**
 * Handle a raw AgentSessionEvent forwarded from the extension host.
 * Logic mirrors Tau's handleRPCEvent() exactly.
 */
function handlePiEvent(event) {
  switch (event.type) {
    case 'agent_start':
      setStreaming(true, 'Thinking');
      break;

    case 'agent_end':
      setStreaming(false);
      flushQueue();
      break;

    case 'message_start': {
      const msg = event.message;
      if (msg?.role === 'user') {
        // Avoid duplicating a message the user already saw rendered
        const content = typeof msg.content === 'string'
          ? msg.content
          : (msg.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
        if (content === lastSentMessage) {
          lastSentMessage = '';
          break;
        }
        const images = Array.isArray(msg.content)
          ? msg.content.filter((b) => b.type === 'image').map((b) => ({
              data: b.source?.data ?? '',
              mimeType: b.source?.mediaType ?? 'image/png',
            }))
          : [];
        messageRenderer.renderUserMessage({ content, images }, true);
      } else if (msg?.role === 'assistant') {
        currentStreamingEl = messageRenderer.renderAssistantMessage(msg, true);
        currentThinking = '';
        currentText = '';
      }
      break;
    }

    case 'message_update': {
      const ev = event.assistantMessageEvent;
      if (!ev) break;
      if (ev.type === 'text_delta') {
        currentText += ev.delta;
        if (currentStreamingEl) {
          messageRenderer.updateStreamingMessage(currentStreamingEl, currentText);
        }
      } else if (ev.type === 'thinking_delta') {
        currentThinking += ev.delta;
        if (currentStreamingEl) {
          messageRenderer.updateStreamingThinking(currentStreamingEl, currentThinking);
        }
      }
      break;
    }

    case 'message_end': {
      const msg = event.message;
      if (currentStreamingEl) {
        messageRenderer.finalizeStreamingMessage(
          currentStreamingEl,
          msg?.usage ?? null,
          currentThinking
        );
        currentStreamingEl = null;
        currentThinking = '';
        currentText = '';
      }
      break;
    }

    case 'tool_execution_start':
      showTypingIndicator(true, `Working (${event.toolName})`);
      break;

    case 'tool_execution_end':
      showTypingIndicator(true, 'Thinking');
      break;

    case 'auto_compaction_start':
      messageRenderer.renderSystemMessage('⟳ Compacting context…');
      break;

    case 'auto_compaction_end':
      messageRenderer.renderSystemMessage(
        `✓ Context compacted${event.summary ? ` — ${event.summary}` : ''}`
      );
      break;

    default:
      break;
  }
}

// ─── Sync handler ─────────────────────────────────────────────────────────────

/**
 * Handle a full state snapshot from the extension host.
 * Clears the message area and rebuilds from the session's message history.
 */
function handleSync(state) {
  messageRenderer.clear();

  if (state.entries && state.entries.length > 0) {
    renderHistory(state.entries);
  } else {
    messageRenderer.renderWelcome();
  }

  setStreaming(state.isStreaming, 'Thinking');
}

function renderHistory(entries) {
  for (const entry of entries) {
    if (entry.type !== 'message') continue;
    const msg = entry.message;
    if (!msg) continue;

    if (msg.role === 'user') {
      const content = typeof msg.content === 'string'
        ? msg.content
        : (msg.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
      const images = Array.isArray(msg.content)
        ? msg.content.filter((b) => b.type === 'image').map((b) => ({
            data: b.source?.data ?? '',
            mimeType: b.source?.mediaType ?? 'image/png',
          }))
        : [];
      messageRenderer.renderUserMessage({ content, images }, true);
    } else if (msg.role === 'assistant') {
      messageRenderer.renderAssistantMessage(msg, false, true);
    }
  }
}

// ─── Editor context handler ───────────────────────────────────────────────────

/**
 * Handle editor context pushed from the extension host.
 * Shows/hides the "active file" status bar and stores context for prompt enrichment.
 */
let currentEditorContext = null;

function handleEditorContext(context) {
  currentEditorContext = context;
  // Future: render a small "current file" chip above the input
  // For now, just store it so it can be injected into prompts if needed
}

// ─── Typing indicator ─────────────────────────────────────────────────────────

function showTypingIndicator(show, text = 'Thinking') {
  if (typingTextEl) typingTextEl.textContent = text;
  if (show && typingIndicator) {
    messagesEl.appendChild(typingIndicator); // always last child
  }
  if (typingIndicator) {
    typingIndicator.classList.toggle('hidden', !show);
  }
  if (show) messageRenderer.scrollToBottom();
}

// ─── Streaming state ──────────────────────────────────────────────────────────

function setStreaming(streaming, indicatorText = 'Thinking') {
  isStreaming = streaming;
  sendBtn.classList.toggle('hidden', streaming);
  abortBtn.classList.toggle('hidden', !streaming);
  showTypingIndicator(streaming, indicatorText);
}

// ─── Abort button ─────────────────────────────────────────────────────────────

abortBtn?.addEventListener('click', () => {
  VscodeIPC.send({ type: 'abort' });
});

// ─── IPC routing ──────────────────────────────────────────────────────────────

VscodeIPC.on('pi_event', (msg) => handlePiEvent(msg.event));
VscodeIPC.on('sync', (msg) => handleSync(msg.state));
VscodeIPC.on('editor_context', (msg) => handleEditorContext(msg.context));
VscodeIPC.on('sessions_list', () => { /* future: session switcher panel */ });
VscodeIPC.on('set_theme', (msg) => {
  document.documentElement.setAttribute('data-theme', msg.theme || 'night');
});
VscodeIPC.on('prefill_input', (msg) => {
  // Prefill the input with selection context from "Ask About Selection"
  if (msg.text) {
    chatInput.element.textContent = msg.text;
    chatInput.element.focus();
    // Move cursor to end
    const range = document.createRange();
    range.selectNodeContents(chatInput.element);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }
});

// ─── Utilities ────────────────────────────────────────────────────────────────

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

// Request a full state sync from the extension host on load
VscodeIPC.send({ type: 'request_sync' });

// Apply stored theme (VS Code persists webview state via retainContextWhenHidden)
// The extension host will send set_theme on openPanel, but handle the case
// where the webview was already open.
const savedTheme = document.documentElement.getAttribute('data-theme') || 'night';
document.documentElement.setAttribute('data-theme', savedTheme);

messageRenderer.renderWelcome();
