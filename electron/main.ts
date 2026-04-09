import { app, BrowserWindow } from "electron";
import path from "node:path";
import os from "node:os";
import { Storage } from "./core/storage";
import { PTYManager } from "./core/pty-manager";
import { StatusDetector } from "./core/status-detector";
import { ResumeManager } from "./core/resume-manager";
import { SessionManager } from "./core/session-manager";
import { registerIpcHandlers } from "./ipc-handlers";

let mainWindow: BrowserWindow | null = null;
let sessionManager: SessionManager | null = null;

/**
 * Initialize core services: storage, PTY manager, status detection,
 * resume handling, and session orchestration. Starts the periodic
 * status refresh and registers all IPC handlers.
 */
function initCore(): void {
  const bastionDir = path.join(os.homedir(), ".bastion");
  const storage = new Storage();
  const ptyManager = new PTYManager({
    buffersDir: path.join(bastionDir, "buffers"),
  });
  const statusDetector = new StatusDetector();
  const resumeManager = new ResumeManager();

  sessionManager = new SessionManager({
    storage,
    ptyManager,
    statusDetector,
    resumeManager,
  });

  sessionManager.startStatusRefresh();
  registerIpcHandlers(sessionManager);
}

function createWindow(): void {
  // Read saved window bounds so the app reopens where the user left it
  const tempStorage = new Storage();
  const savedState = tempStorage.getWindowState();
  tempStorage.close();

  mainWindow = new BrowserWindow({
    x: savedState?.x,
    y: savedState?.y,
    width: savedState?.width ?? 1400,
    height: savedState?.height ?? 900,
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

  // Persist window bounds on move/resize (debounced 1s to avoid DB churn)
  let saveTimeout: ReturnType<typeof setTimeout> | null = null;
  const debouncedSave = () => {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      if (!mainWindow) return;
      const bounds = mainWindow.getBounds();
      const s = new Storage();
      s.saveWindowState({
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        activeProjectId: null,
        sidebarWidth: 220,
      });
      s.close();
    }, 1000);
  };
  mainWindow.on("resize", debouncedSave);
  mainWindow.on("move", debouncedSave);

  // In development, load from Vite dev server; in production, load built file.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }
}

app.whenReady().then(() => {
  initCore();
  createWindow();

  app.on("activate", () => {
    // macOS: re-create window when dock icon clicked and no windows open
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  app.quit();
});

// Capture resume data for running sessions before the app exits
app.on("before-quit", () => {
  sessionManager?.flushAndClose();
});

// Vite injects these constants at build time
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;
