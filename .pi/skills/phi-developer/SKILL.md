---
name: phi-developer
description: Guide to working on the Phi VS Code extension project. Load this skill when adding features, fixing bugs, testing, or updating the UI for the Phi (pi-coding-agent) extension. It explains architecture, IPC, and VS Code extension constraints.
---

# Phi Developer Skill

This skill provides essential guidelines and commands for developing the **Phi VS Code extension** (a native implementation of the Pi AI coding agent).

## Core Architecture

Phi runs in two completely separate sandbox environments that CANNOT share memory:
1. **Extension Host** (`src/`): Runs Node.js, has access to the Pi SDK (`@mariozechner/pi-coding-agent`) and VS Code APIs (`vscode`).
2. **Webview UI** (`public/`): Runs in a Chromium sandbox. Vanilla JS & CSS only (No React, Vue, etc.). No Node.js APIs.

### The Golden Rules of Phi
- **Communication:** ALL data must pass back and forth via the `VscodeIPC` message bridge.
- **Theming:** Do NOT hardcode colors. Only use built-in `--vscode-*` CSS variables (e.g. `var(--vscode-editor-background)`).
- **Security:** The webview has a strict Content Security Policy (CSP). **No inline event handlers (`onclick="..."`)**. Always use `addEventListener` in `app.js`.

## Setup & Build Commands

Whenever you make a change to either the Extension Host (`src/`) or the Webview (`public/`), you must rebuild the project using `esbuild`.

```bash
# Install dependencies using pnpm
pnpm install

# Build everything (runs the version script, bundles extension, bundles webview)
pnpm run build

# Continuously watch and build on save
pnpm run watch

# Type-check the TypeScript files
pnpm run typecheck

# Package the extension into a standalone .vsix file
pnpm run package
```

## Adding New Features (The Pipeline)

When adding a new feature that requires UI and Backend interaction:

1. **Extension Host (`src/agent-manager.ts`):** 
   Expose the needed functionality from the Pi SDK.
2. **Message Protocol (`src/ipc-bridge.ts`):** 
   Add a new message type to `WebviewMessage` and handle the routing to `AgentManager`. Use `PanelManager.send()` to push data back to the UI.
3. **Webview UI (`public/app.js`):** 
   Use `VscodeIPC.send({ type: 'your_event' })` to talk to the backend. Listen for responses with `VscodeIPC.on('your_response', (msg) => { ... })`.

## Testing Changes Locally

If you need to test the `.vsix` package in a clean VS Code instance:
```bash
# 1. Package the extension
pnpm run package

# 2. Install it in your local VS Code
code --install-extension phi-agent-0.1.0.vsix
```
*Alternatively, press **F5** inside VS Code to launch the Extension Development Host.*

## Key Documentation Files to Read
If you are modifying complex systems, ALWAYS read these files before starting:
- [AGENTS.md](../../../AGENTS.md) — The absolute master guide and ruleset for AI agents.
- [docs/architecture.md](../../../docs/architecture.md) — Full breakdown of the system design and IPC flow.
- [docs/ipc-protocol.md](../../../docs/ipc-protocol.md) — Documentation of all existing Webview ↔ Extension Host messages.
- [docs/ROADMAP.md](../../../docs/ROADMAP.md) / [TASKS.md](../../../docs/TASKS.md) — For updating the current project status.