/**
 * app.js — Phi Webview Main Coordinator
 *
 * Full-featured UI for the Phi VS Code extension.
 * All communication via VscodeIPC (VS Code message passing).
 */
import { VscodeIPC } from './vscode-ipc.js';
import { ChatInput } from './chat-input.js';
import { MessageRenderer } from './message-renderer.js';
import { ToolCardRenderer } from './tool-card.js';
import { StateManager } from './state.js';
import { SessionSidebar } from './session-sidebar.js';
import { EXTENSION_VERSION } from './version.js';

// ─── Core instances ───────────────────────────────────────────────────────────

const messagesEl = document.getElementById('messages');
const state = new StateManager();
const messageRenderer = new MessageRenderer(messagesEl);
const toolCardRenderer = new ToolCardRenderer(messagesEl);

const chatInput = new ChatInput('message-input', 'chat-form', (text) => {
  sendMessage(text);
});

// Session sidebar (inside history panel)
const sidebar = new SessionSidebar(
  document.getElementById('session-list'),
  handleSessionSelect
);

// ─── DOM refs ─────────────────────────────────────────────────────────────────

const sendBtn = document.getElementById('send-btn');
const abortBtn = document.getElementById('abort-btn');
const typingIndicator = document.getElementById('typing-indicator');
const typingTextEl = document.getElementById('typing-text');
const imagePreviews = document.getElementById('image-previews');
const queuedMessagesEl = document.getElementById('queued-messages');
const imageInput = document.getElementById('image-input');
const attachBtn = document.getElementById('attach-btn');
const messageInput = chatInput.element;

// Header
const modelDropdown = document.getElementById('model-dropdown');
const modelDropdownBtn = document.getElementById('model-dropdown-btn');
const modelDropdownLabel = document.getElementById('model-dropdown-label');
const modelDropdownMenu = document.getElementById('model-dropdown-menu');
const thinkingBtn = document.getElementById('thinking-btn');
const newChatBtn = document.getElementById('new-chat-btn');

// Cost / tokens
const sessionCostEl = document.getElementById('session-cost');
const tokenUsageEl = document.getElementById('token-usage');
const contextViz = document.getElementById('context-viz');
const contextBar = document.getElementById('context-bar');
const contextLegend = document.getElementById('context-legend');
const contextVizUsed = document.getElementById('context-viz-used');
const contextVizTotal = document.getElementById('context-viz-total');

// Set version immediately
const versionDisplayEl = document.getElementById('version-display');
if (versionDisplayEl) {
  versionDisplayEl.textContent = `v${EXTENSION_VERSION}`;
}

// Scroll button
const scrollBottomBtn = document.getElementById('scroll-bottom-btn');
const scrollBottomBadge = document.getElementById('scroll-bottom-badge');

// Settings
const settingsBtn = document.getElementById('settings-btn');
const settingsPanel = document.getElementById('settings-panel');
const settingsOverlay = document.getElementById('settings-overlay');
const settingsClose = document.getElementById('settings-close');
const accountsBtn = document.getElementById('accounts-btn');
const accountsPanel = document.getElementById('accounts-panel');
const accountsOverlay = document.getElementById('accounts-overlay');
const accountsClose = document.getElementById('accounts-close');
const treeBtn = document.getElementById('tree-btn');
const treePanel = document.getElementById('tree-panel');
const treeOverlay = document.getElementById('tree-overlay');
const treeClose = document.getElementById('tree-close');
const treeView = document.getElementById('tree-view');
const treeFilter = document.getElementById('tree-filter');
const toggleAutoCompact = document.getElementById('toggle-auto-compact');
const btnThinkingLevel = document.getElementById('btn-thinking-level');
const toggleShowThinking = document.getElementById('toggle-show-thinking');
const btnLogin = document.getElementById('btn-login');
const btnAddApiKey = document.getElementById('btn-add-api-key');
const btnRemoveApiKey = document.getElementById('btn-remove-api-key');
const accountsList = document.getElementById('accounts-list');

// History
const historyBtn = document.getElementById('history-btn');
const historyPanel = document.getElementById('history-panel');
const historyOverlay = document.getElementById('history-overlay');
const historyClose = document.getElementById('history-close');
const sessionSearchInput = document.getElementById('session-search-input');

// Command palette
const commandBtn = document.getElementById('command-btn');
const commandPalette = document.getElementById('command-palette');
const commandPaletteOverlay = document.getElementById('command-palette-overlay');
const commandList = document.getElementById('command-list');

// ─── App state ────────────────────────────────────────────────────────────────

let currentStreamingEl = null;
let currentThinking = '';
let currentText = '';
let lastSentMessage = '';
let pendingImages = [];
let messageQueue = [];
let sessionTotalCost = 0;
let lastInputTokens = 0;
let contextWindowSize = 0;
let lastUsage = null;
let currentModelId = '';
let availableModels = [];
let currentThinkingLevel = 'off';
let isScrolledUp = false;
let hasNewWhileScrolled = false;

// ═══════════════════════════════════════
// Image attachment
// ═══════════════════════════════════════

chatInput.onImagePaste = async (files) => {
  for (const file of files) {
    const img = await processImageFile(file);
    if (img) pendingImages.push(img);
  }
  renderImagePreviews();
};

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

// Drag & drop
messageInput.addEventListener('dragover', (e) => { e.preventDefault(); });
messageInput.addEventListener('drop', async (e) => {
  e.preventDefault();
  for (const file of e.dataTransfer.files) {
    const img = await processImageFile(file);
    if (img) pendingImages.push(img);
  }
  renderImagePreviews();
});

function processImageFile(file) {
  return new Promise((resolve) => {
    if (!file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) {
      resolve(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        const MAX = 2048;
        if (width > MAX || height > MAX) {
          const scale = MAX / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        const mimeType = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png';
        const quality = mimeType === 'image/jpeg' ? 0.85 : undefined;
        const base64 = canvas.toDataURL(mimeType, quality).split(',')[1];
        resolve(base64 ? { data: base64, mimeType } : null);
      };
      img.onerror = () => resolve(null);
      img.src = ev.target.result;
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

function renderImagePreviews() {
  imagePreviews.innerHTML = '';
  if (pendingImages.length === 0) { imagePreviews.classList.add('hidden'); return; }
  imagePreviews.classList.remove('hidden');
  pendingImages.forEach((img, i) => {
    const el = document.createElement('div');
    el.className = 'image-preview';
    el.innerHTML = `
      <img src="data:${img.mimeType};base64,${img.data}" />
      <button class="image-preview-remove" data-index="${i}">✕</button>
    `;
    el.querySelector('.image-preview-remove').addEventListener('click', () => {
      pendingImages.splice(i, 1);
      renderImagePreviews();
    });
    imagePreviews.appendChild(el);
  });
}

// ═══════════════════════════════════════
// Send message
// ═══════════════════════════════════════

function sendMessage(text) {
  let message = typeof text === 'string' ? text : chatInput.getText();
  if (!message && pendingImages.length === 0) return;
  chatInput.clear();

  const cmd = { type: 'prompt', message };
  if (pendingImages.length > 0) {
    cmd.images = pendingImages.map(img => ({ type: 'image', data: img.data, mimeType: img.mimeType || 'image/png' }));
    pendingImages = [];
    renderImagePreviews();
  }

  if (state.isStreaming) {
    messageQueue.push(cmd);
    lastSentMessage = message;
    renderQueuedMessages();
    return;
  }

  lastSentMessage = message;
  messageRenderer.renderUserMessage({ content: message, images: cmd.images });
  VscodeIPC.send(cmd);
}

function renderQueuedMessages() {
  queuedMessagesEl.innerHTML = '';
  if (messageQueue.length === 0) { queuedMessagesEl.classList.add('hidden'); return; }
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
  if (messageQueue.length === 0 || state.isStreaming) return;
  const next = messageQueue.shift();
  renderQueuedMessages();
  messageRenderer.renderUserMessage({ content: next.message, images: next.images });
  VscodeIPC.send(next);
}

abortBtn?.addEventListener('click', () => {
  VscodeIPC.send({ type: 'abort' });
  messageRenderer.renderError('Aborted by user');
  showTypingIndicator(false);
});

// ═══════════════════════════════════════
// Pi event handler
// ═══════════════════════════════════════

function handlePiEvent(event) {
  switch (event.type) {
    case 'agent_start':
      state.setStreaming(true);
      showTypingIndicator(true, 'Thinking');
      updateUI();
      break;

    case 'agent_end':
      state.setStreaming(false);
      showTypingIndicator(false);
      currentStreamingEl = null;
      currentText = '';
      currentThinking = '';
      updateUI();
      flushQueue();
      break;

    case 'message_start': {
      const msg = event.message;
      if (msg?.role === 'user') {
        const content = getMessageText(msg);
        if (content === lastSentMessage) { lastSentMessage = ''; break; }
        messageRenderer.renderUserMessage({ content }, true);
      } else if (msg?.role === 'assistant') {
        currentStreamingEl = messageRenderer.renderAssistantMessage(msg, true);
        currentThinking = '';
        currentText = '';
        showTypingIndicator(true, 'Typing');
      }
      break;
    }

    case 'message_update': {
      const ev = event.assistantMessageEvent;
      if (!ev) break;
      if (ev.type === 'text_delta') {
        currentText += ev.delta;
        if (currentStreamingEl) messageRenderer.updateStreamingMessage(currentStreamingEl, currentText);
        showTypingIndicator(true, 'Typing');
      } else if (ev.type === 'thinking_delta') {
        currentThinking += ev.delta;
        if (currentStreamingEl) messageRenderer.updateStreamingThinking(currentStreamingEl, currentThinking);
        showTypingIndicator(true, 'Thinking');
      }
      break;
    }

    case 'message_end': {
      const msg = event.message;
      if (currentStreamingEl) {
        const usage = msg?.usage || null;
        const errorMsg = (msg?.stopReason === 'error' || msg?.stopReason === 'aborted')
          ? msg?.errorMessage
          : null;

        messageRenderer.finalizeStreamingMessage(currentStreamingEl, usage, currentThinking, errorMsg);
        currentStreamingEl = null;
        currentThinking = '';
        currentText = '';

        if (usage?.cost?.total) sessionTotalCost += usage.cost.total;
        if (usage?.input) {
          lastInputTokens = usage.input + (usage.cacheRead || 0);
          lastUsage = usage;
        }
        updateCostDisplay();
        updateTokenUsage();
        showNewMessageBadge();
        showTypingIndicator(true, 'Thinking');
      }
      break;
    }

    case 'tool_execution_start': {
      const { toolCallId, toolName, args } = event;
      state.addToolExecution(toolCallId, { toolName, args, status: 'pending' });
      toolCardRenderer.createToolCard(state.getToolExecution(toolCallId));
      showTypingIndicator(true, `Working (${toolName})`);
      break;
    }

    case 'tool_execution_update': {
      const { toolCallId, partialResult } = event;
      const output = formatToolOutput(partialResult);
      state.updateToolExecution(toolCallId, { status: 'streaming', output });
      toolCardRenderer.updateToolCard(state.getToolExecution(toolCallId));
      break;
    }

    case 'tool_execution_end': {
      const { toolCallId, result, isError } = event;
      const output = formatToolOutput(result);
      state.updateToolExecution(toolCallId, { status: isError ? 'error' : 'complete', output, isError });
      toolCardRenderer.finalizeToolCard(toolCallId, result, isError);
      showTypingIndicator(true, 'Thinking');
      break;
    }

    case 'auto_compaction_start': {
      const el = document.createElement('div');
      el.className = 'system-message compaction-message';
      el.id = 'compaction-indicator';
      el.innerHTML = '<span class="compaction-spinner">⟳</span> Compacting context…';
      messagesEl.appendChild(el);
      messageRenderer.scrollToBottom();
      break;
    }

    case 'auto_compaction_end': {
      const indicator = document.getElementById('compaction-indicator');
      if (indicator) {
        indicator.innerHTML = '✓ Context compacted';
        indicator.classList.add('compaction-done');
      }
      // Refresh context usage
      VscodeIPC.send({ type: 'get_state' });
      lastInputTokens = 0;
      updateTokenUsage();
      break;
    }

    case 'session_name':
      if (event.name) {
        const activeItem = document.querySelector('.session-item.active .session-title');
        if (activeItem) activeItem.textContent = event.name;
      }
      break;

    default:
      break;
  }
}

function getMessageText(message) {
  if (typeof message.content === 'string') return message.content;
  if (Array.isArray(message.content)) {
    return message.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
  }
  return '';
}

function formatToolOutput(result) {
  if (!result) return '';
  if (result.content && Array.isArray(result.content)) {
    return result.content.map(block => block.type === 'text' ? block.text : JSON.stringify(block)).join('\n');
  }
  return JSON.stringify(result, null, 2);
}

// ═══════════════════════════════════════
// Sync handler
// ═══════════════════════════════════════

function handleSync(syncState) {
  state.reset();
  messageRenderer.clear();
  toolCardRenderer.clear();
  sessionTotalCost = syncState.sessionStats?.cost ?? 0;
  lastInputTokens = 0;

  if (syncState.model) {
    currentModelId = syncState.model.id || '';
    if (syncState.model.contextWindow) contextWindowSize = syncState.model.contextWindow;
    updateModelLabel();
  }
  if (syncState.thinkingLevel) {
    currentThinkingLevel = syncState.thinkingLevel;
    updateThinkingBtn();
  }

  if (syncState.entries && syncState.entries.length > 0) {
    renderHistory(syncState.entries);
  } else {
    messageRenderer.renderWelcome();
  }

  state.setStreaming(syncState.isStreaming);
  showTypingIndicator(syncState.isStreaming, 'Thinking');
  updateUI();
  updateCostDisplay();
  updateTokenUsage();
}

function renderHistory(entries) {
  for (const entry of entries) {
    if (entry.type !== 'message') continue;
    const msg = entry.message;
    if (!msg) continue;

    if (msg.role === 'user') {
      const content = typeof msg.content === 'string'
        ? msg.content
        : (msg.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
      const images = Array.isArray(msg.content)
        ? msg.content.filter(b => b.type === 'image').map(b => ({ data: b.data || '', mimeType: b.mimeType || 'image/png' }))
        : [];
      if (content || images.length > 0) {
        messageRenderer.renderUserMessage({ content: content || '', images: images.length > 0 ? images : undefined }, true);
      }
    } else if (msg.role === 'assistant') {
      const textBlocks = (msg.content || []).filter(b => b.type === 'text');
      const thinkingBlocks = (msg.content || []).filter(b => b.type === 'thinking');
      const toolCalls = (msg.content || []).filter(b => b.type === 'toolCall');

      const contentBlocks = [];
      for (const block of msg.content || []) {
        if (block.type === 'text' || block.type === 'thinking') contentBlocks.push(block);
      }

      const text = textBlocks.map(b => b.text).join('\n');
      const hasError = msg.stopReason === 'error' && msg.errorMessage;

      if (text || thinkingBlocks.length > 0 || hasError) {
        messageRenderer.renderAssistantMessage(
          {
            content: contentBlocks.length > 0 ? contentBlocks : text,
            usage: msg.usage,
            stopReason: msg.stopReason,
            errorMessage: msg.errorMessage,
          },
          false, true
        );
        if (msg.usage?.input) {
          lastInputTokens = msg.usage.input + (msg.usage.cacheRead || 0);
          lastUsage = msg.usage;
        }
      }

      for (const tc of toolCalls) {
        toolCardRenderer.createHistoryCard({ toolCallId: tc.id, toolName: tc.name, args: tc.arguments || {} });
      }
    } else if (msg.role === 'toolResult') {
      toolCardRenderer.addHistoryResult(msg.toolCallId, { content: msg.content || [] }, msg.isError);
    }
  }

  updateCostDisplay();
  updateTokenUsage();

  // Jump to bottom instantly
  messagesEl.style.scrollBehavior = 'auto';
  requestAnimationFrame(() => {
    messagesEl.scrollTop = messagesEl.scrollHeight;
    requestAnimationFrame(() => { messagesEl.style.scrollBehavior = ''; });
  });
}

// ═══════════════════════════════════════
// Scroll-to-bottom
// ═══════════════════════════════════════

messagesEl.addEventListener('scroll', () => {
  const threshold = 150;
  const atBottom = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < threshold;
  isScrolledUp = !atBottom;
  if (atBottom) {
    scrollBottomBtn.classList.add('hidden');
    scrollBottomBadge.classList.add('hidden');
    hasNewWhileScrolled = false;
  } else {
    scrollBottomBtn.classList.remove('hidden');
  }
});

scrollBottomBtn.addEventListener('click', () => {
  messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior: 'smooth' });
  scrollBottomBtn.classList.add('hidden');
  scrollBottomBadge.classList.add('hidden');
  hasNewWhileScrolled = false;
});

function showNewMessageBadge() {
  if (isScrolledUp) {
    hasNewWhileScrolled = true;
    scrollBottomBadge.classList.remove('hidden');
  }
}

// ═══════════════════════════════════════
// Model Picker
// ═══════════════════════════════════════

function updateModelLabel() {
  const shortName = currentModelId.replace(/^claude-/, '').replace(/-\d{8}$/, '');
  modelDropdownLabel.textContent = shortName || 'model';
}

function updateThinkingBtn() {
  thinkingBtn.textContent = currentThinkingLevel;
  thinkingBtn.classList.toggle('off', currentThinkingLevel === 'off');
}

function openModelDropdown() {
  modelDropdownMenu.innerHTML = '';
  const search = document.createElement('input');
  search.className = 'model-dropdown-search';
  search.placeholder = 'Search models…';
  search.type = 'text';
  modelDropdownMenu.appendChild(search);

  const itemsContainer = document.createElement('div');
  itemsContainer.className = 'model-dropdown-items';
  modelDropdownMenu.appendChild(itemsContainer);

  function renderItems(filter) {
    itemsContainer.innerHTML = '';
    const query = (filter || '').toLowerCase();
    availableModels.forEach(m => {
      const shortName = m.id.replace(/-\d{8}$/, '');
      if (query && !shortName.toLowerCase().includes(query) && !(m.provider || '').toLowerCase().includes(query)) return;
      const el = document.createElement('div');
      el.className = `model-dropdown-item${m.id === currentModelId ? ' active' : ''}`;
      const ctxK = m.contextWindow ? `${(m.contextWindow / 1000).toFixed(0)}k` : '';
      const providerLabel = m.provider && m.provider !== 'anthropic' ? `<span class="model-dropdown-item-provider">${m.provider}</span>` : '';
      el.innerHTML = `<span>${shortName}${providerLabel}</span><span class="model-dropdown-item-ctx">${ctxK}</span>`;
      el.addEventListener('click', () => {
        closeModelDropdown();
        VscodeIPC.send({ type: 'set_model', provider: m.provider, modelId: m.id });
        currentModelId = m.id;
        updateModelLabel();
        if (m.contextWindow) { contextWindowSize = m.contextWindow; updateTokenUsage(); }
      });
      itemsContainer.appendChild(el);
    });
  }

  renderItems('');
  search.addEventListener('input', () => renderItems(search.value));
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeModelDropdown(); e.stopPropagation(); }
    if (e.key === 'Enter') { const first = itemsContainer.querySelector('.model-dropdown-item'); if (first) first.click(); }
  });

  modelDropdownMenu.classList.remove('hidden');
  modelDropdown.classList.add('open');
  requestAnimationFrame(() => search.focus());
}

function closeModelDropdown() {
  modelDropdownMenu.classList.add('hidden');
  modelDropdown.classList.remove('open');
}

modelDropdownBtn.addEventListener('click', () => {
  if (!modelDropdownMenu.classList.contains('hidden')) { closeModelDropdown(); return; }
  // Fetch models first, then open
  VscodeIPC.send({ type: 'get_available_models' });
  // Will open when rpc_response arrives (see below)
  modelDropdown._pendingOpen = true;
});

document.addEventListener('click', (e) => {
  if (!modelDropdown.contains(e.target)) closeModelDropdown();
});

thinkingBtn.addEventListener('click', () => {
  VscodeIPC.send({ type: 'cycle_thinking_level' });
});

// ═══════════════════════════════════════
// Cost & Token Display
// ═══════════════════════════════════════

function updateCostDisplay() {
  if (sessionTotalCost > 0) {
    sessionCostEl.textContent = `$${sessionTotalCost.toFixed(4)}`;
    sessionCostEl.classList.add('visible');
  } else {
    sessionCostEl.classList.remove('visible');
  }
}

function updateTokenUsage() {
  if (lastInputTokens > 0 && contextWindowSize > 0) {
    const pct = Math.round((lastInputTokens / contextWindowSize) * 100);
    tokenUsageEl.innerHTML = `<span>${pct}% context</span>`;
    tokenUsageEl.classList.add('visible');
    tokenUsageEl.classList.remove('warning', 'critical');
    if (pct >= 80) tokenUsageEl.classList.add('critical');
    else if (pct >= 60) tokenUsageEl.classList.add('warning');
    tokenUsageEl.title = `Context: ${(lastInputTokens / 1000).toFixed(1)}k / ${(contextWindowSize / 1000).toFixed(0)}k tokens`;
  } else if (lastInputTokens > 0) {
    tokenUsageEl.innerHTML = `<span>${(lastInputTokens / 1000).toFixed(1)}k tokens</span>`;
    tokenUsageEl.classList.add('visible');
    tokenUsageEl.classList.remove('warning', 'critical');
  }
}

function formatTokens(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function updateContextViz() {
  if (!lastUsage || !contextWindowSize) return;
  const input = lastUsage.input || 0;
  const cacheRead = lastUsage.cacheRead || 0;
  const totalUsed = input + cacheRead;
  const free = Math.max(0, contextWindowSize - totalUsed);

  const segments = [
    { label: 'Cached', tokens: cacheRead, color: 'cache' },
    { label: 'Input', tokens: input, color: 'messages' },
    { label: 'Available', tokens: free, color: 'free' },
  ];

  contextBar.innerHTML = '';
  for (const seg of segments) {
    if (seg.tokens <= 0) continue;
    const pct = (seg.tokens / contextWindowSize) * 100;
    const el = document.createElement('div');
    el.className = `context-bar-segment ${seg.color}`;
    el.style.width = `${pct}%`;
    el.title = `${seg.label}: ${formatTokens(seg.tokens)}`;
    contextBar.appendChild(el);
  }

  contextLegend.innerHTML = '';
  for (const seg of segments) {
    const item = document.createElement('div');
    item.className = 'context-legend-item';
    item.innerHTML = `<span class="context-legend-left"><span class="context-legend-dot ${seg.color}"></span>${seg.label}</span><span class="context-legend-value">${formatTokens(seg.tokens)}</span>`;
    contextLegend.appendChild(item);
  }

  const pct = Math.round((totalUsed / contextWindowSize) * 100);
  contextVizUsed.textContent = `${pct}% used`;
  contextVizTotal.textContent = `${formatTokens(totalUsed)} / ${formatTokens(contextWindowSize)}`;
}

tokenUsageEl.addEventListener('click', (e) => {
  e.stopPropagation();
  if (contextViz.classList.contains('hidden')) {
    updateContextViz();
    contextViz.classList.remove('hidden');
  } else {
    contextViz.classList.add('hidden');
  }
});

document.addEventListener('click', (e) => {
  if (!contextViz.contains(e.target) && e.target !== tokenUsageEl) {
    contextViz.classList.add('hidden');
  }
});

// ═══════════════════════════════════════
// Command Palette
// ═══════════════════════════════════════

const commands = [
  { icon: '🗜️', label: 'Compact', desc: 'Compact context to save tokens', action: () => VscodeIPC.send({ type: 'compact' }) },
  { icon: '📊', label: 'Session Stats', desc: 'Show session statistics', action: () => VscodeIPC.send({ type: 'get_session_stats' }) },
  { icon: '🌿', label: 'Conversation Tree', desc: 'Browse and navigate conversation branches', action: () => openTree() },
  { icon: '⬇️', label: 'Expand All Tools', desc: 'Expand all tool cards', action: () => toolCardRenderer.expandAll() },
  { icon: '⬆️', label: 'Collapse All Tools', desc: 'Collapse all tool cards', action: () => toolCardRenderer.collapseAll() },
];

function openCommandPalette() {
  commandList.innerHTML = '';
  commands.forEach(cmd => {
    const el = document.createElement('div');
    el.className = 'command-item';
    el.innerHTML = `<div class="command-icon">${cmd.icon}</div><div><div class="command-label">${cmd.label}</div><div class="command-desc">${cmd.desc}</div></div>`;
    el.addEventListener('click', () => { closeCommandPalette(); cmd.action(); });
    commandList.appendChild(el);
  });
  commandPalette.classList.remove('hidden');
  commandPaletteOverlay.classList.remove('hidden');
}

function closeCommandPalette() {
  commandPalette.classList.add('hidden');
  commandPaletteOverlay.classList.add('hidden');
}

commandBtn.addEventListener('click', openCommandPalette);
commandPaletteOverlay.addEventListener('click', closeCommandPalette);

// ═══════════════════════════════════════
// Settings Panel
// ═══════════════════════════════════════

function openSettings() {
  settingsPanel.classList.remove('hidden');
  settingsOverlay.classList.remove('hidden');
  // Fetch current state for toggles
  VscodeIPC.send({ type: 'get_state' });
}

function closeSettings() {
  settingsPanel.classList.add('hidden');
  settingsOverlay.classList.add('hidden');
}

settingsBtn.addEventListener('click', openSettings);
settingsClose.addEventListener('click', closeSettings);
settingsOverlay.addEventListener('click', closeSettings);

// ═══════════════════════════════════════
// Accounts Panel
// ═══════════════════════════════════════

function openAccounts() {
  accountsPanel.classList.remove('hidden');
  accountsOverlay.classList.remove('hidden');
  VscodeIPC.send({ type: 'get_accounts' });
}

function closeAccounts() {
  accountsPanel.classList.add('hidden');
  accountsOverlay.classList.add('hidden');
}

accountsBtn.addEventListener('click', openAccounts);
accountsClose.addEventListener('click', closeAccounts);
accountsOverlay.addEventListener('click', closeAccounts);

// ═══════════════════════════════════════
// Tree Panel
// ═══════════════════════════════════════

let currentTreeData = null;
let currentLeafId = null;

function openTree() {
  treePanel.classList.remove('hidden');
  treeOverlay.classList.remove('hidden');
  treeView.innerHTML = '<div class="tree-loading">Loading tree...</div>';
  VscodeIPC.send({ type: 'get_tree' });
}

function closeTree() {
  treePanel.classList.add('hidden');
  treeOverlay.classList.add('hidden');
}

treeBtn.addEventListener('click', openTree);
treeClose.addEventListener('click', closeTree);
treeOverlay.addEventListener('click', closeTree);

treeFilter.addEventListener('change', () => {
  if (currentTreeData) renderTree(currentTreeData, currentLeafId);
});

VscodeIPC.on('tree_data', (msg) => {
  currentTreeData = msg.tree;
  currentLeafId = msg.leafId;
  renderTree(msg.tree, msg.leafId);
});

VscodeIPC.on('navigate_result', (msg) => {
  if (msg.success) {
    closeTree();
  }
});

// Support opening tree from command palette / external command
VscodeIPC.on('open_tree', () => {
  openTree();
});

function renderTree(tree, leafId) {
  if (!treeView) return;
  treeView.innerHTML = '';

  if (!tree || tree.length === 0) {
    treeView.innerHTML = '<div class="tree-empty">No conversation entries yet</div>';
    return;
  }

  const filterMode = treeFilter.value;
  const container = document.createElement('div');
  container.className = 'tree-nodes';

  // Flatten tree into a display list, only indenting at branch points
  const flatList = [];
  flattenForDisplay(tree, leafId, 0, filterMode, flatList);

  for (const item of flatList) {
    const el = document.createElement('div');
    el.className = 'tree-node';
    if (item.id === leafId) el.classList.add('current');
    el.style.paddingLeft = `${8 + item.depth * 14}px`;

    // Role label
    const roleEl = document.createElement('span');
    roleEl.className = 'tree-node-role';

    if (item.type === 'message') {
      roleEl.textContent = item.role === 'user' ? 'user:' : 'assistant:';
      roleEl.classList.add(item.role === 'user' ? 'user' : 'assistant');
    } else if (item.type === 'compaction') {
      roleEl.textContent = '[compaction]:';
      roleEl.classList.add('meta');
    } else if (item.type === 'branch_summary') {
      roleEl.textContent = '[branch summary]:';
      roleEl.classList.add('meta');
    } else if (item.type === 'model_change') {
      roleEl.textContent = '[model]:';
      roleEl.classList.add('meta');
    } else {
      roleEl.textContent = `[${item.type}]:`;
      roleEl.classList.add('meta');
    }
    el.appendChild(roleEl);

    // Label badge
    if (item.label) {
      const badge = document.createElement('span');
      badge.className = 'tree-node-label';
      badge.textContent = item.label;
      el.appendChild(badge);
    }

    // Preview text
    const preview = document.createElement('span');
    preview.className = 'tree-node-preview';
    preview.textContent = item.preview || '';
    el.appendChild(preview);

    // Current indicator
    if (item.id === leafId) {
      const curr = document.createElement('span');
      curr.className = 'tree-node-current';
      curr.textContent = '●';
      el.appendChild(curr);
    }

    // Click to navigate (only if not current leaf)
    if (item.id !== leafId) {
      el.classList.add('navigable');
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        showNavigateOptions(item);
      });
    }

    // Right-click to label
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showLabelInput(item);
    });

    container.appendChild(el);
  }

  treeView.appendChild(container);

  // Scroll current node into view
  const currentEl = container.querySelector('.tree-node.current');
  if (currentEl) {
    setTimeout(() => currentEl.scrollIntoView({ block: 'center', behavior: 'smooth' }), 50);
  }
}

function shouldShowNode(node, filterMode) {
  switch (filterMode) {
    case 'user-only':
      return node.type === 'message' && node.role === 'user';
    case 'labeled-only':
      return !!node.label;
    case 'all':
      return true;
    case 'default':
    default:
      return node.type === 'message' || node.type === 'compaction' || node.type === 'branch_summary';
  }
}

/**
 * Flatten the tree for display. Key rule: depth only increases at branch points
 * (nodes with multiple visible children). Linear chains stay at the same depth.
 * Branch points trigger indent even if the branch-point node itself is hidden by filter.
 */
function flattenForDisplay(nodes, leafId, depth, filterMode, result) {
  for (const node of nodes) {
    const show = shouldShowNode(node, filterMode);
    const visibleChildren = node.children.filter(c => hasVisibleDescendants(c, filterMode));
    const isBranchPoint = visibleChildren.length > 1;

    if (show) {
      result.push({
        id: node.id,
        parentId: node.parentId,
        type: node.type,
        role: node.role,
        label: node.label,
        preview: node.preview,
        depth,
      });
    }

    // Increase depth at branch points, even if the branch node itself is hidden
    const childDepth = isBranchPoint ? depth + 1 : depth;
    flattenForDisplay(node.children, leafId, childDepth, filterMode, result);
  }
}

function hasVisibleDescendants(node, filterMode) {
  if (shouldShowNode(node, filterMode)) return true;
  return node.children.some(c => hasVisibleDescendants(c, filterMode));
}

function showNavigateOptions(node) {
  // Create an inline option picker below the node
  const existing = document.querySelector('.tree-nav-options');
  if (existing) existing.remove();

  const opts = document.createElement('div');
  opts.className = 'tree-nav-options';

  const previewText = (node.preview || '').substring(0, 40);
  const title = document.createElement('div');
  title.className = 'tree-nav-title';
  title.textContent = `Navigate to: ${previewText}`;
  opts.appendChild(title);

  const actions = [
    { label: 'Go (no summary)', summarize: false },
    { label: 'Go with summary', summarize: true },
    { label: 'Go with custom summary…', summarize: true, custom: true },
  ];

  for (const action of actions) {
    const btn = document.createElement('button');
    btn.className = 'tree-nav-btn';
    btn.textContent = action.label;
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      opts.remove();

      if (action.custom) {
        // Show inline input for custom instructions
        showCustomSummaryInput(node);
        return;
      }

      treeView.innerHTML = '<div class="tree-loading">Navigating...</div>';
      VscodeIPC.send({
        type: 'navigate_tree',
        targetId: node.id,
        summarize: action.summarize,
      });
    });
    opts.appendChild(btn);
  }

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'tree-nav-btn cancel';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    opts.remove();
  });
  opts.appendChild(cancelBtn);

  treeView.appendChild(opts);
  opts.scrollIntoView({ block: 'nearest' });
}

function showCustomSummaryInput(node) {
  const existing = document.querySelector('.tree-nav-options');
  if (existing) existing.remove();

  const opts = document.createElement('div');
  opts.className = 'tree-nav-options';

  const label = document.createElement('div');
  label.className = 'tree-nav-title';
  label.textContent = 'Custom summary instructions:';
  opts.appendChild(label);

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'tree-nav-input';
  input.placeholder = 'Focus on…';
  opts.appendChild(input);

  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:4px;margin-top:4px;';

  const goBtn = document.createElement('button');
  goBtn.className = 'tree-nav-btn';
  goBtn.textContent = 'Navigate';
  goBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    opts.remove();
    treeView.innerHTML = '<div class="tree-loading">Navigating...</div>';
    VscodeIPC.send({
      type: 'navigate_tree',
      targetId: node.id,
      summarize: true,
      customInstructions: input.value || undefined,
    });
  });
  row.appendChild(goBtn);

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'tree-nav-btn cancel';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    opts.remove();
  });
  row.appendChild(cancelBtn);

  opts.appendChild(row);
  treeView.appendChild(opts);
  input.focus();

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      goBtn.click();
    } else if (e.key === 'Escape') {
      cancelBtn.click();
    }
  });
}

function showLabelInput(node) {
  const existing = document.querySelector('.tree-nav-options');
  if (existing) existing.remove();

  const opts = document.createElement('div');
  opts.className = 'tree-nav-options';

  const title = document.createElement('div');
  title.className = 'tree-nav-title';
  title.textContent = 'Set label:';
  opts.appendChild(title);

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'tree-nav-input';
  input.placeholder = 'checkpoint, v1, etc.';
  input.value = node.label || '';
  opts.appendChild(input);

  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:4px;margin-top:4px;';

  const saveBtn = document.createElement('button');
  saveBtn.className = 'tree-nav-btn';
  saveBtn.textContent = 'Save';
  saveBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    opts.remove();
    VscodeIPC.send({ type: 'set_label', entryId: node.id, label: input.value });
  });
  row.appendChild(saveBtn);

  if (node.label) {
    const clearBtn = document.createElement('button');
    clearBtn.className = 'tree-nav-btn cancel';
    clearBtn.textContent = 'Clear';
    clearBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      opts.remove();
      VscodeIPC.send({ type: 'set_label', entryId: node.id, label: '' });
    });
    row.appendChild(clearBtn);
  }

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'tree-nav-btn cancel';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    opts.remove();
  });
  row.appendChild(cancelBtn);

  opts.appendChild(row);
  treeView.appendChild(opts);
  input.focus();

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveBtn.click();
    else if (e.key === 'Escape') cancelBtn.click();
  });
}

toggleAutoCompact.addEventListener('click', () => {
  const isOn = toggleAutoCompact.classList.contains('on');
  toggleAutoCompact.className = `settings-toggle${isOn ? '' : ' on'}`;
  VscodeIPC.send({ type: 'set_auto_compaction', enabled: !isOn });
});

btnThinkingLevel.addEventListener('click', () => {
  VscodeIPC.send({ type: 'cycle_thinking_level' });
});

const showThinking = localStorage.getItem('phi-show-thinking') !== 'false';
toggleShowThinking.className = `settings-toggle${showThinking ? ' on' : ''}`;
if (!showThinking) document.body.classList.add('hide-thinking');

toggleShowThinking.addEventListener('click', () => {
  const isOn = toggleShowThinking.classList.contains('on');
  toggleShowThinking.className = `settings-toggle${isOn ? '' : ' on'}`;
  document.body.classList.toggle('hide-thinking', isOn);
  localStorage.setItem('phi-show-thinking', !isOn);
});

// ── Login / API Key buttons ──
btnLogin.addEventListener('click', () => {
  VscodeIPC.send({ type: 'login' });
});

btnAddApiKey.addEventListener('click', () => {
  VscodeIPC.send({ type: 'add_api_key' });
});

btnRemoveApiKey.addEventListener('click', () => {
  VscodeIPC.send({ type: 'remove_api_key' });
});

// Listen for accounts list updates (OAuth + API keys) — show only active ones
VscodeIPC.on('accounts_list', (msg) => {
  if (!accountsList) return;
  accountsList.innerHTML = '';

  // Filter to only logged-in OAuth providers
  const activeOAuth = (msg.providers || []).filter(p => p.loggedIn);
  // Filter to only providers with API keys set
  const activeApiKeys = (msg.apiKeyProviders || []).filter(p => p.hasKey);

  if (activeOAuth.length === 0 && activeApiKeys.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'accounts-empty';
    empty.textContent = 'No accounts configured';
    accountsList.appendChild(empty);
    return;
  }

  if (activeOAuth.length > 0) {
    const oauthHeader = document.createElement('div');
    oauthHeader.className = 'accounts-section-header';
    oauthHeader.textContent = 'OAuth';
    accountsList.appendChild(oauthHeader);

    activeOAuth.forEach(p => {
      const row = document.createElement('div');
      row.className = 'account-row';
      row.innerHTML = `
        <span class="account-name">${escapeHtml(p.name)}</span>
        <span class="account-status logged-in">✓</span>
      `;
      accountsList.appendChild(row);
    });
  }

  if (activeApiKeys.length > 0) {
    const apiHeader = document.createElement('div');
    apiHeader.className = 'accounts-section-header';
    apiHeader.textContent = 'API Keys';
    accountsList.appendChild(apiHeader);

    activeApiKeys.forEach(p => {
      const row = document.createElement('div');
      row.className = 'account-row';
      row.innerHTML = `
        <span class="account-name">${escapeHtml(p.name)}</span>
        <span class="account-status logged-in">✓</span>
      `;
      accountsList.appendChild(row);
    });
  }
});

// ═══════════════════════════════════════
// History Panel
// ═══════════════════════════════════════

function openHistory() {
  historyOverlay.classList.remove('hidden');
  historyPanel.classList.remove('hidden');
  VscodeIPC.send({ type: 'get_sessions' });
}

function closeHistory() {
  historyOverlay.classList.add('hidden');
  historyPanel.classList.add('hidden');
}

historyBtn.addEventListener('click', openHistory);
historyClose.addEventListener('click', closeHistory);
historyOverlay.addEventListener('click', closeHistory);

sessionSearchInput.addEventListener('input', () => {
  sidebar.setSearchQuery(sessionSearchInput.value);
});

function handleSessionSelect(session) {
  sidebar.setActive(session.filePath || session.path || '');
  sessionTotalCost = 0;
  lastInputTokens = 0;
  updateCostDisplay();
  updateTokenUsage();

  const sessionPath = session.filePath || session.path || '';
  if (sessionPath) {
    VscodeIPC.send({ type: 'switch_session', sessionPath });
  }
  closeHistory();
}

// New Chat
newChatBtn.addEventListener('click', () => {
  VscodeIPC.send({ type: 'new_session' });
  sessionTotalCost = 0;
  lastInputTokens = 0;
  updateCostDisplay();
  updateTokenUsage();
  sidebar.clearActive();
});

// ═══════════════════════════════════════
// Keyboard shortcuts
// ═══════════════════════════════════════

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!settingsPanel.classList.contains('hidden')) { closeSettings(); return; }
    if (!accountsPanel.classList.contains('hidden')) { closeAccounts(); return; }
    if (!treePanel.classList.contains('hidden')) { closeTree(); return; }
    if (!historyPanel.classList.contains('hidden')) { closeHistory(); return; }
    if (!commandPalette.classList.contains('hidden')) { closeCommandPalette(); return; }
    if (!modelDropdownMenu.classList.contains('hidden')) { closeModelDropdown(); return; }
    if (state.isStreaming) {
      VscodeIPC.send({ type: 'abort' });
      messageRenderer.renderError('Aborted by user');
      showTypingIndicator(false);
    }
  }
  if (e.key === '/' && !isInInput()) {
    e.preventDefault();
    chatInput.element.focus();
  }
});

function isInInput() {
  const tag = document.activeElement?.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable;
}

// ═══════════════════════════════════════
// UI helpers
// ═══════════════════════════════════════

function showTypingIndicator(show, text = 'Thinking') {
  if (typingTextEl) typingTextEl.textContent = text;
  if (show && typingIndicator) messagesEl.appendChild(typingIndicator);
  if (typingIndicator) typingIndicator.classList.toggle('hidden', !show);
  if (show) messageRenderer.scrollToBottom();
}

function updateUI() {
  const streaming = state.isStreaming;
  sendBtn.classList.toggle('hidden', streaming);
  abortBtn.classList.toggle('hidden', !streaming);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

// ═══════════════════════════════════════
// IPC routing
// ═══════════════════════════════════════

VscodeIPC.on('pi_event', (msg) => handlePiEvent(msg.event));
VscodeIPC.on('sync', (msg) => handleSync(msg.state));
VscodeIPC.on('sessions_list', (msg) => {
  sidebar.setSessions(msg.sessions);
});
VscodeIPC.on('add_context', (msg) => {
  if (msg.context) chatInput.insertContextRef(msg.context);
});
VscodeIPC.on('editor_context', () => { /* future: editor context badge */ });
VscodeIPC.on('set_theme', () => { /* no-op: VS Code handles theming */ });
VscodeIPC.on('prefill_input', (msg) => {
  if (msg.text) {
    chatInput.element.textContent = msg.text;
    chatInput.element.focus();
    const range = document.createRange();
    range.selectNodeContents(chatInput.element);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }
});

VscodeIPC.on('rpc_response', (msg) => {
  const { command, success, data, error } = msg;
  if (!success && error) {
    console.error(`[Phi] RPC error (${command}):`, error);
    return;
  }

  switch (command) {
    case 'get_state':
      if (data) {
        if (data.model) {
          currentModelId = data.model.id || '';
          if (data.model.contextWindow) contextWindowSize = data.model.contextWindow;
          updateModelLabel();
        }
        if (data.thinkingLevel) {
          currentThinkingLevel = data.thinkingLevel;
          updateThinkingBtn();
          btnThinkingLevel.textContent = data.thinkingLevel;
        }
        if (typeof data.autoCompactionEnabled !== 'undefined') {
          toggleAutoCompact.className = `settings-toggle${data.autoCompactionEnabled ? ' on' : ''}`;
        }
      }
      break;

    case 'get_available_models':
      if (data?.models) {
        availableModels = data.models;
        if (modelDropdown._pendingOpen) {
          modelDropdown._pendingOpen = false;
          openModelDropdown();
        }
      }
      break;

    case 'cycle_thinking_level':
      if (data?.level) {
        currentThinkingLevel = data.level;
        updateThinkingBtn();
        btnThinkingLevel.textContent = data.level;
      }
      break;

    case 'get_session_stats':
      if (data) {
        const lines = [
          `📊 Session Stats`,
          `Messages: ${data.totalMessages} (${data.userMessages} user, ${data.assistantMessages} assistant)`,
          `Tool calls: ${data.toolCalls}`,
        ];
        if (data.tokens) lines.push(`Context: ~${(data.tokens.input / 1000).toFixed(1)}k tokens`);
        if (data.cost) lines.push(`Cost: $${data.cost.toFixed(4)}`);
        messageRenderer.renderSystemMessage(lines.join('\n'));
      }
      break;
  }
});

// ═══════════════════════════════════════
// Initialize
// ═══════════════════════════════════════

// Request full state sync from extension host
VscodeIPC.send({ type: 'request_sync' });

// Fetch model info
VscodeIPC.send({ type: 'get_state' });

messageRenderer.renderWelcome();

console.log('🚀 Phi initialized');
