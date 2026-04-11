/**
 * Structured logger for Bastion's main process.
 *
 * Writes human-readable lines to ~/.bastion/bastion.log.
 * Format: [ISO timestamp] [LEVEL] [module] message {optional data}
 *
 * Features:
 * - File rotation at 5 MB (keeps one .old backup)
 * - Module-scoped loggers via createLogger("module-name")
 * - Level filtering via BASTION_LOG_LEVEL env var (default: info)
 * - Console output in dev mode (ELECTRON_ENABLE_LOGGING=1) or for errors
 * - Restrictive file permissions (0o600 log, 0o700 directory)
 *
 * Uses synchronous file appends so every log line is immediately on disk.
 * At typical log volumes (dozens of lines/sec) this has negligible impact
 * on main-process performance.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LOG_DIR = path.join(os.homedir(), ".bastion");
const LOG_FILE = path.join(LOG_DIR, "bastion.log");
const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5 MB

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let minLevel: LogLevel =
  (process.env.BASTION_LOG_LEVEL as LogLevel) || "info";

/** File descriptor for the open log file (null until first write). */
let logFd: number | null = null;

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function ensureLogDir(): void {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true, mode: 0o700 });
  }
}

function rotateIfNeeded(): void {
  try {
    const stats = fs.statSync(LOG_FILE);
    if (stats.size > MAX_LOG_SIZE) {
      // Close current fd before rotating
      if (logFd !== null) {
        fs.closeSync(logFd);
        logFd = null;
      }
      const backup = LOG_FILE + ".old";
      if (fs.existsSync(backup)) fs.unlinkSync(backup);
      fs.renameSync(LOG_FILE, backup);
    }
  } catch {
    // File doesn't exist yet — nothing to rotate
  }
}

/** Open (or reopen) the log file descriptor. */
function getFd(): number {
  if (logFd === null) {
    ensureLogDir();
    rotateIfNeeded();
    // Open for appending; create if missing; restrict to owner-only read/write
    logFd = fs.openSync(LOG_FILE, "a", 0o600);
  }
  return logFd;
}

function formatLine(
  level: LogLevel,
  module: string,
  message: string,
  data?: Record<string, unknown>,
): string {
  const ts = new Date().toISOString();
  const dataStr = data ? " " + JSON.stringify(data) : "";
  return `[${ts}] [${level.toUpperCase()}] [${module}] ${message}${dataStr}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface Logger {
  debug: (msg: string, data?: Record<string, unknown>) => void;
  info: (msg: string, data?: Record<string, unknown>) => void;
  warn: (msg: string, data?: Record<string, unknown>) => void;
  error: (msg: string, data?: Record<string, unknown>) => void;
}

/**
 * Create a module-scoped logger.
 *
 * Usage:
 *   const log = createLogger("session-manager");
 *   log.info("Session created", { id: "abc-123" });
 */
export function createLogger(module: string): Logger {
  const log = (
    level: LogLevel,
    message: string,
    data?: Record<string, unknown>,
  ) => {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return;

    const line = formatLine(level, module, message, data);

    // Synchronous write — every line hits disk immediately
    fs.writeSync(getFd(), line + "\n");

    // Always print errors; print other levels in dev mode
    if (process.env.ELECTRON_ENABLE_LOGGING === "1" || level === "error") {
      console.log(line);
    }
  };

  return {
    debug: (msg, data) => log("debug", msg, data),
    info: (msg, data) => log("info", msg, data),
    warn: (msg, data) => log("warn", msg, data),
    error: (msg, data) => log("error", msg, data),
  };
}

/**
 * Log startup diagnostics: OS, Electron/Node/Chrome versions, PID.
 * Call once from main.ts during app initialization.
 */
export function logStartupDiagnostics(): void {
  const log = createLogger("startup");
  log.info("Bastion starting", {
    platform: process.platform,
    arch: process.arch,
    electronVersion: process.versions.electron,
    nodeVersion: process.versions.node,
    chromeVersion: process.versions.chrome,
    pid: process.pid,
  });
}

/**
 * Close the log file descriptor.
 * Call during app shutdown to release the file handle.
 */
export function closeLogger(): void {
  if (logFd !== null) {
    fs.closeSync(logFd);
    logFd = null;
  }
}

/**
 * Override the minimum log level at runtime (mainly for testing).
 */
export function setLogLevel(level: LogLevel): void {
  minLevel = level;
}
