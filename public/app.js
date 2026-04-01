/**
 * app.js — Phi Webview Main Coordinator
 *
 * Slim orchestrator that wires up all modules and handles the core Pi event loop.
 * All communication via VscodeIPC (VS Code message passing).
 */
import { VscodeIPC } from './vscode-ipc.js';
import { ChatInput } from './chat-input.js';
import { MessageRenderer } from './message-renderer.js';
import { ToolCardRenderer } from './tool-card.js';
import { StateManager } from './state.js';
import { SessionSidebar } from './session-sidebar.js';
import { EXTENSION_VERSION, PI_SDK_VERSION } from './version.js';

// Modules extracted from app.js
import { AttachmentManager } from './attachment-manager.js';
import { ModelPicker } from './model-picker.js';
import { CostMonitor } from './cost-monitor.js';
import { CommandPalette } from './command-palette.js';
import { TreePanel } from './tree-panel.js';
import { PromptAutocomplete } from './prompt-autocomplete.js';
import { PanelsManager } from './panels.js';

// ─── Core instances ───────────────────────────────────────────────────────────

const messagesEl = document.getElementById('messages');
const state = new StateManager();
const messageRenderer = new MessageRenderer(messagesEl);
const toolCardRenderer = new ToolCardRenderer(messagesEl);

const chatInput = new ChatInput('message-input', 'chat-form', (text) => {
  sendMessage(text);
});

// ─── Module instances ─────────────────────────────────────────────────────────

const attachmentManager = new AttachmentManager(chatInput);
const modelPicker = new ModelPicker();
const costMonitor = new CostMonitor();
const treePanel = new TreePanel();

const sidebar = new SessionSidebar(
  document.getElementById('session-list'),
  (session) => panels.handleSessionSelect(session)
);

const panels = new PanelsManager({
  sidebar,
  chatInput,
  onSessionSelect: () => {
    costMonitor.reset();
  },
  onNewSession: () => {
    VscodeIPC.send({ type: 'new_session' });
    costMonitor.reset();
  },
});

// Wire skills updates from panels to command palette & autocomplete
panels.onSkillsUpdate = (skills) => {
  commandPalette.updateSkills(skills);
};

const commandPalette = new CommandPalette({
  onCompact: () => VscodeIPC.send({ type: 'compact' }),
  onSessionStats: () => VscodeIPC.send({ type: 'get_session_stats' }),
  onOpenTree: () => treePanel.open(),
  onExpandAllTools: () => toolCardRenderer.expandAll(),
  onCollapseAllTools: () => toolCardRenderer.collapseAll(),
});

const autocomplete = new PromptAutocomplete(chatInput, {
  getBaseCommands: () => commandPalette.getBaseCommands(),
  getLoadedSkills: () => commandPalette.getLoadedSkills(),
});

// Wire model picker context window changes to cost monitor
modelPicker.onContextWindowChange = (size) => costMonitor.setContextWindowSize(size);

// Set version info
document.getElementById('about-version').textContent = `v${EXTENSION_VERSION}`;
document.getElementById('about-pi-version').textContent = `v${PI_SDK_VERSION}`;

// ─── DOM refs ─────────────────────────────────────────────────────────────────

const sendBtn = document.getElementById('send-btn');
const abortBtn = document.getElementById('abort-btn');
const typingIndicator = document.getElementById('typing-indicator');
const typingTextEl = document.getElementById('typing-text');
const queuedMessagesEl = document.getElementById('queued-messages');

// Scroll button
const scrollBottomBtn = document.getElementById('scroll-bottom-btn');
const scrollBottomBadge = document.getElementById('scroll-bottom-badge');

// ─── App state ────────────────────────────────────────────────────────────────

let currentStreamingEl = null;
let currentThinking = '';
let currentText = '';
let lastSentMessage = '';
let messageQueue = [];
let isScrolledUp = false;
let hasNewWhileScrolled = false;

// ═══════════════════════════════════════
// Send message
// ═══════════════════════════════════════

function sendMessage(text) {
  let message = typeof text === 'string' ? text : chatInput.getText();
  if (!message && !attachmentManager.hasPending()) return;
  chatInput.clear();

  const cmd = { type: 'prompt', message };
  if (attachmentManager.hasPending()) {
    cmd.images = attachmentManager.getImages();
    attachmentManager.clearImages();
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

        if (usage?.cost?.total) costMonitor.addCost(usage.cost.total);
        if (usage?.input) costMonitor.setUsage(usage);
        costMonitor.updateDisplay();
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
      VscodeIPC.send({ type: 'get_state' });
      costMonitor.setUsage({ input: 0 });
      costMonitor.updateDisplay();
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

  costMonitor.reset();
  costMonitor.setCost(syncState.sessionStats?.cost ?? 0);

  // Restore token usage from session stats if available
  if (syncState.sessionStats?.tokens) {
    const t = syncState.sessionStats.tokens;
    const inputTotal = (t.input || 0) + (t.cacheRead || 0);
    if (inputTotal > 0) {
      costMonitor.setUsage({ input: t.input || 0, cacheRead: t.cacheRead || 0 });
    }
  }

  if (syncState.model) {
    modelPicker.setModel(syncState.model);
    if (syncState.model.contextWindow) costMonitor.setContextWindowSize(syncState.model.contextWindow);
  }
  if (syncState.thinkingLevel) {
    modelPicker.setThinkingLevel(syncState.thinkingLevel);
  }

  if (syncState.skills) {
    commandPalette.updateSkills(syncState.skills);
  }

  if (syncState.entries && syncState.entries.length > 0) {
    renderHistory(syncState.entries);
  } else {
    messageRenderer.renderWelcome();
  }

  state.setStreaming(syncState.isStreaming);
  showTypingIndicator(syncState.isStreaming, 'Thinking');
  updateUI();
  costMonitor.updateDisplay();
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
        if (msg.usage?.input) costMonitor.setUsage(msg.usage);
      }

      for (const tc of toolCalls) {
        toolCardRenderer.createHistoryCard({ toolCallId: tc.id, toolName: tc.name, args: tc.arguments || {} });
      }
    } else if (msg.role === 'toolResult') {
      toolCardRenderer.addHistoryResult(msg.toolCallId, { content: msg.content || [] }, msg.isError);
    }
  }

  costMonitor.updateDisplay();

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
// Keyboard shortcuts
// ═══════════════════════════════════════

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (panels.tryCloseTopmost()) return;
    if (treePanel.isOpen()) { treePanel.close(); return; }
    if (commandPalette.isOpen()) { commandPalette.close(); return; }
    if (modelPicker.isOpen()) { modelPicker.close(); return; }
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
        modelPicker.handleStateResponse(data);
        panels.handleStateResponse(data);
        if (data.model?.contextWindow) costMonitor.setContextWindowSize(data.model.contextWindow);
      }
      break;

    case 'get_available_models':
      modelPicker.handleModelsResponse(data);
      break;

    case 'cycle_thinking_level':
      modelPicker.handleThinkingResponse(data);
      panels.handleThinkingResponse(data);
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

VscodeIPC.send({ type: 'request_sync' });
VscodeIPC.send({ type: 'get_state' });
messageRenderer.renderWelcome();

console.log('🚀 Phi initialized');
