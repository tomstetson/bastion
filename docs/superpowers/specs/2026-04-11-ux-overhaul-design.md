# Bastion UX Overhaul — Terminal Expand Modes & Polish

**Date:** 2026-04-11
**Status:** Proposed
**Author:** Tom Stetson + Claude

## Overview

A cohesive UX overhaul that adds two terminal expand modes (zoom and pop-out) and fixes 8 existing UX issues to create a polished experience for managing multiple Claude Code sessions.

### Problem

The current UI has a maximize toggle that's invisible (tiny icon, no tooltip, no animation), breaks when switching projects, and doesn't communicate available interactions. Tile headers are cramped, context menus only work from the sidebar, and "needs attention" sessions don't surface visually.

### Solution

1. **Zoom mode** — in-place expand with smooth animation, session cycling while zoomed
2. **Pop-out mode** — native macOS window per session, grid shows placeholder, closing returns to grid
3. **Tile header redesign** — clear icons, tooltips, inline rename, context menu
4. **Sidebar improvements** — waiting sessions sort to top, overflow is expandable, sync fixes
5. **Animations** — smooth transitions on all state changes using CSS transforms

## Terminal Expand Modes

### Zoom Mode (In-Place Expand)

**Triggers:**
- Click expand icon (⤢) in tile header
- Cmd+Enter (keyboard shortcut)
- Double-click tile header

**Behavior:**
- Tile smoothly animates to fill the entire grid area (~200ms ease-out)
- Other tiles fade out (opacity 0.3, 150ms)
- Sidebar stays visible
- Toolbar breadcrumb updates: `bastion › 4 sessions › refactor core [✕ back to grid]`

**While zoomed:**
- Cmd+[ and Cmd+] cycle through sessions without returning to grid
- All keyboard input passes through to the terminal
- xterm.js `fit()` called after animation completes

**Exit zoom:**
- Escape key
- Cmd+Enter (toggle)
- Click "back to grid" in toolbar
- Smooth reverse animation: zoomed tile scales back to grid slot, other tiles fade in

### Pop-Out Mode (Native Window)

**Triggers:**
- Click pop-out icon (⧉) in tile header
- Right-click tile → "Pop Out to Window"

**Behavior:**
- Opens a new Electron BrowserWindow with just the terminal
- Window title: "Bastion — [session name]"
- Minimal chrome: title bar with session name, status dot, Stop button
- No sidebar, no toolbar — full terminal space
- Can resize, move to another monitor, Cmd+Tab to it

**Grid placeholder:**
- Original grid slot shows placeholder tile: session name, "Popped out ↗" label, "Snap Back" button
- Placeholder does NOT have zoom/pop-out buttons

**Closing pop-out:**
- Red traffic light or Cmd+W on the pop-out window
- Does NOT stop the session — returns the tile to its grid slot
- Placeholder fades out, real tile fades in

**Stopping a session from pop-out:**
- Only via the explicit Stop button in the pop-out title bar
- Or right-click → Stop in the main window's sidebar

**Multiple pop-outs:**
- Multiple sessions can be popped out simultaneously
- Each gets its own native window
- Each grid slot shows its own placeholder

## Tile Header Redesign

### Layout

```
● session-name        claude    2m ago    [⤢] [⧉] [▾]
```

| Element | Behavior |
|---------|----------|
| Status dot | 10px, colored by status (green/amber/gray/red/dark) |
| Session name | Bold. Double-click → inline editable text field. Enter saves, Escape cancels. |
| Tool badge | Muted text ("claude", "shell", etc.) |
| Last activity | Live-updating relative timestamp ("2m ago") |
| Expand [⤢] | Zoom in-place. Tooltip: "Expand (Cmd+Enter)" |
| Pop-out [⧉] | New native window. Tooltip: "Pop out to window" |
| Menu [▾] | Opens tile context menu |

### Tile Context Menu

Available via right-click on tile header OR click the ▾ button:

- Expand (Cmd+Enter)
- Pop Out to Window
- Rename
- ---
- Stop Session
- Restart Session
- ---
- Remove from Grid (unsets gridSlot — session moves to sidebar overflow, slot becomes ghost tile, session keeps running)
- Delete Session (danger, with confirmation)

### Visual States

**Focused tile:** 2px border `#58a6ff` with glow `box-shadow: 0 0 0 1px rgba(88, 166, 255, 0.3)`, transition 100ms.

**Waiting tile:** Amber border with pulse animation — opacity oscillates 0.6→1.0 over 2 seconds, infinite loop. Subtle enough to not distract.

**Popped-out placeholder:** Dashed border (like ghost tiles), session name centered, "Popped out ↗" label, "Snap Back" button.

**Stopped tile:** No terminal content. Centered "Session ended" message, Resume button (if resume data exists), Remove button.

## Sidebar & Navigation Improvements

### Needs-Attention Sorting

- Sessions with status "waiting" sort to the top within each project group
- Collapsed project headers show an amber dot badge if any child session is waiting
- Clicking a status filter pill (e.g., "Waiting 3") filters the grid to show only matching sessions across all projects

### Sidebar-Grid Sync Fixes

- Switching projects clears zoomed state — always land on grid view
- Deleting a zoomed session gracefully returns to grid (no blank screen)
- Clicking a sidebar session: navigates to its project grid and focuses that tile
- Popped-out sessions show "↗" icon next to their name in the sidebar

### Session Overflow

- Change "+ N more not in grid" from static text to a clickable expander
- Clicking reveals full session list (scrollable within sidebar)
- Each overflow session: status dot, name, "Pin to Grid" button
- "Pin to Grid" swaps the session into the next available grid slot (or replaces least-recently-focused tile if grid is full)

## Animations & Transitions

All animations use CSS transforms and opacity only (no layout-triggering properties). `will-change: transform, opacity` applied during animation.

| Transition | Duration | Properties |
|-----------|----------|------------|
| Zoom expand | 200ms ease-out | transform (scale), position absolute overlay |
| Zoom collapse | 200ms ease-in | transform (scale), position absolute overlay |
| Other tiles fade during zoom | 150ms | opacity (1→0.3 and back) |
| Pop-out tile shrink | 100ms | transform (scale 0.95) |
| Placeholder fade in/out | 150ms | opacity |
| Tile focus border | 100ms | border-color, box-shadow |
| Waiting pulse | 2000ms infinite | border-opacity (0.6→1.0) |
| Project expand/collapse | 150ms | height with overflow hidden |
| Toolbar layout button | 100ms | background, color |

### Performance

- No `requestAnimationFrame` loops — pure CSS transitions
- `will-change` applied only during active animations, removed after
- xterm.js `fit()` called after transition completes (via `transitionend` event), not during

## Pop-Out Window Architecture

### Main Process

New IPC handlers:
- `popout:create` — creates a BrowserWindow, loads a minimal renderer with just the terminal
- `popout:close` — closes the pop-out window, signals grid to restore tile
- `popout:exists` — check if a session has an active pop-out

Pop-out BrowserWindow config:
- Size: 800x600 default, minimum 400x300
- titleBarStyle: "hiddenInset" (same as main window)
- Shares the same preload script (same IPC API)
- Loads a dedicated route/component: just the terminal + minimal header

### Renderer

New component: `PopOutTerminal.tsx` — standalone terminal view:
- Minimal header: status dot, session name, Stop button
- Full-size xterm.js terminal
- No sidebar, no grid, no toolbar

State tracking:
- `ui.ts` adds `poppedOutSessionIds: Set<string>`
- Grid checks this set to render placeholders instead of terminals
- Sidebar checks this set to show ↗ icon

### PTY Sharing

The PTY process runs in the main process — it's not tied to any renderer window. When a session pops out:
1. Grid renderer unsubscribes from PTY data for that session
2. Pop-out renderer subscribes to the same PTY via the same IPC channel
3. On snap-back: pop-out unsubscribes, grid re-subscribes + replays ring buffer

No PTY restart needed — seamless terminal transfer.

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| App quit with pop-outs open | All pop-out windows close. Resume data captured for each session. |
| Session stops while popped out | Pop-out shows stopped state (Session ended + Resume/Remove buttons) |
| Multiple pop-outs | Each gets own window. Each grid slot shows placeholder. |
| Pop-out + zoom | Can't zoom a placeholder. Zoom button hidden on placeholders. |
| Window resize during zoom | xterm.js `fit()` called with debounce on resize. |
| Cmd+Enter on popped-out session | No-op (not in grid). |
| Delete zoomed session | Graceful return to grid view. |
| Project switch while zoomed | Zoom cleared, land on new project grid. |
| Pop-out window Cmd+W | Closes window, returns session to grid. Does NOT stop session. |

## Testing

### New E2E Tests

- Zoom: click expand → tile fills grid → Escape returns to grid
- Zoom keyboard: Cmd+Enter toggles zoom on focused tile
- Zoom navigation: while zoomed, Cmd+] cycles to next session
- Pop-out: click pop-out icon → new window opens → grid shows placeholder
- Pop-out close: close pop-out window → tile returns to grid slot
- Pop-out stop: stop session in pop-out → shows stopped state
- Tile context menu: right-click tile header → menu with all options
- Inline rename: double-click name → edit → Enter saves
- Waiting pulse: waiting session shows pulse animation on border
- Sidebar overflow: expand "+N more" → full list → "Pin to Grid" works
- Project switch clears zoom: zoom → switch project → grid view
- Sidebar ↗ icon: pop-out session shows icon in sidebar

### Unit Tests

- `ui.ts` store: zoom/popout state management, toggle behavior, project-switch clearing
- Pop-out IPC handlers: create/close/exists
