/**
 * IPC Bridge — registers Electron IPC handlers for all session, project, and PTY operations.
 *
 * Uses ipcMain.handle() for request/response patterns (projects, sessions, dialogs)
 * and ipcMain.on() for fire-and-forget PTY I/O (input, resize) where low latency matters.
 *
 * PTY subscription streams data to the renderer via webContents.send() with
 * session-scoped channels (pty:data:<sessionId>, pty:exit:<sessionId>).
 */

import { ipcMain, dialog } from "electron";
import type { SessionManager } from "./core/session-manager";
import type { SessionCreateOptions, GridLayout } from "./core/types";

export function registerIpcHandlers(sessionManager: SessionManager): void {
  // ---------------------------------------------------------------------------
  // Projects — request/response via ipcMain.handle
  // ---------------------------------------------------------------------------

  ipcMain.handle("projects:list", () => sessionManager.listProjects());

  ipcMain.handle("projects:create", (_, name: string, path: string) =>
    sessionManager.createProject(name, path),
  );

  ipcMain.handle("projects:rename", (_, id: string, name: string) =>
    sessionManager.renameProject(id, name),
  );

  ipcMain.handle("projects:setLayout", (_, id: string, layout: GridLayout) =>
    sessionManager.setProjectLayout(id, layout),
  );

  ipcMain.handle("projects:delete", (_, id: string) =>
    sessionManager.deleteProject(id),
  );

  // ---------------------------------------------------------------------------
  // Sessions — request/response via ipcMain.handle
  // ---------------------------------------------------------------------------

  ipcMain.handle("sessions:create", (_, options: SessionCreateOptions) =>
    sessionManager.createSession(options),
  );

  ipcMain.handle("sessions:get", (_, id: string) =>
    sessionManager.getSession(id),
  );

  ipcMain.handle("sessions:listByProject", (_, projectId: string) =>
    sessionManager.listSessionsByProject(projectId),
  );

  ipcMain.handle("sessions:listStandalone", () =>
    sessionManager.listStandaloneSessions(),
  );

  ipcMain.handle("sessions:listAll", () => sessionManager.listAllSessions());

  ipcMain.handle("sessions:listByStatus", (_, status: string) =>
    sessionManager.listSessionsByStatus(status as any),
  );

  ipcMain.handle("sessions:stop", (_, id: string) =>
    sessionManager.stopSession(id),
  );

  ipcMain.handle("sessions:restart", (_, id: string) =>
    sessionManager.restartSession(id),
  );

  ipcMain.handle("sessions:resume", (_, id: string) =>
    sessionManager.resumeSession(id),
  );

  ipcMain.handle("sessions:delete", (_, id: string) =>
    sessionManager.deleteSession(id),
  );

  ipcMain.handle("sessions:rename", (_, id: string, name: string) =>
    sessionManager.renameSession(id, name),
  );

  ipcMain.handle(
    "sessions:setGridSlot",
    (_, id: string, slot: number | null) =>
      sessionManager.setGridSlot(id, slot),
  );

  // ---------------------------------------------------------------------------
  // PTY I/O — fire-and-forget via ipcMain.on (performance-critical path)
  // ---------------------------------------------------------------------------

  ipcMain.on("pty:input", (_, sessionId: string, data: string) => {
    try {
      sessionManager["ptyManager"].write(sessionId, data);
    } catch {
      // Session may have been disposed — safe to ignore
    }
  });

  ipcMain.on(
    "pty:resize",
    (_, sessionId: string, cols: number, rows: number) => {
      try {
        sessionManager["ptyManager"].resize(sessionId, cols, rows);
      } catch {
        // Session may have been disposed — safe to ignore
      }
    },
  );

  // ---------------------------------------------------------------------------
  // PTY subscription — returns buffered output for replay, streams new output
  // ---------------------------------------------------------------------------

  ipcMain.handle("pty:subscribe", (event, sessionId: string) => {
    const webContents = event.sender;

    // Stream new output to renderer via session-scoped channel
    sessionManager["ptyManager"].onData(sessionId, (data: string) => {
      if (!webContents.isDestroyed()) {
        webContents.send(`pty:data:${sessionId}`, data);
      }
    });

    // Notify renderer when PTY exits
    // PTYManager onExit provides { exitCode, signal } — extract exitCode for renderer
    sessionManager["ptyManager"].onExit(
      sessionId,
      (info: { exitCode: number; signal?: number }) => {
        if (!webContents.isDestroyed()) {
          webContents.send(`pty:exit:${sessionId}`, info.exitCode);
        }
      },
    );

    // Return buffered output so the renderer can replay recent history
    return sessionManager["ptyManager"]
      .getLastLines(sessionId, 10_000)
      .join("\n");
  });

  // ---------------------------------------------------------------------------
  // Native dialogs
  // ---------------------------------------------------------------------------

  ipcMain.handle("dialog:openFolder", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory", "createDirectory"],
    });
    return result.canceled ? null : result.filePaths[0];
  });
}
