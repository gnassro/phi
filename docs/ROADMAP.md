# Phi — Roadmap

This file describes what Phi is building toward, milestone by milestone.
**Agents: update this file when milestones are reached or scope changes.**

---

## Current Status: Milestone 2 Complete — Milestone 3 In Progress

Milestone 2 is complete: all features implemented including header bar, tool cards
(with collapse, spinner, diff view, copy button), session history, settings panel, accounts
panel (OAuth + API keys), scroll-to-bottom, cost/token display, context visualizer, command
palette, keyboard shortcuts, and thinking block toggle. CSS uses VS Code's native `--vscode-*`
variables exclusively. All inline onclick handlers replaced with addEventListener for CSP
compliance. Context refs show filename-only in rendered messages.

Recent polish: CSS tooltips on all header buttons (native `title` unreliable in VS Code
webviews), accounts icon changed to person-in-circle SVG, error message tooltips via CSS
`::after` pseudo-element with `data-error` attribute, copy button works on error-only messages,
paste fixed in chat input (Range API fallback for VS Code webview), webview asset cache-busting
to prevent stale JS/CSS after rebuilds.

Auth system: OAuth login via browser + API key management via VS Code QuickPick. Saved to
`~/.phi/auth.json`. Sessions shared with pi CLI at `~/.pi/agent/sessions/`.

Build: Extension host bundled with esbuild (Pi SDK `0.62.0` included). Self-contained `.vsix`
at 1.5 MB — no `node_modules` required. Published as `gnassro` on Open VSX.
Auto-incrementing build numbers injected directly into the webview footer.

Added Skills integration: Phi now fully supports Pi SDK skills. A dedicated "Skills" panel has been added to the header overlay, and typing `/` in the chat input instantly triggers an interactive slash-command autocomplete to quickly inject `/skill:name` templates.

Current focus: Milestone 4 (packaging) nearly complete. Manual testing ongoing.

---

## Milestone 1 — Working Extension ✅

**Goal:** The extension loads in VS Code, Pi boots, and a user can send a message and receive a streamed response.

**Definition of done:**
- ✅ `pnpm install` (or `npm install`) succeeds
- ✅ F5 launches Extension Development Host without errors
- ✅ Pi session initializes on activation
- ✅ User can type a prompt, press Enter, and see a streamed assistant reply in the webview
- ✅ Typing indicator shows/hides correctly
- ✅ Abort button cancels the current turn

---

## Milestone 2 — Full Feature Set ✅

**Goal:** Phi has a complete, rich UI — tool cards, session management, model switching, settings — running the Pi SDK directly in the extension host.

**Architecture:**
Pi SDK runs directly in the extension host — no external process needed.
All communication uses VS Code IPC.

**Features excluded (handled by VS Code natively):**
File browser, code editor, project launcher, PWA, mobile UI, auth, Tailscale.

**Definition of done:**
- Tool cards render for all tool types (bash, edit, read, write) with live streaming
- Edit tool shows inline diff view (red/green)
- Tool cards: spinner while running, auto-collapse on completion, no status text labels
- Header bar with model dropdown, thinking level, new chat, history, settings, accounts buttons
- Session history panel (overlay) with search, favourites, session switching
- Settings panel with thinking toggle, auto-compaction toggle (no theme picker — VS Code handles theming)
- Accounts panel (separate from settings) with OAuth login, API key add/remove, active-only list
- UI follows user's VS Code theme via `--vscode-*` CSS variables
- Scroll-to-bottom button with "New" badge
- Session cost and token usage display in footer
- Context window visualizer (clickable breakdown)
- Command palette (compact, session stats, expand/collapse tools)
- Keyboard shortcuts (Escape, /)
- Tool cards in session history restore
- Thinking blocks collapsible (CSP-compliant DOM event listeners)
- Context refs show filename only in rendered messages (full path on hover)
- Conversation tree panel: browse branches, navigate with optional summary, label entries

---

## Milestone 3 — Editor Integration

**Goal:** Phi is genuinely useful inside VS Code because it is aware of what the user is doing in the editor.

**Definition of done:**
- "Ask About Selection" command sends correct file path + line numbers + selected code
- Active diagnostics (errors/warnings) are pushed to the webview on change
- Session history is preserved across VS Code restarts (continueRecent works)
- Image attachments work (attach → send → Pi receives the image)

---

## Milestone 4 — Packaged & Locally Installable

**Goal:** Phi can be packaged into a `.vsix` and installed locally on any machine without going through the marketplace.

**Definition of done:**
- `pnpm run package` (automatically runs build and produces a valid `.vsix`)
- Installing via `code --install-extension phi-agent-0.1.0.vsix` works on a clean VS Code
- The extension icon shows up in the Extensions panel
- Tested on macOS

---

## Milestone 5 — Polish & Advanced Features

**Goal:** Phi feels like a polished, complete product — not just a proof of concept.

**Planned features:**
- "Active file" context badge above the input area
- Auto-inject workspace errors into context when there are active diagnostics
- ~~Voice input~~ (Web Speech API not available in VS Code webviews — removed)
- Model switcher with search and provider labels
