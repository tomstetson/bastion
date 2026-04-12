# UX Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add terminal zoom/pop-out expand modes and polish the entire UX for managing multiple Claude Code sessions — tile headers, context menus, animations, sidebar improvements.

**Architecture:** All changes are in the renderer (React components, hooks, stores, CSS) and Electron main process (pop-out window management, new IPC handlers). Core business logic (session-manager, PTY, storage) is untouched. Pop-out windows reuse the existing preload/IPC bridge and share PTY processes from the main process.

**Tech Stack:** React 19, Zustand, xterm.js, Electron BrowserWindow (for pop-outs), CSS transitions

**Spec:** `docs/superpowers/specs/2026-04-11-ux-overhaul-design.md`

---

## File Map

**New files:**
- `src/styles/animations.css` — keyframes and animation classes
- `src/components/Grid/PlaceholderTile.tsx` — popped-out session placeholder
- `src/components/Grid/ZoomOverlay.tsx` — zoomed terminal overlay
- `src/components/PopOut/PopOutTerminal.tsx` — standalone terminal for pop-out window
- `src/components/PopOut/popout.html` — HTML shell for pop-out BrowserWindow
- `src/components/PopOut/popout-renderer.tsx` — React entry for pop-out window
- `electron/popout-manager.ts` — creates/tracks pop-out BrowserWindows

**Modified files:**
- `src/store/ui.ts` — add zoom/popout state, clear on project switch
- `src/components/Grid/TerminalTile.tsx` — redesigned header, new icons, context menu, tooltips
- `src/components/Grid/TerminalGrid.tsx` — integrate zoom overlay and placeholder tiles
- `src/hooks/useKeyboard.ts` — zoom session cycling (Cmd+[/]), clear zoom on project switch
- `src/components/Toolbar/Toolbar.tsx` — zoom breadcrumb with "back to grid" link
- `src/components/Sidebar/ProjectTree.tsx` — waiting sort, overflow expander, pop-out icon
- `src/components/Sidebar/SessionItem.tsx` — pop-out indicator icon
- `src/styles/theme.css` — import animations.css
- `electron/main.ts` — import popout-manager
- `electron/ipc-handlers.ts` — register popout IPC handlers
- `electron/preload.ts` — expose popout IPC API
- `src/types/electron.d.ts` — add popout type declarations
- `vite.renderer.config.ts` — add popout entry point (multi-page)

---

## Phase 1: Animations & Visual Polish

### Task 1: Add CSS animations and waiting pulse

**Files:**
- Create: `src/styles/animations.css`
- Modify: `src/styles/theme.css`
- Modify: `src/components/Grid/TerminalTile.tsx`

- [ ] **Step 1: Create animations.css with keyframes**

Create `src/styles/animations.css`:
```css
/* Waiting session pulse — amber border breathes */
@keyframes pulse-waiting {
  0%, 100% { border-color: rgba(210, 153, 34, 0.6); }
  50% { border-color: rgba(210, 153, 34, 1.0); }
}

.tile-waiting {
  animation: pulse-waiting 2s ease-in-out infinite;
}

/* Zoom fade — other tiles dim when one is zoomed */
.tile-fade-out {
  opacity: 0.3;
  pointer-events: none;
  transition: opacity 150ms ease-out;
}

.tile-fade-in {
  opacity: 1;
  transition: opacity 150ms ease-in;
}

/* Pop-out shrink before disappearing */
.tile-pop-out {
  transform: scale(0.95);
  opacity: 0;
  transition: transform 100ms ease-in, opacity 100ms ease-in;
}

/* Placeholder fade in */
.tile-placeholder-enter {
  opacity: 0;
  animation: fade-in 150ms ease-out forwards;
}

@keyframes fade-in {
  to { opacity: 1; }
}

/* Focus glow */
.tile-focused {
  box-shadow: 0 0 0 1px rgba(88, 166, 255, 0.3);
  transition: box-shadow 100ms, border-color 100ms;
}
```

- [ ] **Step 2: Import animations.css in theme.css**

Add to the top of `src/styles/theme.css`:
```css
@import "./animations.css";
```

- [ ] **Step 3: Apply waiting pulse class in TerminalTile**

In `TerminalTile.tsx`, add a className to the outer container div based on session status:
- If `session.status === "waiting"` and tile is not focused → add class `tile-waiting`
- If tile is focused → add class `tile-focused`
- Apply both if waiting AND focused

The outer container div should get:
```typescript
className={[
  session.status === "waiting" && !isFocused ? "tile-waiting" : "",
  isFocused ? "tile-focused" : "",
].filter(Boolean).join(" ")}
```

Remove the inline `border` and `boxShadow` styles and move them to the CSS classes instead.

- [ ] **Step 4: Verify waiting pulse works**

Run E2E test or manually: create a Claude session, wait for it to show "waiting" status, verify amber border pulses.

- [ ] **Step 5: Commit**

```bash
PATH="/tmp/bastion-bin:$PATH" git commit -m "feat: add CSS animations — waiting pulse, focus glow, transition classes"
```

---

### Task 2: Redesign tile header with new icons, tooltips, and inline rename

**Files:**
- Modify: `src/components/Grid/TerminalTile.tsx`

- [ ] **Step 1: Redesign the tile header layout**

Replace the current header content with the new layout:
```
● session-name        claude    2m ago    [⤢] [⧉] [▾]
```

The header div should contain:
1. Left group: status dot (10px), session name (bold, `data-testid="tile-name"`), tool badge (muted)
2. Right group: last activity timestamp, expand button (`data-testid="expand-btn"`, tooltip "Expand (Cmd+Enter)"), pop-out button (`data-testid="popout-btn"`, tooltip "Pop out to window"), menu button (`data-testid="tile-menu-btn"`, tooltip "Actions")

Each button should have:
- `title` attribute for native tooltip
- `cursor: pointer`
- Hover: slightly brighter color
- `WebkitAppRegion: "no-drag"` to ensure buttons remain clickable

- [ ] **Step 2: Add inline rename on double-click session name**

Add state: `const [isRenaming, setIsRenaming] = useState(false)` and `const [renameValue, setRenameValue] = useState("")`

When `isRenaming` is true, render an `<input>` instead of the name span:
- Auto-focus on mount (`useEffect` with `inputRef.current?.focus()`)
- `onKeyDown`: Enter → save (call `renameSession(session.id, renameValue)`), Escape → cancel
- `onBlur` → save
- Styled to match the header (transparent background, same font, no border except subtle bottom line)

Double-click on the name span triggers: `setRenameValue(session.name); setIsRenaming(true)`

- [ ] **Step 3: Add tile context menu via ▾ button and right-click**

Import and use `useContextMenu` hook. Build menu items:
```typescript
const menuItems: ContextMenuItem[] = [
  { label: "Expand", shortcut: "⌘↵", action: () => toggleMaximized(session.id) },
  { label: "Pop Out to Window", action: () => handlePopOut() },
  { label: "Rename", action: () => { setRenameValue(session.name); setIsRenaming(true); } },
  null, // separator
  { label: "Stop Session", action: () => stopSession(session.id), disabled: session.status === "stopped" },
  { label: "Restart Session", action: () => restartSession(session.id) },
  null,
  { label: "Remove from Grid", action: () => setGridSlot(session.id, null) },
  { label: "Delete Session", action: () => { if (confirm(`Delete "${session.name}"?`)) deleteSession(session.id); }, danger: true },
];
```

Wire the ▾ button's `onClick` to `contextMenu.show(event, menuItems)` and the header's `onContextMenu` to the same.

Note: `handlePopOut()` will be a no-op stub until Task 6 implements pop-out. For now: `const handlePopOut = () => { /* TODO: implemented in Task 6 */ };`

- [ ] **Step 4: Add data-testid attributes**

- Expand button: `data-testid="expand-btn"`
- Pop-out button: `data-testid="popout-btn"`
- Menu button: `data-testid="tile-menu-btn"`
- Tile name: `data-testid="tile-name"`
- Rename input: `data-testid="tile-rename-input"`

- [ ] **Step 5: Commit**

```bash
PATH="/tmp/bastion-bin:$PATH" git commit -m "feat: redesign tile header with icons, tooltips, inline rename, context menu"
```

---

## Phase 2: Zoom Mode

### Task 3: Add zoom state to UI store and clear on project switch

**Files:**
- Modify: `src/store/ui.ts`
- Create: `tests/unit/ui-store.test.ts`

- [ ] **Step 1: Write failing tests for zoom state**

Create `tests/unit/ui-store.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { useUIStore } from "../../src/store/ui";

describe("UI Store", () => {
  beforeEach(() => {
    useUIStore.setState({
      activeProjectId: null,
      focusedTileSessionId: null,
      maximizedSessionId: null,
      zoomedSessionId: null,
      poppedOutSessionIds: new Set(),
      statusFilter: null,
      sidebarWidth: 220,
      standaloneGridLayout: "auto",
    });
  });

  describe("zoom", () => {
    it("toggleZoom sets zoomedSessionId", () => {
      useUIStore.getState().toggleZoom("session-1");
      expect(useUIStore.getState().zoomedSessionId).toBe("session-1");
    });

    it("toggleZoom unsets if same session", () => {
      useUIStore.getState().toggleZoom("session-1");
      useUIStore.getState().toggleZoom("session-1");
      expect(useUIStore.getState().zoomedSessionId).toBeNull();
    });

    it("setActiveProject clears zoom", () => {
      useUIStore.getState().toggleZoom("session-1");
      useUIStore.getState().setActiveProject("project-2");
      expect(useUIStore.getState().zoomedSessionId).toBeNull();
    });
  });

  describe("popout", () => {
    it("addPopOut adds session to set", () => {
      useUIStore.getState().addPopOut("session-1");
      expect(useUIStore.getState().poppedOutSessionIds.has("session-1")).toBe(true);
    });

    it("removePopOut removes session from set", () => {
      useUIStore.getState().addPopOut("session-1");
      useUIStore.getState().removePopOut("session-1");
      expect(useUIStore.getState().poppedOutSessionIds.has("session-1")).toBe(false);
    });

    it("isSessionPoppedOut returns correct value", () => {
      expect(useUIStore.getState().isSessionPoppedOut("session-1")).toBe(false);
      useUIStore.getState().addPopOut("session-1");
      expect(useUIStore.getState().isSessionPoppedOut("session-1")).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/unit/ui-store.test.ts
```

- [ ] **Step 3: Update ui.ts with zoom and popout state**

Replace `maximizedSessionId` with `zoomedSessionId` (rename for clarity). Add popout state:

```typescript
interface UIState {
  // ... existing fields ...
  zoomedSessionId: string | null;        // replaces maximizedSessionId
  poppedOutSessionIds: Set<string>;      // sessions in pop-out windows
  
  toggleZoom: (sessionId: string | null) => void;  // replaces toggleMaximized
  addPopOut: (sessionId: string) => void;
  removePopOut: (sessionId: string) => void;
  isSessionPoppedOut: (sessionId: string) => boolean;
  // ... existing actions ...
}
```

Key behavior changes:
- `setActiveProject` now also clears `zoomedSessionId` to null
- `toggleZoom` works like the old `toggleMaximized` but named clearly
- Remove `maximizedSessionId` and `toggleMaximized` entirely

- [ ] **Step 4: Update all references from maximizedSessionId to zoomedSessionId**

Search and replace across:
- `src/components/Grid/TerminalGrid.tsx`
- `src/components/Grid/TerminalTile.tsx`
- `src/hooks/useKeyboard.ts`
- `src/App.tsx`
- `tests/e2e/app.spec.ts`

Change `maximizedSessionId` → `zoomedSessionId` and `toggleMaximized` → `toggleZoom` everywhere.

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run tests/unit/ui-store.test.ts
```

- [ ] **Step 6: Commit**

```bash
PATH="/tmp/bastion-bin:$PATH" git commit -m "refactor: replace maximized with zoom/popout state in UI store"
```

---

### Task 4: Implement zoom overlay in the grid

**Files:**
- Create: `src/components/Grid/ZoomOverlay.tsx`
- Modify: `src/components/Grid/TerminalGrid.tsx`
- Modify: `src/components/Toolbar/Toolbar.tsx`

- [ ] **Step 1: Create ZoomOverlay component**

Create `src/components/Grid/ZoomOverlay.tsx`:

A positioned overlay that renders a single TerminalTile at full grid size with animation.

Props: `{ session: Session; onClose: () => void }`

Structure:
```tsx
// Overlay container: position absolute, inset 0, z-index 10, background #010409
// Contains a single TerminalTile at full size
// The overlay fades in via CSS class (tile-fade-in from animations.css)
```

The overlay div:
- `position: absolute; inset: 0; z-index: 10; background: #010409;`
- `display: flex; flex-direction: column;`
- Class: `tile-fade-in`
- Contains the TerminalTile with `style={{ flex: 1 }}`

- [ ] **Step 2: Integrate ZoomOverlay into TerminalGrid**

In `TerminalGrid.tsx`:
- Import ZoomOverlay
- If `zoomedSessionId` is set and the session exists, render ZoomOverlay on top of the grid
- The grid tiles behind the overlay get class `tile-fade-out`
- When zoom is cleared, remove overlay and remove `tile-fade-out` from tiles

The grid container needs `position: relative` so the overlay positions correctly.

```tsx
{zoomedSession && (
  <ZoomOverlay
    session={zoomedSession}
    onClose={() => useUIStore.getState().toggleZoom(null)}
  />
)}
```

The non-zoomed tiles should get the fade class:
```tsx
<div className={zoomedSessionId ? "tile-fade-out" : "tile-fade-in"}>
  <TerminalTile session={session} />
</div>
```

- [ ] **Step 3: Add zoom breadcrumb to Toolbar**

When a session is zoomed, the toolbar shows:
```
bastion › 4 sessions › refactor core [✕]
```

Add a `zoomedSession` prop to Toolbar. When set, render the session name and a close button:
```tsx
{zoomedSession && (
  <>
    <span style={{ color: "#484f58" }}>›</span>
    <span style={{ fontSize: 13, fontWeight: 600, color: "#58a6ff" }}>
      {zoomedSession.name}
    </span>
    <button
      data-testid="zoom-close-btn"
      onClick={onZoomClose}
      title="Back to grid (Esc)"
      style={{ /* small X button styling */ }}
    >
      ✕
    </button>
  </>
)}
```

Wire `onZoomClose` prop to `toggleZoom(null)` in App.tsx.

- [ ] **Step 4: Update useKeyboard for zoom navigation**

While zoomed, Cmd+[ and Cmd+] should cycle to next/prev session (zoom changes, not project navigation):

In `useKeyboard.ts`, check if `zoomedSessionId` is set before handling Cmd+[/]:
```typescript
if (e.key === "[" || e.key === "]") {
  const zoomedId = useUIStore.getState().zoomedSessionId;
  if (zoomedId) {
    // Cycle zoom through sessions
    const sessions = useSessionsStore.getState().sessions;
    const currentIdx = sessions.findIndex(s => s.id === zoomedId);
    const nextIdx = e.key === "]"
      ? (currentIdx + 1) % sessions.length
      : (currentIdx - 1 + sessions.length) % sessions.length;
    useUIStore.getState().toggleZoom(sessions[nextIdx].id);
    return;
  }
  // ... existing project navigation ...
}
```

- [ ] **Step 5: Commit**

```bash
PATH="/tmp/bastion-bin:$PATH" git commit -m "feat: zoom overlay with animation, breadcrumb, and session cycling"
```

---

## Phase 3: Pop-Out Windows

### Task 5: Pop-out window manager in main process

**Files:**
- Create: `electron/popout-manager.ts`
- Modify: `electron/ipc-handlers.ts`
- Modify: `electron/main.ts`
- Modify: `electron/preload.ts`
- Modify: `src/types/electron.d.ts`

- [ ] **Step 1: Create popout-manager.ts**

Create `electron/popout-manager.ts`:

```typescript
import { BrowserWindow } from "electron";
import path from "node:path";
import { createLogger } from "./core/logger";

const log = createLogger("popout");

/** Tracks open pop-out windows by session ID */
const popoutWindows = new Map<string, BrowserWindow>();

export function createPopOutWindow(
  sessionId: string,
  sessionName: string,
  preloadPath: string,
  devServerUrl?: string,
): BrowserWindow {
  // Close existing pop-out for this session if any
  if (popoutWindows.has(sessionId)) {
    popoutWindows.get(sessionId)!.close();
  }

  const win = new BrowserWindow({
    width: 800,
    height: 600,
    minWidth: 400,
    minHeight: 300,
    title: `Bastion — ${sessionName}`,
    titleBarStyle: "hiddenInset",
    backgroundColor: "#0d1117",
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Load the pop-out renderer
  if (devServerUrl) {
    win.loadURL(`${devServerUrl}/popout.html?sessionId=${sessionId}`);
  } else {
    win.loadFile(
      path.join(__dirname, "../renderer/main_window/popout.html"),
      { query: { sessionId } },
    );
  }

  popoutWindows.set(sessionId, win);
  log.info("Pop-out window created", { sessionId, sessionName });

  win.on("closed", () => {
    popoutWindows.delete(sessionId);
    log.info("Pop-out window closed", { sessionId });
  });

  return win;
}

export function closePopOutWindow(sessionId: string): void {
  const win = popoutWindows.get(sessionId);
  if (win && !win.isDestroyed()) {
    win.close();
  }
}

export function hasPopOutWindow(sessionId: string): boolean {
  return popoutWindows.has(sessionId) && !popoutWindows.get(sessionId)!.isDestroyed();
}

export function closeAllPopOutWindows(): void {
  for (const [id, win] of popoutWindows) {
    if (!win.isDestroyed()) win.close();
  }
  popoutWindows.clear();
}
```

- [ ] **Step 2: Register pop-out IPC handlers**

Add to `electron/ipc-handlers.ts`:
```typescript
import { createPopOutWindow, closePopOutWindow, hasPopOutWindow, closeAllPopOutWindows } from "./popout-manager";

// Inside registerIpcHandlers:
ipcMain.handle("popout:create", (event, sessionId: string, sessionName: string) => {
  const preloadPath = path.join(__dirname, "preload.js");
  const devUrl = MAIN_WINDOW_VITE_DEV_SERVER_URL || undefined;
  const win = createPopOutWindow(sessionId, sessionName, preloadPath, devUrl);
  // Notify main window when pop-out closes (so grid can restore tile)
  win.on("closed", () => {
    const mainWin = BrowserWindow.getAllWindows().find(w => w.id !== win.id);
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.webContents.send("popout:closed", sessionId);
    }
  });
  return true;
});

ipcMain.handle("popout:close", (_, sessionId: string) => {
  closePopOutWindow(sessionId);
});

ipcMain.handle("popout:exists", (_, sessionId: string) => {
  return hasPopOutWindow(sessionId);
});
```

Note: `MAIN_WINDOW_VITE_DEV_SERVER_URL` needs to be accessible. Pass it from `main.ts` or store it as a module-level variable.

- [ ] **Step 3: Update preload.ts with popout API**

Add to the `contextBridge.exposeInMainWorld("bastion", { ... })` object:
```typescript
popout: {
  create: (sessionId: string, sessionName: string) => ipcRenderer.invoke("popout:create", sessionId, sessionName),
  close: (sessionId: string) => ipcRenderer.invoke("popout:close", sessionId),
  exists: (sessionId: string) => ipcRenderer.invoke("popout:exists", sessionId),
  onClosed: (callback: (sessionId: string) => void) => {
    const handler = (_: any, sessionId: string) => callback(sessionId);
    ipcRenderer.on("popout:closed", handler);
    return () => ipcRenderer.removeListener("popout:closed", handler);
  },
},
```

- [ ] **Step 4: Update electron.d.ts type declarations**

Add to the `BastionAPI` interface:
```typescript
popout: {
  create(sessionId: string, sessionName: string): Promise<boolean>;
  close(sessionId: string): Promise<void>;
  exists(sessionId: string): Promise<boolean>;
  onClosed(callback: (sessionId: string) => void): () => void;
};
```

- [ ] **Step 5: Wire popout manager into main.ts**

Import `closeAllPopOutWindows` in main.ts. Add to the `before-quit` handler:
```typescript
app.on("before-quit", () => {
  closeAllPopOutWindows();
  sessionManager?.flushAndClose();
});
```

- [ ] **Step 6: Commit**

```bash
PATH="/tmp/bastion-bin:$PATH" git commit -m "feat: pop-out window manager with IPC handlers"
```

---

### Task 6: Pop-out renderer and placeholder tile

**Files:**
- Create: `src/components/PopOut/popout.html`
- Create: `src/components/PopOut/popout-renderer.tsx`
- Create: `src/components/PopOut/PopOutTerminal.tsx`
- Create: `src/components/Grid/PlaceholderTile.tsx`
- Modify: `src/components/Grid/TerminalGrid.tsx`
- Modify: `src/components/Grid/TerminalTile.tsx`
- Modify: `vite.renderer.config.ts`

- [ ] **Step 1: Create popout.html**

Create `src/components/PopOut/popout.html`:
```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Bastion — Pop Out</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body, #root { width: 100%; height: 100%; background: #0d1117; color: #c9d1d9; overflow: hidden; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./popout-renderer.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Create popout-renderer.tsx**

Create `src/components/PopOut/popout-renderer.tsx`:
```typescript
import React from "react";
import { createRoot } from "react-dom/client";
import PopOutTerminal from "./PopOutTerminal";
import "@xterm/xterm/css/xterm.css";

// Get session ID from URL query params
const params = new URLSearchParams(window.location.search);
const sessionId = params.get("sessionId");

const root = createRoot(document.getElementById("root")!);

if (!sessionId) {
  root.render(<div style={{ padding: 20, color: "#f85149" }}>Error: No session ID provided</div>);
} else {
  root.render(<PopOutTerminal sessionId={sessionId} />);
}
```

- [ ] **Step 3: Create PopOutTerminal component**

Create `src/components/PopOut/PopOutTerminal.tsx`:

A minimal terminal view: drag region at top (38px), small header with status dot + session name + Stop button, full-size xterm.js terminal below.

```typescript
import React, { useState, useEffect } from "react";
import { useTerminal } from "../../hooks/useTerminal";
import type { Session } from "../../../electron/core/types";

interface PopOutTerminalProps {
  sessionId: string;
}

export default function PopOutTerminal({ sessionId }: PopOutTerminalProps) {
  const [session, setSession] = useState<Session | null>(null);
  const { containerRef } = useTerminal({ sessionId });

  // Fetch session info on mount and poll for updates
  useEffect(() => {
    const fetch = async () => {
      const s = await window.bastion.sessions.get(sessionId);
      setSession(s);
    };
    fetch();
    const interval = setInterval(fetch, 2000);
    return () => clearInterval(interval);
  }, [sessionId]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      {/* Drag region */}
      <div style={{ height: 38, WebkitAppRegion: "drag" as any, flexShrink: 0 }} />

      {/* Minimal header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 12px 8px", flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            width: 8, height: 8, borderRadius: "50%",
            backgroundColor: session?.status === "running" ? "#3fb950"
              : session?.status === "waiting" ? "#d29922"
              : session?.status === "error" ? "#f85149" : "#484f58",
          }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: "#c9d1d9" }}>
            {session?.name || "Loading..."}
          </span>
        </div>
        <button
          onClick={async () => {
            if (session && confirm(`Stop session "${session.name}"?`)) {
              await window.bastion.sessions.stop(sessionId);
            }
          }}
          style={{
            fontSize: 11, padding: "3px 10px", borderRadius: 4,
            border: "1px solid #30363d", background: "transparent",
            color: "#8b949e", cursor: "pointer",
            WebkitAppRegion: "no-drag" as any,
          }}
        >
          Stop
        </button>
      </div>

      {/* Terminal */}
      <div ref={containerRef} style={{ flex: 1 }} />
    </div>
  );
}
```

- [ ] **Step 4: Create PlaceholderTile component**

Create `src/components/Grid/PlaceholderTile.tsx`:

```typescript
import React from "react";
import type { Session } from "../../../electron/core/types";

interface PlaceholderTileProps {
  session: Session;
  onSnapBack: () => void;
}

export default function PlaceholderTile({ session, onSnapBack }: PlaceholderTileProps) {
  return (
    <div
      data-testid="placeholder-tile"
      className="tile-placeholder-enter"
      style={{
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        background: "#0d111788", border: "2px dashed #30363d", borderRadius: 4,
      }}
    >
      <div style={{ color: "#8b949e", fontSize: 12, marginBottom: 4 }}>{session.name}</div>
      <div style={{ color: "#484f58", fontSize: 11, marginBottom: 12 }}>Popped out ↗</div>
      <button
        onClick={onSnapBack}
        style={{
          fontSize: 11, padding: "4px 12px", borderRadius: 4,
          border: "1px solid #30363d", background: "#21262d",
          color: "#c9d1d9", cursor: "pointer",
        }}
      >
        Snap Back
      </button>
    </div>
  );
}
```

- [ ] **Step 5: Integrate placeholders into TerminalGrid**

In `TerminalGrid.tsx`, check `poppedOutSessionIds` from the UI store. For each gridded session that is popped out, render a `PlaceholderTile` instead of a `TerminalTile`.

```tsx
const poppedOutSessionIds = useUIStore((s) => s.poppedOutSessionIds);

// Inside the grid render:
{gridSessions.map((session) => (
  poppedOutSessionIds.has(session.id) ? (
    <PlaceholderTile
      key={session.id}
      session={session}
      onSnapBack={() => window.bastion.popout.close(session.id)}
    />
  ) : (
    <TerminalTile key={session.id} session={session} />
  )
))}
```

- [ ] **Step 6: Wire pop-out button in TerminalTile**

Replace the `handlePopOut` stub from Task 2 with:
```typescript
const handlePopOut = async () => {
  useUIStore.getState().addPopOut(session.id);
  await window.bastion.popout.create(session.id, session.name);
};
```

Also add a `useEffect` in App.tsx to listen for pop-out window close events:
```typescript
useEffect(() => {
  const unsubscribe = window.bastion.popout.onClosed((sessionId) => {
    useUIStore.getState().removePopOut(sessionId);
  });
  return unsubscribe;
}, []);
```

- [ ] **Step 7: Add popout entry to Vite config**

Update `vite.renderer.config.ts` to handle the popout HTML as a multi-page entry. Add a `build.rollupOptions.input` if needed, or ensure Vite serves the popout.html for the dev server.

For dev mode, the simplest approach: place `popout.html` in the `src/` root (next to `index.html`) so Vite serves it automatically.

- [ ] **Step 8: Commit**

```bash
PATH="/tmp/bastion-bin:$PATH" git commit -m "feat: pop-out windows with placeholder tiles and snap-back"
```

---

## Phase 4: Sidebar Improvements

### Task 7: Waiting sort, overflow expander, pop-out indicator

**Files:**
- Modify: `src/components/Sidebar/ProjectTree.tsx`
- Modify: `src/components/Sidebar/SessionItem.tsx`

- [ ] **Step 1: Sort waiting sessions to top in ProjectTree**

In `ProjectTree.tsx`, before rendering session items, sort the project's sessions:
```typescript
const sortedSessions = useMemo(() => {
  return [...projectSessions].sort((a, b) => {
    // Waiting first, then by gridSlot
    if (a.status === "waiting" && b.status !== "waiting") return -1;
    if (a.status !== "waiting" && b.status === "waiting") return 1;
    return (a.gridSlot ?? 999) - (b.gridSlot ?? 999);
  });
}, [projectSessions]);
```

- [ ] **Step 2: Add amber badge to collapsed project headers**

When a project is collapsed and has any session with status "waiting", show a small amber dot (6px) next to the session count:
```tsx
{hasWaitingSessions && (
  <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "#d29922", marginRight: 4 }} />
)}
```

- [ ] **Step 3: Make overflow expandable**

Replace the static "+ N more not in grid" text with a clickable toggle:
```tsx
const [showOverflow, setShowOverflow] = useState(false);

{overflowSessions.length > 0 && (
  <div>
    <button
      onClick={() => setShowOverflow(!showOverflow)}
      style={{ /* link-style button */ }}
    >
      {showOverflow ? "Hide" : `+ ${overflowSessions.length} more`}
    </button>
    {showOverflow && overflowSessions.map(session => (
      <div key={session.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <SessionItem session={session} ... />
        <button
          onClick={() => pinToGrid(session.id)}
          title="Pin to Grid"
          style={{ fontSize: 9, color: "#484f58" }}
        >
          📌
        </button>
      </div>
    ))}
  </div>
)}
```

The `pinToGrid` function: find the next available grid slot (0-5), call `setGridSlot(sessionId, slot)`.

- [ ] **Step 4: Add pop-out indicator to SessionItem**

In `SessionItem.tsx`, accept a new prop `isPoppedOut: boolean`. When true, show "↗" next to the session name:
```tsx
{isPoppedOut && <span style={{ color: "#484f58", fontSize: 10, marginLeft: 4 }}>↗</span>}
```

Wire this from ProjectTree and Sidebar by checking `useUIStore.getState().poppedOutSessionIds`.

- [ ] **Step 5: Commit**

```bash
PATH="/tmp/bastion-bin:$PATH" git commit -m "feat: sidebar waiting sort, overflow expander, pop-out indicator"
```

---

## Phase 5: Integration & Testing

### Task 8: Update E2E tests for new UX

**Files:**
- Modify: `tests/e2e/app.spec.ts`
- Modify: `tests/e2e/helpers.ts`

- [ ] **Step 1: Update existing tests for renamed state**

Replace all `maximizedSessionId` references with `zoomedSessionId` in E2E tests. Update any selectors that changed (e.g., maximize button → expand button).

- [ ] **Step 2: Add zoom E2E tests**

```typescript
test.describe("Zoom Mode", () => {
  test("expand button zooms tile to fill grid", async () => {
    // Create session, click expand button, verify zoom overlay appears
  });

  test("Escape exits zoom mode", async () => {
    // Zoom a tile, press Escape, verify grid returns
  });

  test("toolbar shows zoom breadcrumb with session name", async () => {
    // Zoom a tile, verify toolbar shows session name + close button
  });

  test("Cmd+Enter toggles zoom", async () => {
    // Focus tile, Cmd+Enter, verify zoomed, Cmd+Enter again, verify grid
  });
});
```

- [ ] **Step 3: Add tile header E2E tests**

```typescript
test.describe("Tile Header", () => {
  test("tile has expand, popout, and menu buttons", async () => {
    // Create session, verify all three buttons exist with correct testids
  });

  test("right-click tile header shows context menu", async () => {
    // Create session, right-click header, verify menu items
  });

  test("inline rename via double-click", async () => {
    // Create session, double-click name, type new name, Enter, verify renamed
  });
});
```

- [ ] **Step 4: Add sidebar improvement tests**

```typescript
test.describe("Sidebar Improvements", () => {
  test("overflow sessions are expandable", async () => {
    // Requires 7+ sessions in one project (beyond MAX_VISIBLE)
    // Verify "+ N more" is clickable and reveals hidden sessions
  });
});
```

- [ ] **Step 5: Run all tests**

```bash
npm test                  # Unit tests
npm run test:e2e          # E2E tests
```

Fix any failures.

- [ ] **Step 6: Commit**

```bash
PATH="/tmp/bastion-bin:$PATH" git commit -m "test: E2E tests for zoom, tile header, sidebar improvements"
```

---

### Task 9: Final cleanup and edge case fixes

**Files:**
- Modify: `src/store/ui.ts`
- Modify: `src/components/Grid/TerminalGrid.tsx`
- Modify: `src/hooks/useKeyboard.ts`

- [ ] **Step 1: Handle deleted session while zoomed**

In `TerminalGrid.tsx`, add a check: if `zoomedSessionId` is set but the session no longer exists in the sessions array, clear the zoom:
```typescript
useEffect(() => {
  if (zoomedSessionId && !sessions.find(s => s.id === zoomedSessionId)) {
    useUIStore.getState().toggleZoom(null);
  }
}, [sessions, zoomedSessionId]);
```

- [ ] **Step 2: Handle deleted session while popped out**

In `App.tsx`, add a check: if a session in `poppedOutSessionIds` no longer exists, close its pop-out window:
```typescript
useEffect(() => {
  const poppedOut = useUIStore.getState().poppedOutSessionIds;
  for (const sessionId of poppedOut) {
    if (!sessions.find(s => s.id === sessionId)) {
      window.bastion.popout.close(sessionId);
      useUIStore.getState().removePopOut(sessionId);
    }
  }
}, [sessions]);
```

- [ ] **Step 3: Prevent Cmd+Enter on popped-out sessions**

In `useKeyboard.ts`, before toggling zoom, check that the focused session is not popped out:
```typescript
if (e.key === "Enter") {
  const focusedId = useUIStore.getState().focusedTileSessionId;
  if (focusedId && !useUIStore.getState().isSessionPoppedOut(focusedId)) {
    useUIStore.getState().toggleZoom(focusedId);
  }
  return;
}
```

- [ ] **Step 4: Commit**

```bash
PATH="/tmp/bastion-bin:$PATH" git commit -m "fix: edge cases for deleted/popped-out sessions during zoom"
```

---

## Summary

| Phase | Tasks | What it delivers |
|-------|-------|-----------------|
| Phase 1: Visual Polish | Tasks 1-2 | CSS animations (waiting pulse, focus glow, transitions), tile header redesign (icons, tooltips, inline rename, context menu) |
| Phase 2: Zoom Mode | Tasks 3-4 | Zoom state in store, animated zoom overlay, toolbar breadcrumb, session cycling |
| Phase 3: Pop-Out | Tasks 5-6 | Native BrowserWindow pop-outs, placeholder tiles, snap-back, PTY sharing |
| Phase 4: Sidebar | Task 7 | Waiting sort, overflow expander, pop-out indicator |
| Phase 5: Testing | Tasks 8-9 | E2E tests for all new features, edge case fixes |

**Total: 9 tasks.** Each task is independently committable. Phases can be tested incrementally.
