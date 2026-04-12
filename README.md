# Bastion

Native macOS app for managing multiple AI coding terminal sessions from a single window. Run Claude Code, Codex, Gemini, and other tools in parallel — organized by project with a tiled terminal grid.

> Originally inspired by [agent-view](https://github.com/frayo44/agent-view) by Frayo44. Rewritten as a native Electron app.

## Why Bastion?

When working with AI coding agents, you often run 10+ sessions across different projects. Bastion puts them all in one window with a project sidebar, tiled terminal grid, and real-time status detection — so you can see at a glance which sessions need your attention.

## Features

- **Tiled Terminal Grid** — Up to 6 fully interactive terminals on screen at once (1x1, 2x1, 2x2, 3x2, auto-responsive)
- **Project Organization** — Group sessions by project. Click a project to see all its terminals.
- **Real-time Status** — Multi-signal detection shows which sessions are running, waiting for input, idle, or errored
- **Tool Support** — Claude Code, Codex, Gemini, Shell, Custom commands
- **Session Resume** — Stop a session and resume it later with full conversation history (Claude Code)
- **Command Palette** — Cmd+K to fuzzy-search across all sessions
- **Context Menus** — Right-click sessions to rename, stop, restart, or delete
- **Window Persistence** — Position, size, and layout saved across restarts
- **Keyboard-First** — Full keyboard shortcuts for all actions
- **Security Hardened** — No shell injection, restrictive permissions, parameterized SQL, context isolation

## Status Indicators

| Color | Status | Meaning |
|-------|--------|---------|
| Green | Running | Agent is actively working |
| Amber | Waiting | Agent needs your input |
| Gray | Idle | No activity for 60s+ |
| Red | Error | Something went wrong |
| Dark | Stopped | Session ended |

## Installation

### From Source

```bash
git clone https://github.com/tomstetson/bastion.git
cd bastion
npm install
npm start
```

### Package as macOS App

```bash
npm run package    # Creates out/Bastion-darwin-*/Bastion.app
```

## Usage

Launch with `npm start`. The app opens with:
- **Left sidebar** — Projects, sessions, status filters
- **Main area** — Tiled terminal grid
- **Toolbar** — Grid layout switcher

### Create a Session

1. Click **"+ New"** or press **Cmd+N**
2. Choose a project folder (or add to existing project)
3. Select a tool (Claude Code, Shell, etc.)
4. Click **Create**

The terminal appears in the grid and is immediately interactive.

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Cmd+N | New session |
| Cmd+W | Stop focused session |
| Cmd+K | Command palette (fuzzy search) |
| Cmd+Enter | Maximize/restore focused tile |
| Cmd+1-6 | Focus tile by grid position |
| Cmd+[ / ] | Navigate between projects |
| Escape | Close dialog / restore zoomed tile |

### Grid Layouts

Click the layout buttons in the toolbar or let "Auto" adapt to your window size:
- **1x1** — Single terminal, full size
- **2x1** — Two terminals side by side
- **2x2** — Four terminals in a grid
- **3x2** — Six terminals (best on large displays)
- **Auto** — Adapts based on window width

## Development

```bash
npm install          # Install dependencies
npm start            # Dev mode (Vite HMR + Electron)
npm test             # Unit + integration tests
npm run test:e2e     # Playwright E2E tests
npm run typecheck    # TypeScript checking
```

### Native Module Note

`better-sqlite3` and `node-pty` require compilation matching the runtime ABI:
- `npm start` handles this automatically (prestart hook)
- After `npm install`, run `npm run rebuild:electron` before launching
- For unit tests under system Node: `npm run rebuild:node`

### Logs

Structured logs at `~/.bastion/bastion.log` (auto-rotated at 5MB):
```bash
tail -f ~/.bastion/bastion.log
```

## Tech Stack

- **Electron** (~35) — Native macOS window with embedded terminals
- **React 19** + **Zustand** — Renderer UI and state management
- **xterm.js** — Terminal emulator in the browser
- **node-pty** — Real PTY processes in the main process
- **better-sqlite3** — SQLite storage (WAL mode)
- **Vite** — Build tooling with HMR
- **Vitest** + **Playwright** — Testing (267 tests)

## Architecture

```
Electron Main Process          IPC           Renderer (React)
┌─────────────────────┐                    ┌──────────────────┐
│ SessionManager      │◄──── invoke ──────►│ Zustand Stores   │
│ PTYManager (node-pty)│◄── data/resize ──►│ xterm.js Tiles   │
│ Storage (SQLite)    │                    │ Sidebar + Grid   │
│ StatusDetector      │── status updates ─►│ Status Indicators│
│ ResumeManager       │                    │ Dialogs          │
└─────────────────────┘                    └──────────────────┘
```

## License

MIT
