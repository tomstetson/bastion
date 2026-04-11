/**
 * Session Manager — orchestrates session lifecycle with PTY processes.
 *
 * Coordinates between Storage (persistence), PTYManager (terminals),
 * StatusDetector (status heuristics), and ResumeManager (session resumption).
 * All dependencies are injected via constructor for testability.
 *
 * Responsibilities:
 * - Project CRUD with session lifecycle awareness
 * - Session create/stop/restart/resume/delete with PTY management
 * - Automatic grid slot assignment for project sessions
 * - Periodic status refresh via terminal output analysis
 * - Graceful shutdown with resume data capture
 */

import { randomUUID } from "node:crypto";

import { createLogger } from "./logger";
import type { Storage } from "./storage";

const log = createLogger("session-manager");
import type { PTYManager } from "./pty-manager";
import type { StatusDetector } from "./status-detector";
import type { ResumeManager } from "./resume-manager";
import {
  getToolCommand,
  type ClaudeOptions,
  type GridLayout,
  type Project,
  type Session,
  type SessionCreateOptions,
  type SessionStatus,
  type Tool,
} from "./types";

// ---------------------------------------------------------------------------
// Dependency interface
// ---------------------------------------------------------------------------

export interface SessionManagerDeps {
  storage: Storage;
  ptyManager: PTYManager;
  statusDetector: StatusDetector;
  resumeManager: ResumeManager;
}

// ---------------------------------------------------------------------------
// Name generation word lists
// ---------------------------------------------------------------------------

const ADJECTIVES = [
  "bold", "brave", "calm", "cool", "dark",
  "fast", "glad", "keen", "kind", "neat",
  "nice", "pure", "safe", "slim", "soft",
  "sure", "warm", "wild", "wise", "wry",
];

const ANIMALS = [
  "bear", "crow", "deer", "dove", "duck",
  "fawn", "fish", "fox", "frog", "hawk",
  "hare", "ibis", "lynx", "mink", "moth",
  "newt", "owl", "puma", "seal", "wren",
];

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum number of grid slots per project (6-panel grid: 0..5) */
const MAX_GRID_SLOTS = 6;

/** Default terminal dimensions for spawned PTY sessions */
const DEFAULT_COLS = 120;
const DEFAULT_ROWS = 30;

/** Number of recent output lines to feed to StatusDetector */
const STATUS_CHECK_LINES = 10;

// ---------------------------------------------------------------------------
// SessionManager
// ---------------------------------------------------------------------------

export class SessionManager {
  private storage: Storage;
  private ptyManager: PTYManager;
  private statusDetector: StatusDetector;
  private resumeManager: ResumeManager;

  /** Tracks the last time each session received PTY data (ms timestamp) */
  private lastActivityMap = new Map<string, number>();

  /** Tracks bytes written per session since last status refresh */
  private bytesAtLastRefresh = new Map<string, number>();

  /** Interval handle for periodic status refresh */
  private refreshInterval: ReturnType<typeof setInterval> | null = null;

  /** Whether dispose() has already been called */
  private disposed = false;

  constructor(deps: SessionManagerDeps) {
    this.storage = deps.storage;
    this.ptyManager = deps.ptyManager;
    this.statusDetector = deps.statusDetector;
    this.resumeManager = deps.resumeManager;
  }

  // -------------------------------------------------------------------------
  // Projects
  // -------------------------------------------------------------------------

  createProject(name: string, projectPath: string): Project {
    return this.storage.createProject({ name, path: projectPath });
  }

  getProject(id: string): Project | null {
    return this.storage.getProject(id);
  }

  listProjects(): Project[] {
    return this.storage.listProjects();
  }

  renameProject(id: string, name: string): void {
    this.storage.updateProject(id, { name });
  }

  setProjectLayout(id: string, layout: GridLayout): void {
    this.storage.updateProject(id, { gridLayout: layout });
  }

  /**
   * Delete a project. Stops all running sessions in the project first,
   * then removes the project from storage. Sessions become orphaned
   * (projectId set to null by FK cascade).
   */
  deleteProject(id: string): void {
    // Stop all sessions belonging to this project
    const sessions = this.storage.listSessionsByProject(id);
    for (const session of sessions) {
      if (session.status !== "stopped") {
        this.stopSession(session.id);
      }
    }
    this.storage.deleteProject(id);
  }

  // -------------------------------------------------------------------------
  // Sessions
  // -------------------------------------------------------------------------

  /**
   * Create a new session, spawn its PTY, and wire up event handlers.
   *
   * - Auto-generates name if not provided (adjective-animal)
   * - Auto-detects project from workingDir if projectId not given
   * - Finds next available grid slot for project sessions
   */
  createSession(options: SessionCreateOptions): Session {
    const name = options.name || this.generateName();
    const tool = options.tool;
    const workingDir = options.workingDir;

    // Auto-detect project from workingDir if not explicitly provided
    let projectId = options.projectId ?? null;
    if (!projectId) {
      const project = this.storage.findProjectByPath(workingDir);
      if (project) {
        projectId = project.id;
      }
    }

    // Build command
    const command = options.command || getToolCommand(tool);
    const args = this.buildCommandArgs(tool, options);

    // Create storage record
    const session = this.storage.createSession({
      name,
      tool,
      command,
      workingDir,
      projectId: projectId ?? undefined,
      worktreeBranch: options.worktreeBranch,
    });

    // Auto-assign grid slot for project sessions
    if (projectId) {
      const slot = this.findNextGridSlot(projectId);
      if (slot !== null) {
        this.storage.updateSessionGridSlot(session.id, slot);
        session.gridSlot = slot;
      }
    }

    // Spawn PTY
    const spawnResult = this.ptyManager.spawn(session.id, {
      command,
      args,
      cwd: workingDir,
      cols: DEFAULT_COLS,
      rows: DEFAULT_ROWS,
    });

    // Update PID in storage
    this.storage.updateSessionPid(session.id, spawnResult.pid);
    session.pid = spawnResult.pid;

    log.info("Session created", { id: session.id, name, tool, pid: spawnResult.pid });

    // Wire activity tracking
    this.lastActivityMap.set(session.id, Date.now());
    this.ptyManager.onData(session.id, () => {
      this.lastActivityMap.set(session.id, Date.now());
    });

    // Wire exit handler — mark stopped and capture resume data
    this.ptyManager.onExit(session.id, () => {
      this.handleSessionExit(session.id);
    });

    return session;
  }

  getSession(id: string): Session | null {
    return this.storage.getSession(id);
  }

  listSessionsByProject(projectId: string): Session[] {
    return this.storage.listSessionsByProject(projectId);
  }

  listStandaloneSessions(): Session[] {
    return this.storage.listStandaloneSessions();
  }

  listAllSessions(): Session[] {
    return this.storage.listAllSessions();
  }

  listSessionsByStatus(status: SessionStatus): Session[] {
    return this.storage.listSessionsByStatus(status);
  }

  /**
   * Stop a session: capture resume data, dispose PTY, mark stopped.
   * Idempotent — safe to call on an already-stopped session.
   */
  stopSession(id: string): void {
    const session = this.storage.getSession(id);
    if (!session) return;

    // Already stopped — nothing to do
    if (session.status === "stopped") return;

    log.info("Stopping session", { id, name: session.name });
    this.captureResumeDataForSession(session);
    this.disposePTYSafe(id);
    this.storage.updateSessionStatus(id, "stopped");
    this.storage.updateSessionPid(id, null);
  }

  /**
   * Restart a session: kills existing PTY, spawns a new one, resets status.
   */
  restartSession(id: string): Session {
    const session = this.storage.getSession(id);
    if (!session) {
      throw new Error(`Session "${id}" not found`);
    }

    log.info("Restarting session", { id, name: session.name });
    // Kill existing PTY if any
    this.disposePTYSafe(id);

    // Build args from session's stored tool/options
    const args = this.buildCommandArgs(session.tool, {});

    // Spawn new PTY
    const spawnResult = this.ptyManager.spawn(id, {
      command: session.command,
      args,
      cwd: session.workingDir,
      cols: DEFAULT_COLS,
      rows: DEFAULT_ROWS,
    });

    // Update storage
    this.storage.updateSessionStatus(id, "running");
    this.storage.updateSessionPid(id, spawnResult.pid);

    // Re-wire activity tracking
    this.lastActivityMap.set(id, Date.now());
    this.ptyManager.onData(id, () => {
      this.lastActivityMap.set(id, Date.now());
    });

    // Re-wire exit handler
    this.ptyManager.onExit(id, () => {
      this.handleSessionExit(id);
    });

    return this.storage.getSession(id)!;
  }

  /**
   * Resume a stopped session using its stored resume data.
   * Returns the resumed session or null if resume data is invalid.
   */
  resumeSession(id: string): Session | null {
    const session = this.storage.getSession(id);
    if (!session) return null;
    if (!session.resumeData) return null;

    log.info("Resuming session", { id, name: session.name });

    // Validate resume data
    if (!this.resumeManager.isResumeValid(session.resumeData)) {
      return null;
    }

    // Kill existing PTY if somehow still alive
    this.disposePTYSafe(id);

    // Use the resume command from stored data
    const resumeCmd = session.resumeData.resumeCommand;
    const command = resumeCmd[0];
    const args = resumeCmd.slice(1);

    const spawnResult = this.ptyManager.spawn(id, {
      command,
      args,
      cwd: session.workingDir,
      cols: DEFAULT_COLS,
      rows: DEFAULT_ROWS,
    });

    this.storage.updateSessionStatus(id, "running");
    this.storage.updateSessionPid(id, spawnResult.pid);

    // Re-wire activity tracking and exit handler
    this.lastActivityMap.set(id, Date.now());
    this.ptyManager.onData(id, () => {
      this.lastActivityMap.set(id, Date.now());
    });
    this.ptyManager.onExit(id, () => {
      this.handleSessionExit(id);
    });

    return this.storage.getSession(id)!;
  }

  /**
   * Delete a session: dispose PTY, remove from storage entirely.
   */
  deleteSession(id: string): void {
    log.info("Deleting session", { id });
    this.disposePTYSafe(id);
    this.lastActivityMap.delete(id);
    this.bytesAtLastRefresh.delete(id);
    this.storage.deleteSession(id);
  }

  renameSession(id: string, name: string): void {
    this.storage.updateSessionName(id, name);
  }

  setGridSlot(id: string, slot: number | null): void {
    this.storage.updateSessionGridSlot(id, slot);
  }

  // -------------------------------------------------------------------------
  // Activity tracking
  // -------------------------------------------------------------------------

  /** Get the last activity timestamp for a session. */
  getLastActivity(id: string): number {
    return this.lastActivityMap.get(id) ?? 0;
  }

  // -------------------------------------------------------------------------
  // Status refresh
  // -------------------------------------------------------------------------

  /**
   * Start a periodic status refresh loop.
   * Checks each non-stopped session's terminal output and updates status.
   */
  startStatusRefresh(intervalMs = 2000): void {
    this.stopStatusRefresh();
    this.refreshInterval = setInterval(() => {
      this.refreshAllStatuses();
    }, intervalMs);
  }

  /** Stop the periodic status refresh loop. */
  stopStatusRefresh(): void {
    if (this.refreshInterval !== null) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  /**
   * Refresh the status of all active (non-stopped) sessions.
   * For each session: checks if PTY is alive, analyzes output,
   * computes activity metrics, and updates status via StatusDetector.
   */
  async refreshAllStatuses(): Promise<void> {
    const sessions = this.storage.listAllSessions();

    for (const session of sessions) {
      if (session.status === "stopped") continue;

      try {
        // Check if PTY still exists for this session
        const alive = this.isPTYAlive(session.id);

        if (!alive) {
          // PTY gone — mark stopped (we already skipped stopped sessions above)
          this.storage.updateSessionStatus(session.id, "stopped");
          continue;
        }

        // Get recent output for pattern analysis
        const lastLines = this.ptyManager.getLastLines(
          session.id,
          STATUS_CHECK_LINES,
        );

        // Compute bytes per second since last refresh
        const buffer = this.ptyManager.getBuffer(session.id);
        const currentBytes = buffer.bytesWritten;
        const previousBytes = this.bytesAtLastRefresh.get(session.id) ?? 0;
        const bytesPerSecond = currentBytes - previousBytes; // Rough — 1 refresh cycle
        this.bytesAtLastRefresh.set(session.id, currentBytes);

        // Compute time since last activity
        const lastActivity = this.lastActivityMap.get(session.id);
        const msSinceLastActivity = lastActivity
          ? Date.now() - lastActivity
          : undefined;

        // Detect new status
        const newStatus = this.statusDetector.detect(
          session.tool,
          lastLines,
          bytesPerSecond,
          msSinceLastActivity,
        );

        // Only update storage if status actually changed
        if (newStatus !== session.status) {
          this.storage.updateSessionStatus(session.id, newStatus);
        }
      } catch {
        // If PTY is gone or buffer inaccessible, mark stopped
        // (we already skipped stopped sessions at the top of the loop)
        this.storage.updateSessionStatus(session.id, "stopped");
      }
    }
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Graceful shutdown: capture resume data for all running sessions,
   * flush buffers to disk, then dispose all PTYs.
   */
  flushAndClose(): void {
    const sessions = this.storage.listAllSessions();

    for (const session of sessions) {
      if (session.status !== "stopped") {
        this.captureResumeDataForSession(session);
        this.storage.updateSessionStatus(session.id, "stopped");
        this.storage.updateSessionPid(session.id, null);
      }
    }

    this.ptyManager.flushAllBuffers();
    this.ptyManager.disposeAll();
  }

  /**
   * Hard cleanup: stop refresh, dispose all PTYs, close storage.
   * Idempotent — safe to call multiple times.
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    this.stopStatusRefresh();
    this.ptyManager.disposeAll();
    this.lastActivityMap.clear();
    this.bytesAtLastRefresh.clear();
    this.storage.close();
  }

  // -------------------------------------------------------------------------
  // Public helpers
  // -------------------------------------------------------------------------

  /** Generate a random adjective-animal name. */
  generateName(): string {
    const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
    return `${adj}-${animal}`;
  }

  /**
   * Build command-line arguments for a tool.
   * Currently only Claude has special arg handling (resume, skip-permissions).
   */
  buildCommandArgs(
    tool: Tool,
    options: { claudeOptions?: ClaudeOptions },
  ): string[] {
    if (tool !== "claude" || !options.claudeOptions) {
      return [];
    }

    const args: string[] = [];
    const opts = options.claudeOptions;

    if (opts.sessionMode === "resume" && opts.resumeSessionId) {
      args.push("--resume", opts.resumeSessionId);
    }

    if (opts.skipPermissions) {
      args.push("--dangerously-skip-permissions");
    }

    return args;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Handle a PTY process exit: mark session stopped, capture resume data.
   * Called from the PTY onExit listener.
   */
  private handleSessionExit(sessionId: string): void {
    const session = this.storage.getSession(sessionId);
    if (!session) return;

    if (session.status !== "stopped") {
      this.captureResumeDataForSession(session);
      this.storage.updateSessionStatus(sessionId, "stopped");
      this.storage.updateSessionPid(sessionId, null);
    }
  }

  /**
   * Attempt to capture resume data for a session.
   * Only succeeds for tools that support resumption (currently only Claude).
   */
  private captureResumeDataForSession(session: Session): void {
    try {
      const lastLines = this.ptyManager.getLastLines(session.id, 100);
      const toolSessionId =
        (session.toolData?.claudeSessionId as string) ?? null;

      const resumeData = this.resumeManager.captureResumeData(session.tool, {
        toolSessionId,
        lastLines,
        toolVersion: (session.toolData?.toolVersion as string) ?? "unknown",
      });

      if (resumeData) {
        this.storage.updateSessionResumeData(session.id, resumeData);
      }
    } catch {
      // PTY may already be gone — resume capture is best-effort
    }
  }

  /**
   * Dispose a PTY session, catching errors if it's already gone.
   */
  private disposePTYSafe(sessionId: string): void {
    try {
      this.ptyManager.dispose(sessionId);
    } catch {
      // Already disposed or never spawned — that's fine
    }
  }

  /**
   * Check if a PTY session is still alive, returning false if the session
   * doesn't exist in the PTY manager.
   */
  private isPTYAlive(sessionId: string): boolean {
    try {
      return this.ptyManager.isAlive(sessionId);
    } catch {
      return false;
    }
  }

  /**
   * Find the next available grid slot (0..5) for a project.
   * Returns null if all slots are occupied.
   */
  private findNextGridSlot(projectId: string): number | null {
    const sessions = this.storage.listSessionsByProject(projectId);
    const usedSlots = new Set(
      sessions
        .filter((s) => s.gridSlot !== null)
        .map((s) => s.gridSlot!),
    );

    for (let i = 0; i < MAX_GRID_SLOTS; i++) {
      if (!usedSlots.has(i)) return i;
    }
    return null;
  }
}
