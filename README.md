# Phi (φ) — Pi AI Agent for VS Code

<p align="center">
  <img src="assets/phi-icon.png" alt="Phi Logo" width="128" height="128">
</p>

> The golden ratio of AI-powered development.

<p align="center">
  <a href="https://www.buymeacoffee.com/gnassro" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" height="28"></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-0.2.1-blue" alt="Version">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="License"></a>
  <a href="https://github.com/gnassro/phi/stargazers"><img src="https://img.shields.io/github/stars/gnassro/phi?style=social" alt="Stars"></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/VS%20Code-^1.85.0-007ACC?logo=visual-studio-code" alt="VS Code">
  <img src="https://img.shields.io/badge/Pi%20SDK-0.62.0-purple" alt="Pi SDK">
  <img src="https://img.shields.io/badge/TypeScript-ESM-3178C6?logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/badge/vibe-coded%20🤙-ff69b4" alt="Vibe Coded">
  <img src="https://img.shields.io/badge/PRs-welcome-brightgreen" alt="PRs Welcome">
</p>

<p align="center">
  Support the project by giving the <a href="https://github.com/gnassro/phi">repo</a> a ⭐ and showing some ❤️!
</p>

Phi brings the [Pi](https://github.com/badlogic/pi-mono) AI coding agent into VS Code as a native extension. Chat with an AI agent that can read, write, and edit your code — directly from the sidebar.

> **⚠️ Note:** Phi is a community-built extension and does **not** yet cover the full Pi agent feature set. It's a work in progress, built through vibe coding, and we welcome all contributions to help reach full Pi parity. See [Contributing](#contributing) below.

<p align="center">
  <img src="assets/screenshots/scr1.png" alt="Phi in action" width="700">
</p>

---

## ✨ Features

### 💬 AI Chat in the Sidebar
A full-featured chat interface right inside VS Code. Send messages, receive streamed responses, and watch the agent think and work in real time.

### 🛠️ Tool Execution Cards
See exactly what the agent is doing — read, write, edit, and bash tool calls render as collapsible cards with live output streaming, inline diffs for edits, copy buttons, and auto-collapse on completion.

### 🧠 Thinking Blocks
When the model thinks before responding, you see it. Collapsible thinking blocks show the agent's reasoning process, toggleable from settings.

### 📂 Editor-Aware Context
Phi knows what you're working on:
- **Add selection to chat** — select code, press `⌘+` (Mac) / `Ctrl++` (Win/Linux), or right-click → "Phi: Add to Chat"
- **Add file to chat** — right-click a file in Explorer → "Phi: Add File to Chat"
- **Attach files** — click the 📎 button in the input area to attach images or any file type via the native file picker
- **Paste images** — paste images from clipboard (`Cmd+V`) to attach them inline
- **Ask about selection** — right-click selected code → "Phi: Ask About Selection"

Context references appear as lightweight chips showing the filename only — Pi reads the full file content itself.

### 📜 Session History
Browse and switch between past conversations, grouped by project. Search sessions by name. Favorites supported.

### 🌿 Conversation Tree
Navigate conversation branches, set labels on entries, and branch with optional context summaries. Full tree visualization with role icons and branch count badges.

### 🔧 Model & Settings
- **Model dropdown** with search — switch between all available models
- **Thinking level** — cycle off / low / medium / high
- **Auto-compaction** — toggle automatic context compaction
- **Manual compaction** — via command palette with progress indicator
- **Session cost & token usage** — live display in the footer with context window visualizer

### 🔑 Accounts & Auth
- **OAuth login** — Claude Pro/Max, ChatGPT Plus/Pro, GitHub Copilot, Google Gemini, and more
- **API keys** — 17 predefined providers
- Saved to `~/.phi/auth.json` — separate from Pi CLI auth

### ⌨️ Keyboard Shortcuts

| Action | Shortcut |
|---|---|
| Open Phi chat | `Cmd+Shift+L` / `Ctrl+Shift+L` |
| Add selection to chat | Select code → `⌘+` (Mac) / `Ctrl++` (Windows/Linux) |
| Abort current turn | `Escape` (when panel focused) |
| Focus chat input | Press `/` inside the Phi panel |

### 🎨 Native VS Code Theming
No custom themes — Phi automatically follows your VS Code theme (dark, light, high contrast) using built-in `--vscode-*` CSS variables.

---

## 📦 Install

### From Source (Development)

```bash
git clone https://github.com/gnassro/phi.git
cd phi
pnpm install              # or: npm install
pnpm run build            # or: npm run build

# Press F5 in VS Code to launch Extension Development Host
```

### Package & Install Locally

```bash
# automatically runs build first
pnpm run package          # or: npm run package
code --install-extension phi-agent-0.2.1.vsix
```

---

## 🧰 Usage

| Action | How |
|---|---|
| Open Phi chat | `Cmd+Shift+L` / `Ctrl+Shift+L` |
| Ask about selected code | Right-click → "Phi: Ask About Selection" |
| Add selection to chat | Select code → `Cmd+Shift+=` |
| Add file to chat | Right-click file in Explorer → "Phi: Add File to Chat" |
| Attach files | Click 📎 in the input area (images + any file type) |
| Paste images | `Cmd+V` / `Ctrl+V` with image in clipboard |
| New session | Command Palette → "Phi: New Session" |
| Switch session | Click the 🕐 history button → select a session |
| Switch model | Click the model dropdown in the header |
| Compact context | Click the commands button (in chat input) → "Compact" |
| View session stats | Click the commands button (in chat input) → "Session Stats" |
| Login (OAuth) | Command Palette → "Phi: Login" |
| Add API key | Command Palette → "Phi: Add API Key" |

---

## ⚠️ Disclaimer

This extension is in **early development** and comes with no warranty. Please be aware:

- **Not all features have been fully tested** — some may behave unexpectedly
- **Only tested on macOS** — Windows and Linux are untested and may have issues
- **Use at your own risk** — always review AI-generated code changes before accepting them

If you encounter any bugs or issues, please [open an issue](https://github.com/gnassro/phi/issues) on GitHub. Your feedback helps improve the extension for everyone.

---

## 🏗️ Architecture

Phi is a VS Code extension built with TypeScript + vanilla JS:

- **Extension Host** (Node.js) — runs the Pi SDK directly, manages sessions, handles auth
- **Webview** (Chromium sandbox) — chat UI, tool cards, settings panels
- **IPC** — all communication via VS Code's built-in message passing (`postMessage`)

The Pi SDK runs in the same Node.js process as the extension host — no external servers, no WebSocket, no HTTP. Sessions are stored at `~/.pi/agent/sessions/` (shared with the Pi CLI).

---

## 🔗 Relation to Pi

| Project | What it is |
|---|---|
| [**Pi**](https://github.com/badlogic/pi-mono) | The CLI AI coding agent (`pi` command) |
| **Phi** | A VS Code extension that brings Pi into the editor |

Phi uses the [Pi SDK](https://www.npmjs.com/package/@mariozechner/pi-coding-agent) (`@mariozechner/pi-coding-agent@0.62.0`) to run the agent directly inside VS Code's extension host.

> **Pi SDK compatibility:** Phi is built and tested against Pi SDK `0.62.0`. Newer versions may work but are not guaranteed until tested.

---

## 🚧 Current Status

Phi is functional and covers the core Pi agent experience, but it is **not yet a complete implementation** of all Pi features. Here's what's included:

### ✅ What Works
- Full chat with streaming responses
- Tool execution (read, write, edit, bash) with live output
- Session history, switching, and continuity
- Conversation tree with branching and navigation
- Model switching, thinking levels, context compaction
- OAuth login + API key management
- Editor context integration (selection, file, diagnostics)
- Cost and token tracking with context window visualizer

We welcome contributions to add more features! See [Contributing](#contributing).

---

## 🤝 Contributing

**Phi is a vibe-coded project** — built with AI agents (using Pi), iteratively refined, and open to everyone.

Whether you want to fix a bug, add a missing Pi feature, improve the UI, or write tests — contributions are welcome!

### How to Contribute

1. **Fork** the repository
2. **Clone** and install: `pnpm install`
3. **Build**: `pnpm run build`
4. **Test**: Press F5 in VS Code to launch the Extension Development Host
5. **Submit a PR** with a clear description of what you changed and why

### Areas Where Help Is Needed
- Bringing more Pi agent features into Phi
- Testing on different platforms (Windows, Linux)
- UI/UX improvements
- Documentation
- Accessibility

See `AGENTS.md` for the full technical reference — it's written for both humans and AI agents working on this codebase.

---

## 📝 License

This project is licensed under the [MIT License](LICENSE).

---

## 🙏 Credits

Built on top of the [Pi](https://github.com/badlogic/pi-mono) agent by [Mario Zechner](https://github.com/badlogic).