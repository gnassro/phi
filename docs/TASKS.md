# Phi — Task Tracker

This file tracks all tasks for the Phi project.
**Agents: update this file whenever you complete a task or identify a new one.**

---

## ✅ Done

### Project Scaffold
- [x] Project directory created at `/Users/macbook/StudioProjects/phi/`
- [x] `package.json` — extension manifest, scripts, dependencies
- [x] `tsconfig.json` — TypeScript compiler config
- [x] `.vscodeignore` — files excluded from `.vsix` package

### Documentation
- [x] `AGENTS.md` — master AI agent guide with doc-update mandate
- [x] `README.md` — user-facing project description
- [x] `docs/architecture.md` — full system design and data flows
- [x] `docs/ipc-protocol.md` — complete message protocol specification
- [x] `docs/pi-sdk.md` — Pi SDK usage patterns for this project
- [x] `docs/TASKS.md` — this file
- [x] `docs/ROADMAP.md` — project roadmap

### Extension Host (`src/`)
- [x] `src/extension.ts` — `activate()` / `deactivate()` entry point
- [x] `src/agent-manager.ts` — Pi SDK session lifecycle wrapper
- [x] `src/panel-manager.ts` — WebviewPanel creation with CSP nonce
- [x] `src/ipc-bridge.ts` — message routing between webview and extension host
- [x] `src/editor-context.ts` — reads VS Code selection, diagnostics (read-only)
- [x] `src/commands.ts` — all four VS Code commands registered
- [x] `src/utils.ts` — `getNonce()` helper for Content Security Policy

### Webview UI (`public/`)
- [x] `public/index.html` — HTML shell with strict CSP
- [x] `public/vscode-ipc.js` — `acquireVsCodeApi()` wrapper (replaces WebSocket)
- [x] `public/app.js` — main UI coordinator adapted from Tau
- [x] `public/chat-input.js` — ContentEditable rich-text input (from Tau)
- [x] `public/message-renderer.js` — message DOM rendering (from Tau, Phi branding)
- [x] `public/markdown.js` — Markdown → HTML renderer (from Tau)
- [x] `public/style.css` — full theme system, all 6 themes

---

## 🔲 Pending

### Testing
- [ ] Run `pnpm install` (or `npm install`) and resolve any dependency issues
- [ ] Press F5 in VS Code → verify Extension Development Host launches cleanly
- [ ] Verify Pi session boots from `AgentManager.initialize()` on activation
- [ ] Verify IPC round-trip: type a prompt → extension host receives it → Pi responds → webview renders
- [ ] Verify editor context: select code → "Phi: Ask About Selection" → correct file + lines in prompt
- [ ] Verify diagnostics: introduce a TypeScript error → verify it appears in context push
- [ ] Verify session continuity: close and reopen VS Code → session history preserved
- [ ] Verify session switching via `switch_session` IPC message
- [ ] Verify image attachment: attach image → send → Pi receives it
- [ ] Verify typing indicator: shows "Thinking" on agent_start, "Working (bash)" on tool_execution_start
- [ ] Verify abort: click abort button → Pi stops streaming
- [ ] Verify theme switching: `set_theme` message changes `data-theme` on `<html>`
- [ ] Test on Windows (path separators, node-pty compatibility)
- [ ] Test on Linux

### Packaging & Local Install
- [ ] Create a 128x128 `assets/phi-icon.png` icon
- [ ] Run `pnpm run build` (or `npm run build`) with no TypeScript errors
- [ ] Run `pnpm exec vsce package` (or `npx vsce package`) → produces a valid `.vsix` file
- [ ] Install `.vsix` locally via `code --install-extension phi-agent-0.1.0.vsix`
- [ ] Verify the installed extension works on a clean VS Code window

### Features (Post-launch)
- [ ] Session history sidebar panel inside the webview
- [ ] "Active file" context badge above the input (shows current open file)
- [ ] Auto-inject diagnostics into prompt when there are errors
- [ ] Thinking mode toggle in the UI (off / low / medium / high)
- [ ] Model switcher in the UI
- [ ] Voice input (mic button — currently hidden)
- [ ] Settings panel (theme picker, model, API key override)
