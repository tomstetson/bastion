/**
 * SQLite storage layer for Bastion's Electron app.
 * Uses better-sqlite3 with WAL mode, busy timeout, and foreign keys.
 * All SQL uses parameterized queries — never string interpolation.
 */

import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  validateUUID,
  type GridLayout,
  type Project,
  type ResumeData,
  type Session,
  type SessionStatus,
  type Tool,
  type WindowState,
} from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_DB_PATH = path.join(os.homedir(), ".bastion", "state.db");

function requireUUID(id: string, label: string): void {
  if (!validateUUID(id)) {
    throw new Error(`Invalid UUID for ${label}: ${id}`);
  }
}

// ---------------------------------------------------------------------------
// Input option types
// ---------------------------------------------------------------------------

export interface CreateProjectOptions {
  name: string;
  path: string;
  gridLayout?: GridLayout;
  sortOrder?: number;
}

export interface UpdateProjectOptions {
  name?: string;
  path?: string;
  gridLayout?: GridLayout;
  sortOrder?: number;
}

export interface CreateSessionOptions {
  name: string;
  tool: Tool;
  command: string;
  workingDir: string;
  projectId?: string;
  worktreePath?: string;
  worktreeBranch?: string;
}

// ---------------------------------------------------------------------------
// Row types (raw SQLite rows before mapping)
// ---------------------------------------------------------------------------

interface ProjectRow {
  id: string;
  name: string;
  path: string;
  grid_layout: string;
  sort_order: number;
  created_at: number;
  updated_at: number;
}

interface SessionRow {
  id: string;
  project_id: string | null;
  name: string;
  tool: string;
  command: string;
  working_dir: string;
  status: string;
  grid_slot: number | null;
  pid: number | null;
  tool_data: string;
  worktree_path: string | null;
  worktree_branch: string | null;
  resume_data: string | null;
  created_at: number;
  updated_at: number;
}

interface WindowStateRow {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  active_project_id: string | null;
  sidebar_width: number;
}

// ---------------------------------------------------------------------------
// Row → domain object mappers
// ---------------------------------------------------------------------------

function rowToProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    path: row.path,
    gridLayout: row.grid_layout as GridLayout,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToSession(row: SessionRow): Session {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    tool: row.tool as Tool,
    command: row.command,
    workingDir: row.working_dir,
    status: row.status as SessionStatus,
    gridSlot: row.grid_slot,
    pid: row.pid,
    toolData: JSON.parse(row.tool_data) as Record<string, unknown>,
    worktreePath: row.worktree_path,
    worktreeBranch: row.worktree_branch,
    resumeData: row.resume_data
      ? (JSON.parse(row.resume_data) as ResumeData)
      : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToWindowState(row: WindowStateRow): WindowState {
  return {
    x: row.x,
    y: row.y,
    width: row.width,
    height: row.height,
    activeProjectId: row.active_project_id,
    sidebarWidth: row.sidebar_width,
  };
}

// ---------------------------------------------------------------------------
// Storage class
// ---------------------------------------------------------------------------

export class Storage {
  private db: InstanceType<typeof Database>;

  constructor(dbPath: string = DEFAULT_DB_PATH) {
    // Create parent directory with restrictive permissions
    const dir = path.dirname(dbPath);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });

    this.db = new Database(dbPath);

    // Security and performance pragmas
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("busy_timeout = 5000");
    this.db.pragma("foreign_keys = ON");

    this.createTables();
  }

  // -------------------------------------------------------------------------
  // Schema
  // -------------------------------------------------------------------------

  private createTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS metadata (
        key   TEXT PRIMARY KEY,
        value TEXT
      );

      CREATE TABLE IF NOT EXISTS projects (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        path        TEXT NOT NULL,
        grid_layout TEXT NOT NULL DEFAULT 'auto',
        sort_order  INTEGER NOT NULL DEFAULT 0,
        created_at  INTEGER NOT NULL,
        updated_at  INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id              TEXT PRIMARY KEY,
        project_id      TEXT,
        name            TEXT NOT NULL,
        tool            TEXT NOT NULL,
        command         TEXT NOT NULL,
        working_dir     TEXT NOT NULL,
        status          TEXT NOT NULL DEFAULT 'running',
        grid_slot       INTEGER,
        pid             INTEGER,
        tool_data       TEXT NOT NULL DEFAULT '{}',
        worktree_path   TEXT,
        worktree_branch TEXT,
        resume_data     TEXT,
        created_at      INTEGER NOT NULL,
        updated_at      INTEGER NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS window_state (
        id                INTEGER PRIMARY KEY CHECK (id = 1),
        x                 INTEGER NOT NULL,
        y                 INTEGER NOT NULL,
        width             INTEGER NOT NULL,
        height            INTEGER NOT NULL,
        active_project_id TEXT,
        sidebar_width     INTEGER NOT NULL
      );
    `);
  }

  // -------------------------------------------------------------------------
  // Projects
  // -------------------------------------------------------------------------

  createProject(opts: CreateProjectOptions): Project {
    const id = randomUUID();
    const now = Date.now();
    const gridLayout = opts.gridLayout ?? "auto";
    const sortOrder = opts.sortOrder ?? 0;

    this.db
      .prepare(
        `INSERT INTO projects (id, name, path, grid_layout, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, opts.name, opts.path, gridLayout, sortOrder, now, now);

    return {
      id,
      name: opts.name,
      path: opts.path,
      gridLayout,
      sortOrder,
      createdAt: now,
      updatedAt: now,
    };
  }

  getProject(id: string): Project | null {
    requireUUID(id, "projectId");
    const row = this.db
      .prepare("SELECT * FROM projects WHERE id = ?")
      .get(id) as ProjectRow | undefined;
    return row ? rowToProject(row) : null;
  }

  findProjectByPath(projectPath: string): Project | null {
    const row = this.db
      .prepare("SELECT * FROM projects WHERE path = ?")
      .get(projectPath) as ProjectRow | undefined;
    return row ? rowToProject(row) : null;
  }

  listProjects(): Project[] {
    const rows = this.db
      .prepare("SELECT * FROM projects ORDER BY sort_order ASC")
      .all() as ProjectRow[];
    return rows.map(rowToProject);
  }

  updateProject(id: string, opts: UpdateProjectOptions): void {
    requireUUID(id, "projectId");

    const sets: string[] = [];
    const params: unknown[] = [];

    if (opts.name !== undefined) {
      sets.push("name = ?");
      params.push(opts.name);
    }
    if (opts.path !== undefined) {
      sets.push("path = ?");
      params.push(opts.path);
    }
    if (opts.gridLayout !== undefined) {
      sets.push("grid_layout = ?");
      params.push(opts.gridLayout);
    }
    if (opts.sortOrder !== undefined) {
      sets.push("sort_order = ?");
      params.push(opts.sortOrder);
    }

    if (sets.length === 0) return;

    sets.push("updated_at = ?");
    params.push(Date.now());
    params.push(id);

    this.db
      .prepare(`UPDATE projects SET ${sets.join(", ")} WHERE id = ?`)
      .run(...params);
  }

  deleteProject(id: string): void {
    requireUUID(id, "projectId");
    this.db.prepare("DELETE FROM projects WHERE id = ?").run(id);
  }

  // -------------------------------------------------------------------------
  // Sessions
  // -------------------------------------------------------------------------

  createSession(opts: CreateSessionOptions): Session {
    if (opts.projectId !== undefined) {
      requireUUID(opts.projectId, "projectId");
    }

    const id = randomUUID();
    const now = Date.now();

    this.db
      .prepare(
        `INSERT INTO sessions
           (id, project_id, name, tool, command, working_dir, status,
            grid_slot, pid, tool_data, worktree_path, worktree_branch,
            resume_data, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'running', NULL, NULL, '{}', ?, ?, NULL, ?, ?)`,
      )
      .run(
        id,
        opts.projectId ?? null,
        opts.name,
        opts.tool,
        opts.command,
        opts.workingDir,
        opts.worktreePath ?? null,
        opts.worktreeBranch ?? null,
        now,
        now,
      );

    return {
      id,
      projectId: opts.projectId ?? null,
      name: opts.name,
      tool: opts.tool,
      command: opts.command,
      workingDir: opts.workingDir,
      status: "running",
      gridSlot: null,
      pid: null,
      toolData: {},
      worktreePath: opts.worktreePath ?? null,
      worktreeBranch: opts.worktreeBranch ?? null,
      resumeData: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  getSession(id: string): Session | null {
    requireUUID(id, "sessionId");
    const row = this.db
      .prepare("SELECT * FROM sessions WHERE id = ?")
      .get(id) as SessionRow | undefined;
    return row ? rowToSession(row) : null;
  }

  listSessionsByProject(projectId: string): Session[] {
    requireUUID(projectId, "projectId");
    const rows = this.db
      .prepare(
        "SELECT * FROM sessions WHERE project_id = ? ORDER BY created_at ASC",
      )
      .all(projectId) as SessionRow[];
    return rows.map(rowToSession);
  }

  listStandaloneSessions(): Session[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM sessions WHERE project_id IS NULL ORDER BY created_at ASC",
      )
      .all() as SessionRow[];
    return rows.map(rowToSession);
  }

  listAllSessions(): Session[] {
    const rows = this.db
      .prepare("SELECT * FROM sessions ORDER BY created_at ASC")
      .all() as SessionRow[];
    return rows.map(rowToSession);
  }

  listSessionsByStatus(status: SessionStatus): Session[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM sessions WHERE status = ? ORDER BY created_at ASC",
      )
      .all(status) as SessionRow[];
    return rows.map(rowToSession);
  }

  updateSessionStatus(id: string, status: SessionStatus): void {
    requireUUID(id, "sessionId");
    this.db
      .prepare("UPDATE sessions SET status = ?, updated_at = ? WHERE id = ?")
      .run(status, Date.now(), id);
  }

  updateSessionGridSlot(id: string, gridSlot: number | null): void {
    requireUUID(id, "sessionId");
    this.db
      .prepare(
        "UPDATE sessions SET grid_slot = ?, updated_at = ? WHERE id = ?",
      )
      .run(gridSlot, Date.now(), id);
  }

  updateSessionPid(id: string, pid: number | null): void {
    requireUUID(id, "sessionId");
    this.db
      .prepare("UPDATE sessions SET pid = ?, updated_at = ? WHERE id = ?")
      .run(pid, Date.now(), id);
  }

  updateSessionName(id: string, name: string): void {
    requireUUID(id, "sessionId");
    this.db
      .prepare("UPDATE sessions SET name = ?, updated_at = ? WHERE id = ?")
      .run(name, Date.now(), id);
  }

  updateSessionToolData(
    id: string,
    toolData: Record<string, unknown>,
  ): void {
    requireUUID(id, "sessionId");
    this.db
      .prepare(
        "UPDATE sessions SET tool_data = ?, updated_at = ? WHERE id = ?",
      )
      .run(JSON.stringify(toolData), Date.now(), id);
  }

  updateSessionResumeData(id: string, resumeData: ResumeData): void {
    requireUUID(id, "sessionId");
    this.db
      .prepare(
        "UPDATE sessions SET resume_data = ?, updated_at = ? WHERE id = ?",
      )
      .run(JSON.stringify(resumeData), Date.now(), id);
  }

  deleteSession(id: string): void {
    requireUUID(id, "sessionId");
    this.db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
  }

  // -------------------------------------------------------------------------
  // Window state
  // -------------------------------------------------------------------------

  saveWindowState(state: WindowState): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO window_state
           (id, x, y, width, height, active_project_id, sidebar_width)
         VALUES (1, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        state.x,
        state.y,
        state.width,
        state.height,
        state.activeProjectId,
        state.sidebarWidth,
      );
  }

  getWindowState(): WindowState | null {
    const row = this.db
      .prepare("SELECT * FROM window_state WHERE id = 1")
      .get() as WindowStateRow | undefined;
    return row ? rowToWindowState(row) : null;
  }

  // -------------------------------------------------------------------------
  // General
  // -------------------------------------------------------------------------

  close(): void {
    this.db.close();
  }
}
