# Bastion v1 — Native macOS Terminal Session Manager

**Date:** 2026-04-08
**Status:** Proposed
**Author:** Tom Stetson + Claude

## Overview

Bastion is a native macOS application for managing multiple concurrent AI coding terminal sessions (Claude Code, Codex, Gemini, etc.) from a single window. It replaces the existing terminal-based TUI with an Electron app that embeds real, interactive terminal emulators organized into project-based grid layouts.

### Problem

Running 10+ Claude Code sessions across different projects means 10+ terminal windows scattered across desktops. There's no way to see status at a glance, organize sessions by project, or quickly triage which sessions need attention without manually switching between windows.

### Solution

A fullscreen-friendly macOS app with:
- A **sidebar** that organizes sessions into projects with live status indicators
- A **terminal grid** that tiles up to 6 fully interactive terminal sessions on screen simultaneously
- **Persistent layouts** — sessions remember their grid position and project assignment across restarts
- **Multi-signal status detection** for reliable "needs attention" indicators
- **Session resumption** — stopped sessions can be resumed with their conversation history intact

## Architecture

### High-Level

```
┌──────────────────────────────────────────────────┐
│               Electron Main Process              │
│  ┌────────────────────────────────────────────┐  │
│  │  Core Layer                                │  │
│  │  ├── SessionManager (adapted from existing)│  │
│  │  ├── Storage (SQLite, adapted)             │  │
│  │  ├── PTYManager (NEW — replaces tmux.ts)   │  │
│  │  ├── StatusDetector (NEW — multi-signal)   │  │
│  │  ├── GitManager (reused as-is)             │  │
│  │  ├── ClaudeIntegration (reused as-is)      │  │
│  │  └── ResumeManager (NEW)                   │  │
│  └────────────────────────────────────────────┘  │
│                      │ IPC                        │
│                      ▼                            │
│  ┌────────────────────────────────────────────┐  │
│  │          Electron Renderer Process         │  │
│  │  React + xterm.js                          │  │
│  │  ├── Sidebar                               │  │
│  │  │   ├── StatusFilters                     │  │
│  │  │   ├── ProjectTree                       │  │
│  │  │   └── StandaloneList                    │  │
│  │  ├── TerminalGrid                          │  │
│  │  │   ├── TerminalTile (xterm.js instance)  │  │
│  │  │   └── GhostTile (empty slot)            │  │
│  │  ├── Toolbar (breadcrumb + layout switcher)│  │
│  │  └── Dialogs (create, rename, settings)    │  │
│  └────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

### Tech Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Runtime | Electron | Native macOS app with embedded terminals; reuse existing TypeScript core |
| Frontend | React + TypeScript | Large ecosystem, best xterm.js integration, well-known |
| Terminal | xterm.js | Battle-tested terminal emulator (used by VS Code, Hyper); supports ANSI, mouse, resize |
| PTY | node-pty | Direct PTY management in main process; eliminates tmux dependency |
| Storage | SQLite (better-sqlite3) | Existing schema + migrations; WAL mode for crash resilience. Note: bun:sqlite is unavailable in Electron's Node.js runtime. |
| Build | Electron Forge or electron-builder | Standard Electron packaging for macOS |

### Key Architectural Decision: Drop tmux

The existing bastion uses tmux as a terminal multiplexer because the TUI cannot embed terminals directly. With Electron + node-pty, we manage PTYs directly:

- **Eliminates** tmux as a system dependency
- **Eliminates** tmux socket/config management (~700 LOC in tmux.ts)
- **Enables** direct PTY resize handling (no intermediary)
- **Enables** richer status detection (we own the data stream)
- **Simplifies** session lifecycle (no tmux session ↔ bastion session mapping)

### What We Reuse from Existing Codebase

| Module | Status | Changes Needed |
|--------|--------|---------------|
| `storage.ts` | Adapt | Schema migration for projects, grid layouts, resume data |
| `git.ts` | Reuse as-is | No changes needed |
| `claude.ts` | Reuse as-is | Session ID detection, fork commands all apply |
| `types.ts` | Extend | Add Project, GridLayout, ResumeData types |
| `session.ts` | Adapt | Replace tmux calls with PTY manager; add resume logic |
| `config.ts` | Adapt | Add Electron-specific settings (window state, grid prefs) |
| `history.ts` | Reuse as-is | Autocomplete for paths and branch names |
| Security patterns | Reuse | UUID validation, input sanitization, shell injection prevention |

### What We Delete

| Module | Reason |
|--------|--------|
| `src/tui/` (~8,000 LOC) | Replaced by React frontend |
| `tmux.ts` (~700 LOC) | Replaced by PTYManager |
| OpenTUI/Solid.js dependencies | No longer needed |

## Data Model

### Entities

```typescript
interface Project {
  id: string;              // UUID
  name: string;            // User-editable (e.g., "bastion")
  path: string;            // Absolute path (e.g., "/Users/tom/Projects/02-Personal/bastion")
  gridLayout: GridLayout;  // "1x1" | "2x1" | "2x2" | "3x2" | "auto"
  sortOrder: number;       // Sidebar position
  createdAt: number;       // Unix timestamp
  updatedAt: number;
}

interface Session {
  id: string;              // UUID
  projectId: string | null; // null = standalone
  name: string;            // User-editable label
  tool: Tool;              // "claude" | "opencode" | "gemini" | "codex" | "custom" | "shell"
  command: string;         // Full command string
  workingDir: string;      // Absolute path
  status: SessionStatus;   // "running" | "waiting" | "idle" | "error" | "stopped"
  gridSlot: number | null; // 0-5 position in project grid; null = overflow/standalone
  pid: number | null;      // PTY child process PID (for reconnection)
  toolData: Record<string, unknown>; // Tool-specific data (Claude session ID, etc.)
  worktreePath: string | null;
  worktreeBranch: string | null;
  resumeData: ResumeData | null;
  createdAt: number;
  updatedAt: number;
}

interface ResumeData {
  sessionId: string;       // Tool's session ID (e.g., Claude conversation ID)
  resumeCommand: string[]; // Full command array to resume
  capturedAt: number;      // When resume data was captured
  toolVersion: string;     // Tool version at capture time
  outputSnapshot: string;  // Last 500 lines of output for context
}

type GridLayout = "1x1" | "2x1" | "2x2" | "3x2" | "auto";
type SessionStatus = "running" | "waiting" | "idle" | "error" | "stopped";
type Tool = "claude" | "opencode" | "gemini" | "codex" | "custom" | "shell";
```

### Schema Migration

The existing `sessions` and `groups` tables migrate to the new schema:
- `groups` → `projects` (rename, add `gridLayout`, `sortOrder` columns)
- `sessions` → add `gridSlot`, `pid`, `resumeData` columns; rename `groupId` to `projectId`
- New table: `window_state` (position, size, active project, sidebar width)

### Auto-Project Detection

When creating a session with a working directory:
1. Check if a project already exists for that path (exact match or parent directory match for worktrees)
2. If yes → assign session to that project
3. If no → create a new project using the directory name
4. User can rename the project afterward

## PTY Management

### Lifecycle

```
Main Process (node-pty)          IPC              Renderer (xterm.js)
────────────────────────────────────────────────────────────────────
1. Session created
2. pty = spawn(tool, args, {
     cols, rows, cwd
   })
3. Store pty.pid in SQLite
4. pty.onData(data) ────────── pty:data:{id} ───► terminal.write(data)
5.                  ◄────────── pty:input:{id} ── terminal.onData(data)
                                                    → pty.write(data)
6. terminal resize  ◄────────── pty:resize:{id} ── ResizeObserver
     → pty.resize(cols, rows)
7. pty.onExit ──────────────── pty:exit:{id} ──► terminal shows "exited"
                                                   capture resumeData
```

### IPC Channel Design

Each session gets a dedicated IPC channel namespace: `pty:{sessionId}`. Events:
- `pty:data:{id}` — PTY output → renderer (throttled to ~60fps for high-throughput sessions)
- `pty:input:{id}` — User keystrokes → PTY
- `pty:resize:{id}` — Terminal resize → PTY resize
- `pty:exit:{id}` — PTY process exited
- `pty:status:{id}` — Status change notification

### Ring Buffer

Each PTY has an associated ring buffer (main process, in-memory):
- Capacity: ~10,000 lines per session
- Purpose: Replay recent output when a session comes back into view
- Persisted to disk on app close (per session, `~/.bastion/buffers/{sessionId}`)
- Loaded on app restart for stopped sessions (shows last state)

### Offscreen Session Handling

Sessions not currently visible in the grid:
- PTY keeps running, output flows into ring buffer
- xterm.js instance is disposed (saves renderer memory)
- When session becomes visible again: create new xterm.js, replay ring buffer
- Status detection continues (uses ring buffer data, not xterm.js)

### Session Survival Across App Restarts

PTY child processes are children of the Electron process. When Electron closes gracefully, we have two options:

**Option 1: Graceful close (default).** On app quit:
1. Capture `resumeData` for all running sessions (tool session IDs, output snapshots)
2. Flush ring buffers to disk
3. Allow PTY processes to terminate naturally with Electron

On relaunch:
1. Read sessions from SQLite
2. Previously-running sessions show as "stopped" with their persisted ring buffer output
3. Resume button is available for tools that support it (Claude → `--resume`)

**Option 2: Background persistence (future enhancement).** Keep a lightweight sidecar process (`bastion-daemon`) that holds PTY file descriptors open when Electron closes, allowing true reconnection. This is a v2 feature — it adds significant complexity (daemon lifecycle, fd passing) for a marginal UX improvement over the resume flow.

For v1, the resume-based approach is the right trade-off: simpler architecture, and Claude's `--resume` preserves the full conversation context anyway.

## Multi-Signal Status Detection

### Signal Sources

| Signal | Detection Method | Refresh Rate |
|--------|-----------------|-------------|
| PTY output patterns | Regex match on last 30 lines of ring buffer | Every 2s (visible) / 5s (offscreen) |
| PTY activity rate | Bytes-per-second over 10s sliding window | Continuous |
| Claude signal files | File watcher on `~/.claude/projects/{project}/` | Event-driven (fs.watch) |
| Process tree | Check child processes of PTY PID | Every 5s |
| PTY exit event | node-pty `onExit` callback | Immediate |

### Status Resolution

```
if pty exited                                    → STOPPED
if error pattern in last 10 lines                → ERROR
if waiting prompt AND activity rate ≈ 0          → WAITING
if activity rate > threshold                     → RUNNING
if activity rate ≈ 0 for 60s+ AND no prompt      → IDLE
```

### Tool-Specific Pattern Matchers

Each tool gets its own pattern module:

**Claude Code:**
- Waiting: `? ` prompt, `> ` prompt, permission requests ("Allow?", "Yes/No")
- Running: Spinner characters (`⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏`), "Thinking...", tool_use indicators
- Error: Stack traces, "Error:", "FATAL"
- Stopped: "Session ended", "/exit"

**Generic (Codex, Gemini, Custom):**
- Waiting: `$ ` prompt, `> ` prompt, `? ` prompt
- Running: Non-zero activity rate
- Error: "error", "Error", "ERROR", non-zero exit codes
- Stopped: Zero activity + no prompt for 5m+

New tools are supported by adding a pattern file — no core logic changes.

## Session Resumption

### Capture Flow

When a session stops (user-initiated or process exit):
1. Query `claude.ts` for the session's tool session ID (from `toolData`, signal files, or output parsing)
2. Build the resume command: `["claude", "--resume", sessionId]`
3. Capture last 500 lines of output as snapshot
4. Record tool version (from `claude --version` or similar)
5. Store in `resumeData` column

### Resume Flow

When user clicks "Resume":
1. Validate the resume data exists and session file is still present
2. If tool version mismatch → warn user but allow proceeding
3. Spawn new PTY with the resume command
4. Session keeps its name, project, grid slot — only the PTY is new
5. Update `resumeData` with new session ID after resume completes

### Tool Support Matrix

| Tool | Resume Supported | Mechanism |
|------|-----------------|-----------|
| Claude Code | Yes | `claude --resume <session-id>` |
| Codex | Future | Depends on CLI flags (not yet confirmed) |
| Gemini | Future | Depends on CLI flags (not yet confirmed) |
| Custom/Shell | No | Can re-run command but no conversation state |

## UI Layout

### Sidebar (220px, left)

```
┌─────────────────────┐
│ BASTION      [+ New] │
├─────────────────────┤
│ Status               │
│ [Running 5] [Wait 3] │
│ [Error 1]   [Idle 2] │
├─────────────────────┤
│ PROJECTS             │
│ ▼ bastion        2x2 │
│   ● refactor core    │
│   ● add tests        │
│   ● fix tmux bug     │
│   ○ docs update      │
│   + 2 more           │
│ ▶ claude-config    2 │
│ ▶ work-api         3 │
│                      │
│ STANDALONE           │
│   ● quick shell      │
├─────────────────────┤
│ 11 sessions · 5 run  │
└─────────────────────┘
```

**Interactions:**
- Click project → load its grid view
- Click session in grid → navigate to its project grid, focus that tile
- Click standalone session → show full-size
- Click status filter pill → show all sessions across projects matching that status
- Right-click project/session → context menu (rename, delete, move, etc.)
- Drag projects to reorder

### Toolbar (top of main area)

```
bastion › 4 sessions                    [1x1] [2x2] [3x2] [auto]
```

- Breadcrumb: current project name + session count
- Grid layout buttons: manual override or auto mode
- Active layout is highlighted

### Terminal Grid (main area)

Each tile:
```
┌────────────────────────────────────────────┐
│ ● refactor core    claude    2m ago    ⬜ ✕ │
├────────────────────────────────────────────┤
│                                            │
│  ~/Projects/02-Personal/bastion            │
│  $ claude                                  │
│                                            │
│  I've refactored the session manager...    │
│                                            │
│  ? Should I also update the tests?         │
│  █                                         │
│                                            │
└────────────────────────────────────────────┘
```

**Tile header:** Status dot, session name, tool badge, last activity timestamp, maximize button, close button.

**Tile interactions:**
- Click tile → focus (blue border, receives keyboard input)
- Double-click title bar → maximize/restore
- All keystrokes in focused tile pass through to PTY
- Cmd+1-6 to focus by grid position

**Ghost tile** (empty grid slot):
```
┌─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┐
│                       │
│          +            │
│     New Session       │
│       Cmd+N           │
│                       │
└─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┘
```

**Stopped session tile** (shows resume button):
```
┌────────────────────────────────────────────┐
│ ■ refactor core    claude    45m ago   ⬜ ✕ │
├────────────────────────────────────────────┤
│                                            │
│  Session ended.                            │
│                                            │
│  Last: "Updated 3 files, ready for review" │
│                                            │
│           [▶ Resume]  [✕ Remove]           │
│                                            │
└────────────────────────────────────────────┘
```

## Responsive Grid Behavior

### Auto Mode Breakpoints

| Available width (minus sidebar) | Layout | Max tiles |
|--------------------------------|--------|-----------|
| < 600px | 1x1 | 1 |
| 600–1100px | 2x1 | 2 |
| 1100–1600px | 2x2 | 4 |
| > 1600px | 3x2 | 6 |

### Minimum Tile Size

480px wide × 280px tall — below this, terminals are unusable for Claude Code output. The grid never subdivides below this threshold in auto mode.

### Resize Behavior

1. Window resize triggers layout recalculation (debounced 150ms)
2. If shrink drops tiles → last-focused tiles stay, others move to overflow in sidebar
3. Each xterm.js instance calls `fit()` after resize → recalculates cols/rows → sends resize to PTY
4. CSS grid transitions animate tile repositioning (200ms ease)

### Manual Override

User can pin to a specific layout via toolbar. The app respects it regardless of window size (tiles may become smaller than ideal). Switching to "auto" re-enables responsive behavior.

### Fullscreen Reference (27" display, 2560px wide)

- Sidebar: 220px
- Available: 2340px wide, ~1440px tall
- Auto: 3x2 grid → ~780px × ~720px per tile → ~100 columns × 45 rows per terminal

## Session Creation Flows

### New Session in Existing Project

1. Click "+" ghost tile in grid, or right-click project → "New Session", or Cmd+N while viewing a project
2. Dialog shows:
   - **Tool** picker (Claude, Codex, Gemini, Custom, Shell)
   - **Name** (auto-generated, editable)
   - **Path** (pre-filled from project path, not editable)
   - **Worktree** toggle: create git worktree? If yes: branch name input with autocomplete
3. Session created → lands in next available grid slot
4. PTY spawns → terminal is live immediately

### New Project

1. Click sidebar "+ New" button, or Cmd+N with no project selected
2. **Native macOS folder picker** (`NSOpenPanel`) opens
   - Supports creating new folders within the picker
   - Supports navigating to any directory
3. Directory selected → project created with folder name (editable inline)
4. Drops into "New Session in Existing Project" flow for the first session

### New Standalone Session

1. Cmd+N → choose "Standalone" instead of a project
2. Native folder picker for working directory
3. Same tool/name/worktree options
4. Session appears under "Standalone" in sidebar

## Keyboard Shortcuts

### Global (always active)

| Shortcut | Action |
|----------|--------|
| Cmd+N | New session dialog |
| Cmd+W | Close focused session (with confirmation) |
| Cmd+1 through Cmd+6 | Focus tile by grid position |
| Cmd+Enter | Maximize/restore focused tile |
| Cmd+[ | Previous project |
| Cmd+] | Next project |
| Cmd+K | Command palette (fuzzy search all sessions) |
| Cmd+, | Settings |
| Escape | Restore maximized tile / close dialog |

### Within Focused Tile

All keystrokes pass directly to the PTY. Cmd-based shortcuts don't conflict because terminal apps use Ctrl, not Cmd.

## Persistence & Crash Recovery

### What's Persisted

| Data | Storage | When |
|------|---------|------|
| Projects | SQLite | On every change |
| Sessions | SQLite | On every change |
| Grid layouts | SQLite | On change (debounced 1s) |
| Window state | SQLite | On window move/resize (debounced 1s) |
| Ring buffers | Disk (`~/.bastion/buffers/`) | On app close; emergency flush every 60s |
| Resume data | SQLite | On session stop |

### App Close Behavior

1. Capture `resumeData` for all running sessions
2. All ring buffers flushed to disk
3. Window state saved
4. PTY processes terminate with Electron
5. On relaunch: previously-running sessions show as "stopped" with resume button and persisted output

### Crash Recovery

- SQLite WAL mode survives unclean shutdown
- Ring buffers have periodic flush (every 60s) — at most 60s of output lost on crash
- Grid state saved on every change (debounced 1s) — at most 1s of layout changes lost
- On unclean shutdown: `resumeData` may not have been captured. Status detector's last-known state (persisted every 5s) provides fallback. Sessions show as "stopped (unclean)" with whatever ring buffer data was last flushed.

## Testing Strategy

### Unit Tests (bun test)

- **PTYManager** — spawn, write, resize, exit handling, ring buffer
- **StatusDetector** — pattern matching per tool, signal combination logic, edge cases
- **ResumeManager** — capture, validate, resume command building
- **Storage migrations** — schema upgrade from existing bastion DB
- **Existing tests** — session utilities, git operations, claude integration, config (preserved and adapted)

### Integration Tests

- **Session lifecycle** — create → running → waiting → stop → resume
- **PTY ↔ xterm.js** — data flow, resize propagation, high-throughput handling
- **Reconnection** — simulate app restart, verify process re-attachment
- **Storage** — CRUD operations, migration from existing schema

### E2E Tests (Playwright or Spectron)

- **Full flow** — launch app, create project, create session, interact with terminal, close, relaunch, verify state
- **Grid layouts** — resize window, verify layout changes, verify tile focus
- **Sidebar navigation** — project switching, session focusing, status filters

### What We Don't Test

- xterm.js internals (third-party, well-tested)
- Electron framework behavior
- node-pty internals
- OS-level PTY behavior

## v1 Scope

### Must Have

- Native macOS Electron app
- Sidebar with project grouping (auto-detected from path)
- Flexible terminal grid (auto-responsive, manual override, 1x1 through 3x2)
- All tiles fully interactive (xterm.js + node-pty)
- Persistent grid layouts (sessions remember their slot)
- Session creation with native folder picker
- Ghost "+" tiles in empty grid slots
- Multi-signal status detection
- Session lifecycle (create, stop, restart, delete)
- Session resumption (capture + resume, Claude first-class)
- Rename sessions and projects
- Quick status filters in sidebar
- Keyboard shortcuts (Cmd+N, Cmd+1-6, Cmd+Enter, Cmd+K)
- SQLite persistence (migrated from existing schema)
- Dark theme
- Terminal tile headers with last activity timestamp
- Ring buffer with persistence for output history
- Crash recovery and process reconnection

### v2 (Future)

- Light theme / theme customization
- Claude session forking
- Auto-update mechanism
- Cross-project drag-and-drop
- Global search across all session output
- Session output export
- Menu bar companion
- Codex/Gemini resume support (once their CLIs support it)

## Project Structure

```
bastion/
├── electron/
│   ├── main.ts                    # Electron main process entry
│   ├── preload.ts                 # Context bridge for IPC
│   └── core/
│       ├── session-manager.ts     # Adapted from existing session.ts
│       ├── pty-manager.ts         # NEW — PTY lifecycle + ring buffer
│       ├── status-detector.ts     # NEW — multi-signal status
│       ├── resume-manager.ts      # NEW — session resumption
│       ├── storage.ts             # Adapted from existing
│       ├── git.ts                 # Reused as-is
│       ├── claude.ts              # Reused as-is
│       ├── config.ts              # Adapted for Electron
│       ├── history.ts             # Reused as-is
│       └── types.ts               # Extended
├── src/                           # React renderer
│   ├── App.tsx
│   ├── components/
│   │   ├── Sidebar/
│   │   │   ├── Sidebar.tsx
│   │   │   ├── ProjectTree.tsx
│   │   │   ├── SessionItem.tsx
│   │   │   ├── StatusFilters.tsx
│   │   │   └── StandaloneList.tsx
│   │   ├── Grid/
│   │   │   ├── TerminalGrid.tsx
│   │   │   ├── TerminalTile.tsx
│   │   │   └── GhostTile.tsx
│   │   ├── Toolbar/
│   │   │   └── Toolbar.tsx
│   │   └── Dialogs/
│   │       ├── NewSessionDialog.tsx
│   │       ├── NewProjectDialog.tsx
│   │       ├── RenameDialog.tsx
│   │       ├── SettingsDialog.tsx
│   │       └── CommandPalette.tsx
│   ├── hooks/
│   │   ├── useTerminal.ts         # xterm.js lifecycle + IPC
│   │   ├── useSession.ts          # Session state management
│   │   ├── useGrid.ts             # Grid layout + responsive
│   │   └── useKeyboard.ts         # Global shortcuts
│   ├── store/
│   │   ├── sessions.ts            # Session state (React context or Zustand)
│   │   ├── projects.ts            # Project state
│   │   └── ui.ts                  # UI state (focused tile, active project)
│   └── styles/
│       └── theme.css              # Dark theme + CSS variables
├── tests/
│   ├── unit/
│   │   ├── pty-manager.test.ts
│   │   ├── status-detector.test.ts
│   │   ├── resume-manager.test.ts
│   │   ├── storage.test.ts
│   │   └── ... (existing tests, adapted)
│   ├── integration/
│   │   ├── session-lifecycle.test.ts
│   │   ├── reconnection.test.ts
│   │   └── storage-migration.test.ts
│   └── e2e/
│       ├── app-launch.test.ts
│       ├── grid-layout.test.ts
│       └── sidebar-navigation.test.ts
├── package.json
├── tsconfig.json
├── electron-builder.yml           # or forge.config.ts
├── CLAUDE.md
└── docs/
```

## Security Considerations

All security patterns from the existing codebase carry forward:

- **No shell injection** — all subprocess calls use `execFile()` / `spawn()` with argument arrays
- **UUID validation** — session and project IDs validated at public method boundaries
- **SQL injection prevention** — field allowlisting, parameterized queries
- **Directory permissions** — `0o700` on all created directories (`~/.bastion/`, buffers, etc.)
- **Input validation** — branch names, paths, session names sanitized
- **No secrets in storage** — session output buffers may contain sensitive data; stored with restrictive file permissions (`0o600`)
- **Ring buffer files** — stored in `~/.bastion/buffers/` with `0o600` permissions
- **Resume data** — tool session IDs stored in SQLite only, not logged
