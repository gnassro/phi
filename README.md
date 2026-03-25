# Phi (φ) — Pi AI Agent for VS Code

> The golden ratio of AI-powered development.

Phi brings the full [Pi](https://github.com/badlogic/pi-mono) AI coding agent natively into VS Code. Same sessions, same tools, same power — right inside your editor.

---

## What It Does

- **Full Pi agent** — the complete Pi AI engine runs inside VS Code, not as a mirror of a terminal but as a first-class citizen
- **Session continuity** — picks up exactly where you left off, per project
- **Editor-aware context** — Pi automatically sees your selected code, current file, and active errors
- **Ask about selection** — right-click any code → "Phi: Ask About Selection" → Pi gets the exact file, line numbers, and code
- **Real-time streaming** — thinking blocks, tool calls, typing indicator, all streamed live
- **Session history** — browse and switch between past conversations per project

---

## Install

Load it locally — no marketplace needed:

```bash
cd /Users/macbook/StudioProjects/phi
pnpm install              # or: npm install
pnpm run build            # or: npm run build

# Option A: press F5 in VS Code (development mode, easiest)
# Option B: package and install permanently
pnpm exec vsce package    # or: npx vsce package
code --install-extension phi-agent-0.1.0.vsix
```

---

## Usage

| Action | How |
|---|---|
| Open Phi chat | `Cmd+Shift+L` |
| Ask about selected code | Right-click → "Phi: Ask About Selection" |
| New session | Command Palette → "Phi: New Session" |
| Switch session | Click any session in the history panel |

---

## Development

```bash
cd /Users/macbook/StudioProjects/phi
pnpm install              # or: npm install
pnpm run build            # or: npm run build
# Press F5 in VS Code to launch Extension Development Host
```

---

## Architecture

Phi is a VS Code extension. The Pi SDK runs in the extension host (Node.js). The chat UI runs in a VS Code WebviewPanel (Chromium). They communicate via VS Code's IPC message-passing API.

See `AGENTS.md` for the full technical reference.

---

## Relation to Pi and Tau

| Project | What it is |
|---|---|
| **Pi** | The CLI AI coding agent (`pi` command) |
| **Tau** | A browser mirror of a running Pi terminal session (web UI) |
| **Phi** | A VS Code extension that runs Pi natively inside VS Code |

Phi is not a mirror. It **is** the agent.

---

## Credits

Built on top of the [Pi](https://github.com/badlogic/pi-mono) agent by [@mariozechner](https://github.com/mariozechner).
