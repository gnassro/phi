# Phi — Roadmap

This file describes what Phi is building toward, milestone by milestone.
**Agents: update this file when milestones are reached or scope changes.**

---

## Current Status: Scaffolding Complete — Awaiting First Test

All source files have been generated. The next action is to install dependencies
and run the Extension Development Host to verify the full stack works end to end.

See `docs/TASKS.md` for the detailed task checklist.

---

## Milestone 1 — Working Extension (In Progress)

**Goal:** The extension loads in VS Code, Pi boots, and a user can send a message and receive a streamed response.

**Definition of done:**
- `pnpm install` (or `npm install`) succeeds
- F5 launches Extension Development Host without errors
- Pi session initializes on activation
- User can type a prompt, press Enter, and see a streamed assistant reply in the webview
- Typing indicator shows/hides correctly
- Abort button cancels the current turn

---

## Milestone 2 — Editor Integration

**Goal:** Phi is genuinely useful inside VS Code because it is aware of what the user is doing in the editor.

**Definition of done:**
- "Ask About Selection" command sends correct file path + line numbers + selected code
- Active diagnostics (errors/warnings) are pushed to the webview on change
- Session history is preserved across VS Code restarts (continueRecent works)
- Image attachments work (attach → send → Pi receives the image)

---

## Milestone 3 — Packaged & Locally Installable

**Goal:** Phi can be packaged into a `.vsix` and installed locally on any machine without going through the marketplace.

**Definition of done:**
- `npx vsce package` produces a valid `.vsix`
- Installing via `code --install-extension phi-agent-0.1.0.vsix` works on a clean VS Code
- The extension icon shows up in the Extensions panel
- Tested on macOS

---

## Milestone 4 — Feature Complete v1

**Goal:** Phi feels like a polished, complete product — not just a proof of concept.

**Planned features:**
- Session history sidebar within the webview (browse + switch sessions)
- "Active file" context badge above the input area
- Thinking mode toggle (off / low / medium / high) in the UI
- Model switcher in the UI
- Settings panel (theme, model, API key override)
- Auto-inject workspace errors into context when there are active diagnostics
