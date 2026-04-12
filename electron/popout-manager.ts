/**
 * Pop-out Window Manager — creates and tracks detached session windows.
 *
 * Each pop-out window displays a single terminal session in its own OS window.
 * Windows are tracked by session ID so duplicate pop-outs are prevented —
 * requesting a pop-out for an already-open session focuses the existing window.
 *
 * Security: preload + contextIsolation enforced on every pop-out window.
 * Session IDs are validated as UUIDs at the session-manager layer before
 * reaching this code.
 */

import { BrowserWindow } from "electron";
import path from "node:path";
import { createLogger } from "./core/logger";

const log = createLogger("popout");

/** Active pop-out windows keyed by session ID. */
const popoutWindows = new Map<string, BrowserWindow>();

/**
 * Create (or focus) a pop-out window for a session.
 *
 * If a non-destroyed window already exists for this session, it is focused
 * and returned instead of creating a duplicate.
 */
export function createPopOutWindow(
  sessionId: string,
  sessionName: string,
  preloadPath: string,
  devServerUrl?: string,
): BrowserWindow {
  if (popoutWindows.has(sessionId)) {
    const existing = popoutWindows.get(sessionId)!;
    if (!existing.isDestroyed()) {
      existing.focus();
      return existing;
    }
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

  if (devServerUrl) {
    win.loadURL(
      `${devServerUrl}/popout.html?sessionId=${encodeURIComponent(sessionId)}`,
    );
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

/** Close and remove the pop-out window for a session. */
export function closePopOutWindow(sessionId: string): void {
  const win = popoutWindows.get(sessionId);
  if (win && !win.isDestroyed()) {
    win.close();
  }
  popoutWindows.delete(sessionId);
}

/** Check whether a non-destroyed pop-out window exists for a session. */
export function hasPopOutWindow(sessionId: string): boolean {
  const win = popoutWindows.get(sessionId);
  return win !== undefined && !win.isDestroyed();
}

/** Close all pop-out windows (called during app shutdown). */
export function closeAllPopOutWindows(): void {
  for (const [, win] of popoutWindows) {
    if (!win.isDestroyed()) win.close();
  }
  popoutWindows.clear();
}
