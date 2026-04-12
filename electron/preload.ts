/**
 * Preload script — exposes the typed Bastion API to the renderer process.
 *
 * Bridges renderer ↔ main process via contextBridge + ipcRenderer.
 * Uses invoke() for request/response and send() for fire-and-forget PTY I/O.
 * PTY data streaming uses ipcRenderer.on() with cleanup functions to prevent leaks.
 *
 * Security: contextIsolation is enabled — the renderer cannot access Node.js
 * or Electron APIs directly. Only the explicitly exposed methods are available.
 */

import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("bastion", {
  // ---------------------------------------------------------------------------
  // Projects
  // ---------------------------------------------------------------------------
  projects: {
    list: () => ipcRenderer.invoke("projects:list"),
    create: (name: string, path: string) =>
      ipcRenderer.invoke("projects:create", name, path),
    rename: (id: string, name: string) =>
      ipcRenderer.invoke("projects:rename", id, name),
    setLayout: (id: string, layout: string) =>
      ipcRenderer.invoke("projects:setLayout", id, layout),
    delete: (id: string) => ipcRenderer.invoke("projects:delete", id),
  },

  // ---------------------------------------------------------------------------
  // Sessions
  // ---------------------------------------------------------------------------
  sessions: {
    create: (options: any) => ipcRenderer.invoke("sessions:create", options),
    get: (id: string) => ipcRenderer.invoke("sessions:get", id),
    listByProject: (projectId: string) =>
      ipcRenderer.invoke("sessions:listByProject", projectId),
    listStandalone: () => ipcRenderer.invoke("sessions:listStandalone"),
    listAll: () => ipcRenderer.invoke("sessions:listAll"),
    listByStatus: (status: string) =>
      ipcRenderer.invoke("sessions:listByStatus", status),
    stop: (id: string) => ipcRenderer.invoke("sessions:stop", id),
    restart: (id: string) => ipcRenderer.invoke("sessions:restart", id),
    resume: (id: string) => ipcRenderer.invoke("sessions:resume", id),
    delete: (id: string) => ipcRenderer.invoke("sessions:delete", id),
    rename: (id: string, name: string) =>
      ipcRenderer.invoke("sessions:rename", id, name),
    setGridSlot: (id: string, slot: number | null) =>
      ipcRenderer.invoke("sessions:setGridSlot", id, slot),
  },

  // ---------------------------------------------------------------------------
  // PTY — terminal I/O and subscriptions
  // ---------------------------------------------------------------------------
  pty: {
    /** Subscribe to PTY output; returns buffered output for replay. */
    subscribe: (sessionId: string) =>
      ipcRenderer.invoke("pty:subscribe", sessionId),

    /** Send input to a PTY (fire-and-forget for low latency). */
    write: (sessionId: string, data: string) =>
      ipcRenderer.send("pty:input", sessionId, data),

    /** Resize a PTY (fire-and-forget). */
    resize: (sessionId: string, cols: number, rows: number) =>
      ipcRenderer.send("pty:resize", sessionId, cols, rows),

    /** Listen for PTY output data. Returns an unsubscribe function. */
    onData: (sessionId: string, callback: (data: string) => void) => {
      const channel = `pty:data:${sessionId}`;
      const handler = (_: any, data: string) => callback(data);
      ipcRenderer.on(channel, handler);
      return () => ipcRenderer.removeListener(channel, handler);
    },

    /** Listen for PTY exit. Returns an unsubscribe function. */
    onExit: (sessionId: string, callback: (code: number) => void) => {
      const channel = `pty:exit:${sessionId}`;
      const handler = (_: any, code: number) => callback(code);
      ipcRenderer.on(channel, handler);
      return () => ipcRenderer.removeListener(channel, handler);
    },
  },

  // ---------------------------------------------------------------------------
  // Pop-out windows — detached single-session windows
  // ---------------------------------------------------------------------------
  popout: {
    create: (sessionId: string, sessionName: string) =>
      ipcRenderer.invoke("popout:create", sessionId, sessionName),
    close: (sessionId: string) =>
      ipcRenderer.invoke("popout:close", sessionId),
    exists: (sessionId: string) =>
      ipcRenderer.invoke("popout:exists", sessionId),
    onClosed: (callback: (sessionId: string) => void) => {
      const handler = (_: any, sessionId: string) => callback(sessionId);
      ipcRenderer.on("popout:closed", handler);
      return () => ipcRenderer.removeListener("popout:closed", handler);
    },
  },

  // ---------------------------------------------------------------------------
  // Native dialogs
  // ---------------------------------------------------------------------------
  dialog: {
    openFolder: () => ipcRenderer.invoke("dialog:openFolder"),
  },
});
