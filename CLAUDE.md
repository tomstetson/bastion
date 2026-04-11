# Bastion

Security-hardened terminal agent orchestrator. Electron desktop app with embedded terminals.

## Tech Stack

- **Runtime:** Node.js (via Electron ~35)
- **Framework:** React 19 + Zustand (state management)
- **Terminal:** xterm.js + node-pty (real PTY processes)
- **Storage:** SQLite (via better-sqlite3, WAL mode)
- **Build:** Electron Forge + Vite
- **Testing:** Vitest (unit/integration) + Playwright (E2E)
- **Logging:** Structured file logger (~/.bastion/bastion.log)

## Commands

```bash
npm install                        # Install dependencies
npm start                          # Launch dev mode (Vite + Electron)
npm run start:forge                # Launch via Forge (for initial .vite/build)
npm test                           # Unit + integration tests (vitest)
npm run test:e2e                   # E2E tests (Playwright)
npx vitest run tests/unit/         # Unit tests only
npx vitest run tests/integration/  # Integration tests only
npm run rebuild:electron           # Rebuild native modules for Electron
npm run rebuild:node               # Rebuild native modules for system Node (for tests)
npm run package                    # Package app (Electron Forge)
npm run build                      # Make distributable (DMG/ZIP)
npm run typecheck                  # TypeScript type checking
```

### Native Module Workflow
Native modules (better-sqlite3, node-pty) must match the runtime ABI:
- **For app development:** `npm run rebuild:electron` (or `npm start` does this automatically via prestart hook)
- **For unit tests:** `npm run rebuild:node` (vitest runs under system Node)
- **For E2E tests:** tests handle ABI switching automatically

## Project Structure

```
electron/              # Main process (Node.js)
├── main.ts            # App entry, window creation, lifecycle
├── preload.ts         # Context bridge (renderer ↔ main)
├── ipc-handlers.ts    # IPC message handlers
└── core/              # Core business logic
    ├── types.ts       # Shared TypeScript types
    ├── storage.ts     # SQLite storage layer (better-sqlite3)
    ├── session-manager.ts  # Session lifecycle orchestration
    ├── pty-manager.ts      # PTY process management (node-pty)
    ├── ring-buffer.ts      # Circular buffer for terminal output
    ├── status-detector.ts  # Session status heuristics
    ├── resume-manager.ts   # Session resume/restore logic
    ├── git.ts              # Git worktree operations
    ├── claude.ts           # Claude Code integration
    └── patterns/           # Status detection regex patterns

src/                   # Renderer process (React)
├── App.tsx            # Root React component
├── renderer.tsx       # Entry point
├── index.html         # HTML shell
├── components/        # UI components
│   ├── Sidebar/       # Project/session sidebar
│   ├── Toolbar/       # Top toolbar
│   ├── Grid/          # Terminal grid layout
│   ├── Dialogs/       # New session, rename, command palette
│   └── ContextMenu.tsx
├── hooks/             # React hooks (terminal, keyboard, grid, context menu)
├── store/             # Zustand stores (projects, sessions, UI)
├── styles/            # CSS (theme.css)
└── types/             # TypeScript declarations

scripts/
├── dev-start.js       # Dev launcher (Vite + Electron, bypasses Forge)
└── ensure-electron-modules.js  # Ensures native modules match Electron ABI

tests/
├── unit/              # Unit tests (storage, types, ring-buffer, etc.)
├── integration/       # Integration tests (session lifecycle)
└── e2e/               # Playwright E2E tests (38 tests)
```

## Key Features

- **Session Management:** Create, stop, restart, resume, delete AI agent sessions
- **Multiple Tools:** Claude Code, OpenCode, Gemini, Codex, Shell, Custom commands
- **Real Terminals:** Each session runs in a real PTY via node-pty, rendered with xterm.js
- **Grid Layout:** 1x1, 2x1, 2x2, 3x2, and auto grid layouts per project
- **Git Worktrees:** Create sessions in isolated git worktrees
- **Status Monitoring:** Real-time session status via terminal output analysis
- **Window Persistence:** Window position/size saved and restored across launches
- **Keyboard Shortcuts:** Cmd+N (new session), Cmd+K (command palette), Cmd+W (close)
- **Context Menus:** Right-click actions on sessions (stop, restart, rename, delete)

## Important Files

- `electron/main.ts` — App entry point, window creation, state persistence
- `electron/ipc-handlers.ts` — All renderer-to-main IPC message handlers
- `electron/core/session-manager.ts` — Session lifecycle orchestration
- `electron/core/pty-manager.ts` — PTY process spawning and management
- `electron/core/storage.ts` — SQLite persistence layer
- `src/App.tsx` — Root React component with layout
- `src/store/sessions.ts` — Zustand session state store
- `src/components/Grid/` — Terminal grid with xterm.js tiles
- `src/components/Dialogs/` — New session and command palette dialogs
- `forge.config.ts` — Electron Forge build configuration
- `electron/core/logger.ts` — Structured logging system
- `scripts/ensure-electron-modules.js` — Native module ABI management
- `scripts/dev-start.js` — Dev launcher (bypasses Forge process management)

## Logging

Structured logs write to `~/.bastion/bastion.log` (5MB rotation). To view:
```bash
tail -f ~/.bastion/bastion.log       # Follow live
cat ~/.bastion/bastion.log | grep ERROR  # Find errors
BASTION_LOG_LEVEL=debug npm start    # Enable debug logging
```

## Gotchas

- **Forge kills Electron on macOS:** `npm run start:forge` doesn't work reliably — Forge's process management terminates Electron immediately. Use `npm start` (dev-start.js) instead.
- **Native module ABI mismatch:** `better-sqlite3` and `node-pty` ship prebuilds for system Node that don't work in Electron. The `prestart` hook handles this, but after `npm install` you may need `npm run rebuild:electron`.
- **Port 5173 conflicts:** The Vite dev server URL is hardcoded in the built main.js. If port 5173 is occupied, the app shows a blank screen. `npm start` kills stale processes automatically.

## Security Notes

- PTY processes spawned with argument arrays via node-pty — never shell strings
- Config directories created with mode `0o700`
- SQLite uses parameterized queries exclusively — no string interpolation
- Session IDs validated as UUID format at all public boundaries
- Context isolation enabled; nodeIntegration disabled in renderer
- Preload script exposes only specific IPC channels via contextBridge
