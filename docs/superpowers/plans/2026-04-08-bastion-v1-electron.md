# Bastion v1 Electron App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite bastion from a terminal TUI into a native macOS Electron app with React + xterm.js that manages multiple AI coding sessions in a project-organized, tiled terminal grid.

**Architecture:** Electron main process hosts the core layer (PTY management, SQLite storage, status detection, session lifecycle). React renderer with xterm.js provides the UI. IPC bridges the two via typed channels. The existing core modules (git.ts, claude.ts, storage.ts, types.ts) are adapted for the Electron/Node.js runtime; the TUI layer and tmux dependency are deleted entirely.

**Tech Stack:** Electron 33+, React 19, TypeScript 5.3+, xterm.js 5+, node-pty 1.x, better-sqlite3, Electron Forge

**Spec:** `docs/superpowers/specs/2026-04-08-bastion-v1-electron-design.md`

**Security Note:** All subprocess calls MUST use `execFile()` / `spawn()` with argument arrays — never shell strings. This is a hard requirement carried over from the existing codebase.

---

## Phase 1: Foundation

### Task 1: Scaffold Electron + React project with Electron Forge

**Files:**
- Create: `forge.config.ts`
- Create: `electron/main.ts`
- Create: `electron/preload.ts`
- Create: `src/index.html`
- Create: `src/renderer.tsx`
- Create: `src/App.tsx`
- Create: `vite.main.config.ts`
- Create: `vite.preload.config.ts`
- Create: `vite.renderer.config.ts`
- Modify: `package.json`
- Modify: `tsconfig.json`
- Create: `tsconfig.electron.json`

- [ ] **Step 1: Install Electron Forge and core dependencies**

```bash
npm init -y
npm install --save-dev @electron-forge/cli @electron-forge/maker-dmg @electron-forge/maker-zip @electron-forge/plugin-vite electron typescript
npm install --save react react-dom @xterm/xterm @xterm/addon-fit @xterm/addon-webgl better-sqlite3 node-pty fuzzysort zustand
npm install --save-dev @types/react @types/react-dom @types/better-sqlite3 @vitejs/plugin-react vite vitest
```

- [ ] **Step 2: Create forge.config.ts**

```typescript
import type { ForgeConfig } from "@electron-forge/shared-types";
import { MakerDMG } from "@electron-forge/maker-dmg";
import { MakerZIP } from "@electron-forge/maker-zip";
import { VitePlugin } from "@electron-forge/plugin-vite";

const config: ForgeConfig = {
  packagerConfig: {
    name: "Bastion",
    executableName: "bastion",
    icon: "./assets/icon",
    osxSign: {},
  },
  makers: [
    new MakerDMG({}),
    new MakerZIP({}, ["darwin"]),
  ],
  plugins: [
    new VitePlugin({
      build: [
        { entry: "electron/main.ts", config: "vite.main.config.ts" },
        { entry: "electron/preload.ts", config: "vite.preload.config.ts" },
      ],
      renderer: [
        { name: "main_window", config: "vite.renderer.config.ts" },
      ],
    }),
  ],
};

export default config;
```

- [ ] **Step 3: Create vite config files**

Create `vite.main.config.ts`:
```typescript
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rollupOptions: {
      external: ["better-sqlite3", "node-pty"],
    },
  },
});
```

Create `vite.preload.config.ts`:
```typescript
import { defineConfig } from "vite";

export default defineConfig({});
```

Create `vite.renderer.config.ts`:
```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": "/src",
    },
  },
});
```

- [ ] **Step 4: Create electron/main.ts (minimal shell)**

```typescript
import { app, BrowserWindow } from "electron";
import path from "node:path";

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: "hiddenInset",
    backgroundColor: "#0d1117",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
    );
  }
}

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string;
declare const MAIN_WINDOW_VITE_NAME: string;

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  app.quit();
});
```

- [ ] **Step 5: Create electron/preload.ts (minimal)**

```typescript
import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("bastion", {
  ping: () => "pong",
});
```

- [ ] **Step 6: Create src/index.html**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Bastion</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { background: #0d1117; color: #c9d1d9; font-family: -apple-system, BlinkMacSystemFont, sans-serif; overflow: hidden; }
      #root { height: 100vh; width: 100vw; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/renderer.tsx"></script>
  </body>
</html>
```

- [ ] **Step 7: Create src/renderer.tsx and src/App.tsx**

`src/renderer.tsx`:
```typescript
import { createRoot } from "react-dom/client";
import { App } from "./App";

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
```

`src/App.tsx`:
```typescript
export function App() {
  return (
    <div style={{ display: "flex", height: "100vh" }}>
      <div style={{ width: 220, background: "#161b22", borderRight: "1px solid #30363d", padding: 16 }}>
        <h1 style={{ fontSize: 14, fontWeight: "bold", color: "#f0f6fc" }}>BASTION</h1>
        <p style={{ color: "#8b949e", fontSize: 12, marginTop: 8 }}>Sidebar placeholder</p>
      </div>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "#8b949e" }}>Terminal grid placeholder</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Update package.json scripts**

```json
{
  "name": "bastion",
  "version": "1.0.0-alpha.0",
  "description": "Native macOS terminal session manager for AI coding agents",
  "main": ".vite/build/main.js",
  "scripts": {
    "start": "electron-forge start",
    "build": "electron-forge make",
    "package": "electron-forge package",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit -p tsconfig.electron.json && tsc --noEmit"
  }
}
```

- [ ] **Step 9: Create tsconfig.electron.json and update tsconfig.json**

`tsconfig.electron.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "outDir": "./dist-electron",
    "rootDir": ".",
    "declaration": false
  },
  "include": ["electron/**/*"],
  "exclude": ["node_modules"]
}
```

`tsconfig.json` (renderer):
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "jsx": "react-jsx",
    "outDir": "./dist",
    "rootDir": "./src",
    "paths": { "@/*": ["./src/*"] },
    "baseUrl": "."
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "electron"]
}
```

- [ ] **Step 10: Run the app to verify scaffold works**

```bash
npm start
```

Expected: Electron window opens with dark background, "BASTION" header in sidebar, "Terminal grid placeholder" in main area.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: scaffold Electron + React project with Forge"
```

---

### Task 2: Delete TUI code and old dependencies

**Files:**
- Delete: `src/tui/` (entire directory)
- Delete: `src/core/tmux.ts`
- Delete: `src/index.ts` (old TUI entry point)
- Delete: `src/cli/` (old CLI entry point)
- Delete: `scripts/build.ts`, `scripts/compile.ts`, `scripts/release.ts`
- Modify: `.gitignore`

- [ ] **Step 1: Delete TUI, tmux, old entry points, and build scripts**

```bash
rm -rf src/tui/ src/cli/ src/index.ts src/core/tmux.ts
rm -f scripts/build.ts scripts/compile.ts scripts/release.ts
```

- [ ] **Step 2: Update .gitignore for Electron**

Append to `.gitignore`:
```
out/
.vite/
dist-electron/
*.dmg
.superpowers/
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: delete TUI, tmux, and old CLI code"
```

---

### Task 3: Adapt core types for Electron

**Files:**
- Create: `electron/core/types.ts`
- Create: `tests/unit/types.test.ts`

- [ ] **Step 1: Write failing test for new types**

Create `tests/unit/types.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import type { Project, Session, ResumeData, GridLayout, SessionStatus, Tool } from "../../electron/core/types";
import { getToolCommand, validateUUID } from "../../electron/core/types";

describe("types", () => {
  it("getToolCommand returns correct commands", () => {
    expect(getToolCommand("claude")).toBe("claude");
    expect(getToolCommand("shell")).toBe(process.env.SHELL || "/bin/zsh");
    expect(getToolCommand("custom")).toBe("");
  });

  it("validateUUID accepts valid UUIDs", () => {
    expect(validateUUID("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
  });

  it("validateUUID rejects invalid strings", () => {
    expect(validateUUID("not-a-uuid")).toBe(false);
    expect(validateUUID("")).toBe(false);
  });

  it("allows all GridLayout values", () => {
    const layouts: GridLayout[] = ["1x1", "2x1", "2x2", "3x2", "auto"];
    expect(layouts).toHaveLength(5);
  });

  it("allows all SessionStatus values", () => {
    const statuses: SessionStatus[] = ["running", "waiting", "idle", "error", "stopped"];
    expect(statuses).toHaveLength(5);
  });

  it("allows all Tool values", () => {
    const tools: Tool[] = ["claude", "opencode", "gemini", "codex", "custom", "shell"];
    expect(tools).toHaveLength(6);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/unit/types.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create electron/core/types.ts**

```typescript
export type GridLayout = "1x1" | "2x1" | "2x2" | "3x2" | "auto";
export type SessionStatus = "running" | "waiting" | "idle" | "error" | "stopped";
export type Tool = "claude" | "opencode" | "gemini" | "codex" | "custom" | "shell";

export interface Project {
  id: string;
  name: string;
  path: string;
  gridLayout: GridLayout;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

export interface Session {
  id: string;
  projectId: string | null;
  name: string;
  tool: Tool;
  command: string;
  workingDir: string;
  status: SessionStatus;
  gridSlot: number | null;
  pid: number | null;
  toolData: Record<string, unknown>;
  worktreePath: string | null;
  worktreeBranch: string | null;
  resumeData: ResumeData | null;
  createdAt: number;
  updatedAt: number;
}

export interface ResumeData {
  sessionId: string;
  resumeCommand: string[];
  capturedAt: number;
  toolVersion: string;
  outputSnapshot: string;
}

export interface SessionCreateOptions {
  name?: string;
  tool: Tool;
  command?: string;
  workingDir: string;
  projectId?: string;
  worktreeBranch?: string;
  claudeOptions?: ClaudeOptions;
}

export interface ClaudeOptions {
  sessionMode: "new" | "resume";
  resumeSessionId?: string;
  skipPermissions?: boolean;
}

export interface WindowState {
  x: number;
  y: number;
  width: number;
  height: number;
  activeProjectId: string | null;
  sidebarWidth: number;
}

export function getToolCommand(tool: Tool): string {
  switch (tool) {
    case "claude": return "claude";
    case "opencode": return "opencode";
    case "gemini": return "gemini";
    case "codex": return "codex";
    case "shell": return process.env.SHELL || "/bin/zsh";
    case "custom": return "";
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateUUID(id: string): boolean {
  return UUID_PATTERN.test(id);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/unit/types.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add electron/core/types.ts tests/unit/types.test.ts
git commit -m "feat: add core types for Electron app"
```

---

### Task 4: Storage layer (adapt for better-sqlite3)

**Files:**
- Create: `electron/core/storage.ts`
- Create: `tests/unit/storage.test.ts`

- [ ] **Step 1: Write failing tests for storage**

Create `tests/unit/storage.test.ts` — test CRUD for projects, sessions, window state, UUID validation. Include tests for:
- `createProject` / `getProject` / `listProjects` / `findProjectByPath` / `updateProject` / `deleteProject`
- `createSession` / `getSession` / `listSessionsByProject` / `listStandaloneSessions` / `updateSessionStatus` / `updateSessionGridSlot` / `updateSessionResumeData` / `deleteSession`
- `saveWindowState` / `getWindowState`
- Rejection of invalid UUID format

Each test should use a temp directory for the database and clean up afterward.

See the full test code in the spec implementation details (Task 4 in the original plan). The test file should be ~100 lines covering all CRUD operations.

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/unit/storage.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement electron/core/storage.ts**

Storage class using `better-sqlite3` with:
- WAL mode, busy_timeout 5000ms, foreign_keys ON
- Tables: `metadata`, `projects`, `sessions`, `window_state`
- All SQL uses parameterized queries (never string interpolation)
- `rowToProject()` and `rowToSession()` mapper methods
- `resumeData` stored as JSON string, parsed on read
- `toolData` stored as JSON string, parsed on read
- UUID validation at all public method entry points
- Directory creation with `mode: 0o700`

See the full implementation in the spec. The file should be ~250 lines.

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/unit/storage.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add electron/core/storage.ts tests/unit/storage.test.ts
git commit -m "feat: add storage layer with better-sqlite3"
```

---

### Task 5: Ring Buffer implementation

**Files:**
- Create: `electron/core/ring-buffer.ts`
- Create: `tests/unit/ring-buffer.test.ts`

- [ ] **Step 1: Write failing tests**

Test cases:
- Append and retrieve lines
- Split multi-line input on `\n`
- Wrap when capacity exceeded (oldest lines evicted)
- `getLines(n)` returns last N lines
- `getAll()` returns everything
- Handle partial lines (no trailing newline)
- Track `bytesWritten` counter
- `resetBytesCounter()`
- `saveToDisk()` / `loadFromDisk()` roundtrip
- `loadFromDisk()` returns empty buffer for nonexistent path

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/unit/ring-buffer.test.ts
```

- [ ] **Step 3: Implement electron/core/ring-buffer.ts**

Ring buffer class with:
- Fixed-capacity circular array for lines
- `append(data)` — splits on `\n`, handles partial lines
- `getLines(n)` / `getAll()` — read from ring
- `bytesWritten` counter for activity tracking
- `saveToDisk(filePath)` — write to file with `0o600` permissions
- `loadFromDisk(filePath, capacity)` — static factory, returns empty buffer if file missing

~80 lines of implementation.

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/unit/ring-buffer.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add electron/core/ring-buffer.ts tests/unit/ring-buffer.test.ts
git commit -m "feat: add ring buffer for PTY output history"
```

---

### Task 6: PTY Manager

**Files:**
- Create: `electron/core/pty-manager.ts`
- Create: `tests/unit/pty-manager.test.ts`

- [ ] **Step 1: Write failing tests**

Test cases:
- `spawn()` returns sessionId and pid
- Emits data events from PTY (spawn `/bin/echo hello`, verify data received)
- Emits exit events (spawn `/bin/true`, verify exit code 0)
- `write()` sends input to PTY
- `resize()` changes PTY dimensions
- `dispose()` kills a specific PTY
- `getBuffer()` returns ring buffer
- `getLastLines()` returns recent output
- Throws on unknown session ID

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/unit/pty-manager.test.ts
```

- [ ] **Step 3: Implement electron/core/pty-manager.ts**

PTYManager class with:
- `spawn(sessionId, options)` — creates PTY via `node-pty`, wires data/exit listeners, creates ring buffer
- `write(sessionId, data)` — forwards to PTY
- `resize(sessionId, cols, rows)` — resizes PTY
- `onData(sessionId, listener)` / `onExit(sessionId, listener)` — register callbacks
- `isAlive(sessionId)` — check if PTY process is running
- `getBuffer(sessionId)` / `getLastLines(sessionId, n)` — ring buffer access
- `dispose(sessionId)` / `disposeAll()` — kill PTY processes
- `flushAllBuffers()` / `flushBuffer(sessionId)` — persist ring buffers to disk
- `loadBuffer(sessionId)` — load persisted buffer
- Environment: sets `TERM=xterm-256color`

~150 lines of implementation. Uses `node-pty` spawn with argument arrays (no shell strings).

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/unit/pty-manager.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add electron/core/pty-manager.ts tests/unit/pty-manager.test.ts
git commit -m "feat: add PTY manager with ring buffer integration"
```

---

### Task 7: Status Detector

**Files:**
- Create: `electron/core/status-detector.ts`
- Create: `electron/core/patterns/claude-patterns.ts`
- Create: `electron/core/patterns/generic-patterns.ts`
- Create: `tests/unit/status-detector.test.ts`

- [ ] **Step 1: Write failing tests**

Test Claude patterns: waiting on `?` prompt, `>` prompt, permission request, running with spinner, running with high activity, error with stack trace, idle with no activity.
Test generic patterns: shell `$` prompt as waiting, `ERROR:` as error.
Test defaults: ambiguous state with activity defaults to running.

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/unit/status-detector.test.ts
```

- [ ] **Step 3: Create pattern modules**

`electron/core/patterns/claude-patterns.ts`:
- `CLAUDE_WAITING_PATTERNS`: `?` prompt, `>` prompt, `Allow? (y/n)`, `Do you want to proceed`
- `CLAUDE_RUNNING_PATTERNS`: Braille spinners, `Thinking...`, action verbs
- `CLAUDE_ERROR_PATTERNS`: `Error:`, `FATAL`, stack trace lines, `ENOENT/EACCES/EPERM`

`electron/core/patterns/generic-patterns.ts`:
- `GENERIC_WAITING_PATTERNS`: `$` prompt, `>` prompt, `?` prompt
- `GENERIC_ERROR_PATTERNS`: `ERROR`, `Error:`, `failed`, `FATAL`

- [ ] **Step 4: Implement status detector**

`electron/core/status-detector.ts`:
- `detect(tool, lastLines, bytesPerSecond, msSinceLastActivity?)` method
- Priority: exited > error > waiting (with low activity) > running (high activity or running patterns) > idle (60s+ no activity) > default running
- Tool-specific pattern selection via `getWaitingPatterns(tool)`, `getErrorPatterns(tool)`, `getRunningPatterns(tool)`

~60 lines of implementation.

- [ ] **Step 5: Run tests**

```bash
npx vitest run tests/unit/status-detector.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add electron/core/status-detector.ts electron/core/patterns/ tests/unit/status-detector.test.ts
git commit -m "feat: add multi-signal status detector with tool-specific patterns"
```

---

### Task 8: Resume Manager

**Files:**
- Create: `electron/core/resume-manager.ts`
- Create: `tests/unit/resume-manager.test.ts`

- [ ] **Step 1: Write failing tests**

Test: `buildResumeCommand` for Claude returns `["claude", "--resume", sessionId]`. Returns null for shell/custom. `captureResumeData` builds full ResumeData object. Returns null when no session ID. `isResumeValid` checks age (> 30 days = invalid).

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/unit/resume-manager.test.ts
```

- [ ] **Step 3: Implement electron/core/resume-manager.ts**

ResumeManager class with:
- `buildResumeCommand(tool, data)` — tool-specific resume command building
- `captureResumeData(tool, input)` — build ResumeData from tool session ID + last output
- `isResumeValid(data)` — check age < 30 days, has command

~50 lines of implementation.

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/unit/resume-manager.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add electron/core/resume-manager.ts tests/unit/resume-manager.test.ts
git commit -m "feat: add resume manager for session resumption"
```

---

### Task 9: Copy and adapt git.ts and claude.ts

**Files:**
- Create: `electron/core/git.ts` (adapted from `src/core/git.ts`)
- Create: `electron/core/claude.ts` (adapted from `src/core/claude.ts`)

- [ ] **Step 1: Copy git.ts — replace any Bun-specific APIs with Node equivalents**

```bash
cp src/core/git.ts electron/core/git.ts
```

Review for `Bun.*` usage. The existing code uses `execFile` from `child_process` and standard `path`/`os` — these work in Node.js. Fix any Bun-specific imports.

- [ ] **Step 2: Copy claude.ts — same adaptation**

```bash
cp src/core/claude.ts electron/core/claude.ts
```

Review and fix any Bun-specific APIs. Uses `fs`, `path`, `os` — standard Node.js.

- [ ] **Step 3: Verify the files compile**

```bash
npx tsc --noEmit -p tsconfig.electron.json
```

Fix any type errors from the copy.

- [ ] **Step 4: Commit**

```bash
git add electron/core/git.ts electron/core/claude.ts
git commit -m "feat: adapt git and claude modules for Electron runtime"
```

---

### Task 10: Session Manager (adapted for PTY)

**Files:**
- Create: `electron/core/session-manager.ts`
- Create: `tests/unit/session-manager.test.ts`

- [ ] **Step 1: Write failing tests**

Test: create project, create session in project, create standalone session, auto-detect project from path, stop session, delete session, rename session, set grid slot, list by status.

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/unit/session-manager.test.ts
```

- [ ] **Step 3: Implement electron/core/session-manager.ts**

SessionManager class with dependency injection (`Storage`, `PTYManager`, `StatusDetector`, `ResumeManager`):

**Project methods:** `createProject`, `getProject`, `listProjects`, `renameProject`, `setProjectLayout`, `deleteProject`

**Session methods:** `createSession` (auto-detects project, finds next grid slot, spawns PTY), `getSession`, `listSessionsByProject`, `listStandaloneSessions`, `listAllSessions`, `listSessionsByStatus`, `stopSession` (captures resume data, disposes PTY), `restartSession`, `resumeSession` (uses resume command), `deleteSession`, `renameSession`, `setGridSlot`

**Status refresh:** `startStatusRefresh(intervalMs)` — periodic loop that checks each non-stopped session's PTY buffer + activity rate via StatusDetector and updates storage.

**Lifecycle:** `flushAndClose()` — captures resume data for all running sessions, flushes buffers, disposes all. `dispose()` — cleanup.

**Helpers:** `generateName()` — random adjective-animal names. `buildCommandArgs()` — handles Claude resume mode.

~250 lines of implementation. All subprocess interaction goes through PTYManager (which uses node-pty spawn, not shell strings).

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/unit/session-manager.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add electron/core/session-manager.ts tests/unit/session-manager.test.ts
git commit -m "feat: add session manager with PTY lifecycle and status refresh"
```

---

## Phase 2: IPC & Renderer Foundation

### Task 11: IPC Bridge

**Files:**
- Create: `electron/ipc-handlers.ts`
- Modify: `electron/preload.ts`
- Create: `src/types/electron.d.ts`
- Modify: `electron/main.ts`

- [ ] **Step 1: Create electron/ipc-handlers.ts**

Register IPC handlers for:
- `projects:list`, `projects:create`, `projects:rename`, `projects:setLayout`, `projects:delete`
- `sessions:create`, `sessions:get`, `sessions:listByProject`, `sessions:listStandalone`, `sessions:listAll`, `sessions:listByStatus`, `sessions:stop`, `sessions:restart`, `sessions:resume`, `sessions:delete`, `sessions:rename`, `sessions:setGridSlot`
- `pty:input` (ipcMain.on — fire-and-forget for performance), `pty:resize` (ipcMain.on)
- `pty:subscribe` (ipcMain.handle — registers data/exit listeners that forward to renderer via `webContents.send`, returns buffered output for replay)
- `dialog:openFolder` — wraps `dialog.showOpenDialog` with `openDirectory` and `createDirectory` properties

- [ ] **Step 2: Update electron/preload.ts**

Expose typed API via `contextBridge.exposeInMainWorld("bastion", {...})` with:
- `projects.*` — invoke handlers
- `sessions.*` — invoke handlers
- `pty.subscribe(sessionId)`, `pty.write(sessionId, data)`, `pty.resize(sessionId, cols, rows)`, `pty.onData(sessionId, callback)` (returns cleanup function), `pty.onExit(sessionId, callback)` (returns cleanup function)
- `dialog.openFolder()`

- [ ] **Step 3: Create src/types/electron.d.ts**

TypeScript declarations for `window.bastion` with full method signatures using types from `electron/core/types.ts`.

- [ ] **Step 4: Wire into electron/main.ts**

Initialize core layer in `app.whenReady()`:
1. Create `Storage`, `PTYManager`, `StatusDetector`, `ResumeManager`, `SessionManager`
2. Call `sessionManager.startStatusRefresh()`
3. Call `registerIpcHandlers(sessionManager)`
4. Create window

On `before-quit`: call `sessionManager.flushAndClose()`

- [ ] **Step 5: Verify app starts with IPC wired up**

```bash
npm start
```

Expected: App launches. In DevTools console: `await window.bastion.projects.list()` returns `[]`.

- [ ] **Step 6: Commit**

```bash
git add electron/ipc-handlers.ts electron/preload.ts electron/main.ts src/types/electron.d.ts
git commit -m "feat: add IPC bridge between main and renderer processes"
```

---

### Task 12: Zustand state management

**Files:**
- Create: `src/store/projects.ts`
- Create: `src/store/sessions.ts`
- Create: `src/store/ui.ts`

- [ ] **Step 1: Create project store**

Zustand store with: `projects[]`, `loading`, `fetchProjects()`, `createProject()`, `renameProject()`, `deleteProject()`, `setLayout()`. All methods call `window.bastion.projects.*` and refresh state.

- [ ] **Step 2: Create session store**

Zustand store with: `sessions[]`, `loading`, `fetchAllSessions()`, `fetchSessionsByProject()`, `fetchStandalone()`, `createSession()`, `stopSession()`, `restartSession()`, `resumeSession()`, `deleteSession()`, `renameSession()`, `setGridSlot()`, `getStatusCounts()`.

Session store sets up a 2-second polling interval on `fetchAllSessions` for live status updates.

- [ ] **Step 3: Create UI store**

Zustand store with: `activeProjectId`, `focusedTileSessionId`, `maximizedSessionId`, `statusFilter`, `sidebarWidth`. Actions: `setActiveProject()`, `setFocusedTile()`, `toggleMaximized()`, `setStatusFilter()`, `setSidebarWidth()`.

- [ ] **Step 4: Commit**

```bash
git add src/store/
git commit -m "feat: add Zustand stores for projects, sessions, and UI state"
```

---

### Task 13: Terminal Tile component (xterm.js)

**Files:**
- Create: `src/hooks/useTerminal.ts`
- Create: `src/components/Grid/TerminalTile.tsx`

- [ ] **Step 1: Create useTerminal hook**

React hook that:
1. Creates `Terminal` instance with GitHub dark theme colors, SF Mono font, cursor blink
2. Loads `FitAddon` and `WebglAddon` (with canvas fallback)
3. Calls `window.bastion.pty.subscribe(sessionId)` — writes buffered output on mount
4. Registers `pty.onData` listener — forwards to `terminal.write()`
5. Registers `pty.onExit` listener — writes "[Session ended]" message
6. Forwards `terminal.onData()` to `pty.write()`
7. Forwards `terminal.onResize()` to `pty.resize()`
8. Sets up `ResizeObserver` on container to call `fitAddon.fit()` on resize
9. Returns `{ containerRef, fit, terminal }`
10. Cleans up all listeners and disposes terminal on unmount

- [ ] **Step 2: Create TerminalTile component**

React component with:
- Header bar: status dot (colored by status), session name, tool badge, relative time since last activity ("2m ago"), maximize/restore button, close button
- Terminal body: `<div ref={containerRef}>` from useTerminal hook
- Visual state: blue border when focused, amber border when waiting, default border otherwise
- Double-click header to maximize
- Click tile body to focus (via terminal onFocus → setFocusedTile)

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useTerminal.ts src/components/Grid/TerminalTile.tsx
git commit -m "feat: add TerminalTile with xterm.js integration"
```

---

### Task 14: Terminal Grid + Ghost Tile

**Files:**
- Create: `src/hooks/useGrid.ts`
- Create: `src/components/Grid/GhostTile.tsx`
- Create: `src/components/Grid/TerminalGrid.tsx`

- [ ] **Step 1: Create useGrid hook**

Calculates grid dimensions from container size:
- Auto mode breakpoints: <600px = 1x1, 600-1100px = 2x1, 1100-1600px = 2x2, >1600px = 3x2
- Manual mode: parse "NxM" string directly
- Uses ResizeObserver, debounced to prevent resize storms
- Returns `{ cols, rows, layout }`

- [ ] **Step 2: Create GhostTile**

Dashed border empty tile with "+" icon, "New Session" label, "Cmd+N" hint. Hover brightens border. Click calls `onCreateSession`.

- [ ] **Step 3: Create TerminalGrid**

CSS Grid container:
- `grid-template-columns: repeat(cols, 1fr)`, `grid-template-rows: repeat(rows, 1fr)`
- Renders gridded sessions (sorted by gridSlot, capped at maxSlots) as TerminalTiles
- Renders GhostTiles for empty remaining slots
- If `maximizedSessionId` is set, renders only that one session fullscreen
- Uses `useGrid` hook for responsive layout

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useGrid.ts src/components/Grid/
git commit -m "feat: add terminal grid with responsive layout and ghost tiles"
```

---

### Task 15: Sidebar

**Files:**
- Create: `src/components/Sidebar/Sidebar.tsx`
- Create: `src/components/Sidebar/ProjectTree.tsx`
- Create: `src/components/Sidebar/SessionItem.tsx`
- Create: `src/components/Sidebar/StatusFilters.tsx`

- [ ] **Step 1: Create SessionItem**

Compact list item: status-colored left border, session name, status dot. Click navigates to session. Active state highlighted.

- [ ] **Step 2: Create StatusFilters**

Horizontal pill badges: "Running N", "Waiting N", "Error N", "Idle N". Click to filter (toggles). Hidden if count is 0. Uses `statusFilter` from UI store.

- [ ] **Step 3: Create ProjectTree**

Collapsible project list:
- Each project: expand/collapse toggle, name, aggregated status dots (when collapsed), session count
- Active project: blue left border, path shown
- Expanded: shows SessionItems for all sessions in project
- Overflow indicator: "+ N more not in grid"
- Click project → `setActiveProject`, click session → navigate to project grid and focus tile

- [ ] **Step 4: Create Sidebar**

Composes: header ("BASTION" + "+ New" button), StatusFilters, ProjectTree, Standalone sessions section, footer ("N sessions, N active").

Fetches projects and sessions on mount, polls sessions every 2 seconds.

- [ ] **Step 5: Commit**

```bash
git add src/components/Sidebar/
git commit -m "feat: add sidebar with project tree, session items, and status filters"
```

---

### Task 16: Toolbar

**Files:**
- Create: `src/components/Toolbar/Toolbar.tsx`

- [ ] **Step 1: Create Toolbar**

Top bar showing: project breadcrumb (name + session count) on left, grid layout buttons (1x1, 2x1, 2x2, 3x2, auto) on right. Active layout highlighted. Click to change layout.

Shows "Select a project or session" when no project is active.

- [ ] **Step 2: Commit**

```bash
git add src/components/Toolbar/
git commit -m "feat: add toolbar with breadcrumb and grid layout switcher"
```

---

### Task 17: Wire up App.tsx

**Files:**
- Modify: `src/App.tsx`
- Create: `src/styles/theme.css`

- [ ] **Step 1: Create base theme CSS**

Global styles: dark background (#0d1117), custom scrollbar, smooth font rendering, no overflow.

- [ ] **Step 2: Update App.tsx**

Compose: `<Sidebar>` | `<Toolbar>` + `<TerminalGrid>`. Wire active project from store, pass project sessions to grid, conditionally render NewSessionDialog.

- [ ] **Step 3: Verify full app renders**

```bash
npm start
```

Expected: Full app with sidebar, toolbar, empty grid with ghost tiles.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/styles/theme.css
git commit -m "feat: wire up main app layout with all components"
```

---

## Phase 3: Features & Dialogs

### Task 18: New Session Dialog

**Files:**
- Create: `src/components/Dialogs/NewSessionDialog.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create NewSessionDialog**

Modal dialog with:
- Mode selector: "In [project]" (if active project), "New Project", "Standalone"
- Folder picker button (calls `window.bastion.dialog.openFolder()`) for new project/standalone
- Tool selector: Claude Code, Codex, Gemini, Shell, Custom (button group)
- Custom command input (shown only when tool = custom)
- Name input (optional, auto-generated if empty)
- Cancel / Create buttons
- Escape to close, click backdrop to close

"In [project]" mode pre-fills path from project, skips folder picker.

- [ ] **Step 2: Wire into App.tsx**

Render `<NewSessionDialog onClose={...} />` when `showNewSession` state is true.

- [ ] **Step 3: Test the full flow manually**

```bash
npm start
```

Expected: Click "+ New" or Cmd+N → dialog opens → pick tool → Browse for folder → Create → session appears in grid with live terminal.

- [ ] **Step 4: Commit**

```bash
git add src/components/Dialogs/ src/App.tsx
git commit -m "feat: add new session dialog with project and standalone modes"
```

---

### Task 19: Keyboard shortcuts

**Files:**
- Create: `src/hooks/useKeyboard.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create useKeyboard hook**

Listens for `keydown` with `metaKey`:
- Cmd+N → new session dialog
- Cmd+Enter → maximize/restore focused tile
- Cmd+1-6 → focus tile by grid position
- Cmd+K → command palette (placeholder for now)
- Escape → restore maximized / close dialog

All Cmd+ shortcuts don't conflict with terminal Ctrl+ shortcuts.

- [ ] **Step 2: Wire into App.tsx**

```typescript
useKeyboard({ onNewSession: () => setShowNewSession(true) });
```

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useKeyboard.ts src/App.tsx
git commit -m "feat: add global keyboard shortcuts"
```

---

### Task 20: Rename Dialog + Command Palette

**Files:**
- Create: `src/components/Dialogs/RenameDialog.tsx`
- Create: `src/components/Dialogs/CommandPalette.tsx`

- [ ] **Step 1: Create RenameDialog**

Simple modal with a text input pre-filled with current name. Used for renaming both sessions and projects. Props: `currentName`, `onRename(newName)`, `onClose`. Enter to confirm, Escape to cancel.

- [ ] **Step 2: Create CommandPalette**

Cmd+K searchable list of all sessions across all projects. Uses `fuzzysort` for fuzzy matching. Each result shows: status dot, session name, project name, tool. Enter/click to navigate to that session (set active project + focus tile). Escape to close.

- [ ] **Step 3: Wire into App.tsx**

Add `showCommandPalette` state. Render `<CommandPalette>` when true. Wire rename into session/project context menus.

- [ ] **Step 4: Commit**

```bash
git add src/components/Dialogs/
git commit -m "feat: add rename dialog and command palette"
```

---

### Task 21: Context menus and full keyboard shortcuts

**Files:**
- Modify: `src/hooks/useKeyboard.ts`
- Create: `src/hooks/useContextMenu.ts`
- Modify: `src/components/Sidebar/ProjectTree.tsx`
- Modify: `src/components/Sidebar/SessionItem.tsx`

- [ ] **Step 1: Add missing keyboard shortcuts to useKeyboard**

Complete the keyboard handler:
- Cmd+W → stop focused session (with confirmation via `window.confirm`)
- Cmd+K → toggle command palette
- Cmd+[ → previous project (by sortOrder)
- Cmd+] → next project (by sortOrder)
- Cmd+, → open settings (placeholder alert for v1)
- Cmd+1-6 → focus tile by grid slot position (look up session by gridSlot from store)

- [ ] **Step 2: Create useContextMenu hook**

Simple hook that manages context menu state: `{ visible, x, y, items, show(e, items), hide() }`. Items are `{ label, action, danger? }`. Renders a positioned absolute div with menu items.

- [ ] **Step 3: Add context menus to ProjectTree and SessionItem**

Project right-click: "Rename", "Delete Project" (danger)
Session right-click: "Rename", "Stop", "Restart", "Resume" (if stopped with resume data), "Delete" (danger), "Move to Standalone" / "Move to Project..."

- [ ] **Step 4: Commit**

```bash
git add src/hooks/ src/components/Sidebar/
git commit -m "feat: add context menus and complete keyboard shortcuts"
```

---

### Task 22: Stopped session tile with resume button

**Files:**
- Modify: `src/components/Grid/TerminalTile.tsx`

- [ ] **Step 1: Add stopped state rendering to TerminalTile**

When `session.status === "stopped"`:
- Hide the xterm.js terminal container
- Show centered content: "Session ended", last output line from `resumeData.outputSnapshot` (if available), "Resume" button (enabled only if `resumeData` exists and is valid), "Remove" button
- Resume button calls `window.bastion.sessions.resume(session.id)` then refreshes session store
- Remove button calls `window.bastion.sessions.delete(session.id)` with confirmation

When session is running/waiting/idle/error: show normal terminal as before.

- [ ] **Step 2: Commit**

```bash
git add src/components/Grid/TerminalTile.tsx
git commit -m "feat: add stopped session tile with resume and remove buttons"
```

---

## Phase 4: Integration & Polish

### Task 23: Window state persistence

**Files:**
- Modify: `electron/main.ts`

- [ ] **Step 1: Restore window state on launch**

In `createWindow()`: read `storage.getWindowState()`, use saved x/y/width/height for window bounds.

- [ ] **Step 2: Save window state on move/resize**

Debounced (1s) save of window bounds via `mainWindow.on("resize")` and `mainWindow.on("move")`.

- [ ] **Step 3: Commit**

```bash
git add electron/main.ts
git commit -m "feat: persist and restore window state"
```

---

### Task 24: E2E smoke test

**Files:**
- Create: `tests/e2e/smoke.test.ts`
- Create: `playwright.config.ts`

- [ ] **Step 1: Install Playwright**

```bash
npm install --save-dev @playwright/test
```

- [ ] **Step 2: Create smoke test**

Two tests:
1. App launches and shows "BASTION" in sidebar
2. Cmd+N opens new session dialog

Uses `_electron.launch()` from Playwright.

- [ ] **Step 3: Build and run E2E tests**

```bash
npm run package
npx playwright test tests/e2e/
```

Expected: Both tests PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/ playwright.config.ts
git commit -m "test: add E2E smoke tests"
```

---

### Task 25: Clean up old source and update docs

**Files:**
- Delete: `src/core/` (old core, superseded by `electron/core/`)
- Modify: `CLAUDE.md`

- [ ] **Step 1: Remove old src/core directory**

```bash
rm -rf src/core/
```

- [ ] **Step 2: Update CLAUDE.md**

Replace project structure, commands, and key files sections to reflect the Electron app. Update tech stack to: Electron, React, xterm.js, node-pty, better-sqlite3. Update development commands to: `npm start`, `npm test`, `npm run build`, `npm run package`.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: remove old core, update documentation for Electron app"
```

---

### Task 26: Build and package

**Files:**
- Verify: `forge.config.ts`

- [ ] **Step 1: Verify full build works**

```bash
npm run package
```

Expected: Produces `out/Bastion-darwin-*/Bastion.app`.

- [ ] **Step 2: Test packaged app launches**

```bash
open out/Bastion-darwin-*/Bastion.app
```

Expected: App launches, sidebar visible, can create sessions.

- [ ] **Step 3: Commit any build adjustments**

```bash
git add -A
git commit -m "chore: finalize build configuration and packaging"
```

---

## Summary

| Phase | Tasks | What it delivers |
|-------|-------|-----------------|
| **Phase 1: Foundation** | Tasks 1-10 | Electron scaffold, core layer (types, storage, ring buffer, PTY, status, resume, session manager, git, claude), full test suite |
| **Phase 2: IPC & Renderer** | Tasks 11-17 | IPC bridge, Zustand stores, TerminalTile (xterm.js), Grid, Sidebar, Toolbar, App shell |
| **Phase 3: Features & Dialogs** | Tasks 18-22 | New Session dialog, keyboard shortcuts, rename dialog, command palette, context menus, stopped tile with resume |
| **Phase 4: Integration & Polish** | Tasks 23-26 | Window persistence, E2E tests, cleanup, packaging |

**Total: 26 tasks.** Each task is independently committable and testable. Core logic follows TDD. UI components verified via manual integration testing and E2E smoke tests.
