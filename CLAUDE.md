# Bastion

Security-hardened terminal agent orchestrator. Forked from agent-view by Frayo44.

## Tech Stack

- **Runtime:** Bun
- **Framework:** Solid.js
- **UI:** OpenTUI (terminal UI framework)
- **Storage:** SQLite (via bun:sqlite)
- **Session Management:** tmux

## Project Structure

```
src/
├── cli/           # CLI entry point
├── core/          # Core business logic
│   ├── git.ts     # Git/worktree utilities
│   ├── history.ts # History manager for autocomplete
│   ├── session.ts # Session lifecycle management
│   ├── storage.ts # SQLite storage layer
│   ├── tmux.ts    # tmux session control
│   └── types.ts   # TypeScript types
└── tui/           # Terminal UI
    ├── component/ # Reusable components (dialogs)
    ├── context/   # Solid.js contexts (theme, sync, routes)
    ├── routes/    # Page components (home, session)
    └── ui/        # Base UI components (dialog, toast, autocomplete)
```

## Key Features

- **Session Management:** Create, stop, restart, delete AI agent sessions
- **Multiple Tools:** Claude Code, OpenCode, Gemini, Codex, Custom commands
- **Git Worktrees:** Create sessions in isolated git worktrees
- **Auto-suggestions:** Fuzzy search for previously used paths and branch names
- **Status Monitoring:** Real-time session status (running, waiting, idle, error)
- **Security Hardened:** No shell injection, restrictive directory permissions, symlink-safe signal files, SQL field allowlists, input validation

## Installation

### Quick Install

```bash
curl -fsSL https://raw.githubusercontent.com/tomstetson/bastion/main/install.sh | bash
```

### Manual Install

```bash
git clone https://github.com/tomstetson/bastion.git
cd bastion
bun install
bun run build
```

### Compile to Standalone Binary

```bash
bun run compile        # Compile for current platform
bun run compile:all    # Compile for all platforms (darwin/linux, x64/arm64)
```

### Uninstall

```bash
curl -fsSL https://raw.githubusercontent.com/tomstetson/bastion/main/uninstall.sh | bash
```

## Development

```bash
bun install      # Install dependencies
bun run dev      # Run in development mode
bun run build    # Build for production
bun run compile  # Compile standalone binary
bun test         # Run tests
```

## Important Files

- `src/tui/component/dialog-new.tsx` - New session dialog with tool selection
- `src/tui/routes/home.tsx` - Main home screen with session list
- `src/core/session.ts` - Session creation and lifecycle
- `src/core/git.ts` - Git worktree operations

## Security Notes

- All subprocess calls use `execFile()` / `spawnSync()` with argument arrays — never shell strings
- Config directories created with mode `0o700`
- Signal files stored in `~/.bastion/` (not `/tmp/`) to prevent symlink attacks
- SQL field names validated against an allowlist before interpolation
- Session IDs validated as UUID format at public method boundaries
- Release version tags validated as semver before use in download URLs
