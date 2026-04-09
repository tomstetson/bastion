# Bastion

Security-hardened terminal agent orchestrator. Electron desktop app with embedded terminals.

## Tech Stack

- **Runtime:** Node.js (via Electron ~35)
- **Framework:** React 19 + Zustand (state management)
- **Terminal:** xterm.js + node-pty (real PTY processes)
- **Storage:** SQLite (via better-sqlite3, WAL mode)
- **Build:** Electron Forge + Vite
- **Testing:** Vitest

## Commands

```bash
npm install          # Install dependencies
npm start            # Launch dev mode (Electron + Vite HMR)
npm test             # Run all tests (vitest)
npx vitest run tests/unit/     # Unit tests only
npx vitest run tests/integration/  # Integration tests only
npm run package      # Package app (Electron Forge)
npm run build        # Make distributable (DMG/ZIP)
npm run typecheck    # TypeScript type checking
```

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

tests/
├── unit/              # Unit tests (storage, types, status-detector, etc.)
└── integration/       # Integration tests (session lifecycle)
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

## Security Notes

- PTY processes spawned with argument arrays via node-pty — never shell strings
- Config directories created with mode `0o700`
- SQLite uses parameterized queries exclusively — no string interpolation
- Session IDs validated as UUID format at all public boundaries
- Context isolation enabled; nodeIntegration disabled in renderer
- Preload script exposes only specific IPC channels via contextBridge
