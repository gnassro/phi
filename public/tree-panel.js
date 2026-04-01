/**
 * tree-panel.js — Conversation Tree Panel
 *
 * Renders the conversation tree, handles navigation, labeling, and filtering.
 * Receives a FLAT array of nodes (with parentId + childIds) from the extension
 * host to avoid postMessage structured clone failures on deeply nested trees.
 */
import { VscodeIPC } from './vscode-ipc.js';

export class TreePanel {
  constructor() {
    this.currentNodes = null;   // flat array of nodes
    this.currentLeafId = null;

    // DOM refs
    this.panel = document.getElementById('tree-panel');
    this.overlay = document.getElementById('tree-overlay');
    this.closeBtn = document.getElementById('tree-close');
    this.view = document.getElementById('tree-view');
    this.filter = document.getElementById('tree-filter');
    this.openBtn = document.getElementById('tree-btn');

    this._init();
  }

  _init() {
    this.openBtn.addEventListener('click', () => this.open());
    this.closeBtn.addEventListener('click', () => this.close());
    this.overlay.addEventListener('click', () => this.close());

    this.filter.addEventListener('change', () => {
      if (this.currentNodes) this._renderTree(this.currentNodes, this.currentLeafId);
    });

    // IPC listeners
    VscodeIPC.on('tree_data', (msg) => {
      if (msg.error) {
        this.view.innerHTML = `<div class="tree-empty">Failed to load tree: ${msg.error}</div>`;
        return;
      }
      this.currentNodes = msg.nodes;
      this.currentLeafId = msg.leafId;
      this._renderTree(msg.nodes, msg.leafId);
    });

    VscodeIPC.on('navigate_result', (msg) => {
      if (msg.success) this.close();
    });

    VscodeIPC.on('open_tree', () => this.open());
  }

  open() {
    this.panel.classList.remove('hidden');
    this.overlay.classList.remove('hidden');
    this.view.innerHTML = '<div class="tree-loading">Loading tree...</div>';
    VscodeIPC.send({ type: 'get_tree' });
  }

  close() {
    this.panel.classList.add('hidden');
    this.overlay.classList.add('hidden');
  }

  isOpen() {
    return !this.panel.classList.contains('hidden');
  }

  /**
   * Build a lookup map and children map from the flat node array.
   */
  _buildMaps(nodes) {
    const nodeMap = new Map();       // id → node
    const childrenMap = new Map();   // id → [child nodes]
    const roots = [];

    for (const node of nodes) {
      nodeMap.set(node.id, node);
      childrenMap.set(node.id, []);
    }

    for (const node of nodes) {
      if (node.parentId && nodeMap.has(node.parentId)) {
        childrenMap.get(node.parentId).push(node);
      } else if (!node.parentId || !nodeMap.has(node.parentId)) {
        roots.push(node);
      }
    }

    return { nodeMap, childrenMap, roots };
  }

  _renderTree(nodes, leafId) {
    if (!this.view) return;
    this.view.innerHTML = '';

    if (!nodes || nodes.length === 0) {
      this.view.innerHTML = '<div class="tree-empty">No conversation entries yet</div>';
      return;
    }

    const filterMode = this.filter.value;
    const { childrenMap, roots } = this._buildMaps(nodes);
    const container = document.createElement('div');
    container.className = 'tree-nodes';

    const flatList = [];
    this._flattenForDisplay(roots, childrenMap, leafId, 0, filterMode, flatList);

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
          this._showNavigateOptions(item);
        });
      }

      // Right-click to label
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._showLabelInput(item);
      });

      container.appendChild(el);
    }

    this.view.appendChild(container);

    // Scroll current node into view
    const currentEl = container.querySelector('.tree-node.current');
    if (currentEl) {
      setTimeout(() => currentEl.scrollIntoView({ block: 'center', behavior: 'smooth' }), 50);
    }
  }

  _shouldShowNode(node, filterMode) {
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
   * Flatten the flat-node tree for display using childrenMap for traversal.
   * Depth only increases at branch points (nodes with multiple visible children).
   * Linear chains stay at the same depth.
   */
  _flattenForDisplay(roots, childrenMap, leafId, depth, filterMode, result) {
    // Stack entries: [node, depth]
    const stack = [];
    for (let i = roots.length - 1; i >= 0; i--) {
      stack.push([roots[i], depth]);
    }

    while (stack.length > 0) {
      const [node, d] = stack.pop();
      const show = this._shouldShowNode(node, filterMode);
      const children = childrenMap.get(node.id) || [];
      const visibleChildren = children.filter(c => this._hasVisibleDescendants(c, childrenMap, filterMode));
      const isBranchPoint = visibleChildren.length > 1;

      if (show) {
        result.push({
          id: node.id,
          parentId: node.parentId,
          type: node.type,
          role: node.role,
          label: node.label,
          preview: node.preview,
          depth: d,
        });
      }

      const childDepth = isBranchPoint ? d + 1 : d;
      for (let i = children.length - 1; i >= 0; i--) {
        stack.push([children[i], childDepth]);
      }
    }
  }

  _hasVisibleDescendants(node, childrenMap, filterMode) {
    const stack = [node];
    while (stack.length > 0) {
      const n = stack.pop();
      if (this._shouldShowNode(n, filterMode)) return true;
      const children = childrenMap.get(n.id) || [];
      for (const child of children) {
        stack.push(child);
      }
    }
    return false;
  }

  _showNavigateOptions(node) {
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
          this._showCustomSummaryInput(node);
          return;
        }

        this.view.innerHTML = '<div class="tree-loading">Navigating...</div>';
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

    this.view.appendChild(opts);
    opts.scrollIntoView({ block: 'nearest' });
  }

  _showCustomSummaryInput(node) {
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
      this.view.innerHTML = '<div class="tree-loading">Navigating...</div>';
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
    this.view.appendChild(opts);
    input.focus();

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') goBtn.click();
      else if (e.key === 'Escape') cancelBtn.click();
    });
  }

  _showLabelInput(node) {
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
    this.view.appendChild(opts);
    input.focus();

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') saveBtn.click();
      else if (e.key === 'Escape') cancelBtn.click();
    });
  }
}
