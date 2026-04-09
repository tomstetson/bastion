import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Storage } from "../../electron/core/storage";
import type { WindowState } from "../../electron/core/types";

/**
 * Each test gets its own temp directory so tests are fully isolated.
 * The Storage instance creates the SQLite DB inside that directory.
 */
let tmpDir: string;
let storage: Storage;

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "bastion-test-"));
}

beforeEach(() => {
  tmpDir = makeTmpDir();
  storage = new Storage(path.join(tmpDir, "state.db"));
});

afterEach(() => {
  storage.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Projects CRUD
// ---------------------------------------------------------------------------

describe("Projects", () => {
  it("creates a project and retrieves it by id", () => {
    const p = storage.createProject({
      name: "My Project",
      path: "/home/user/code/my-project",
    });

    expect(p.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(p.name).toBe("My Project");
    expect(p.path).toBe("/home/user/code/my-project");
    expect(p.gridLayout).toBe("auto");
    expect(p.sortOrder).toBe(0);
    expect(typeof p.createdAt).toBe("number");
    expect(typeof p.updatedAt).toBe("number");

    const fetched = storage.getProject(p.id);
    expect(fetched).toEqual(p);
  });

  it("returns null for non-existent project", () => {
    expect(
      storage.getProject("00000000-0000-0000-0000-000000000000"),
    ).toBeNull();
  });

  it("finds a project by path", () => {
    const p = storage.createProject({
      name: "Path Lookup",
      path: "/unique/path/here",
    });
    const found = storage.findProjectByPath("/unique/path/here");
    expect(found).toEqual(p);
  });

  it("returns null when findProjectByPath has no match", () => {
    expect(storage.findProjectByPath("/no/such/path")).toBeNull();
  });

  it("lists projects sorted by sort_order", () => {
    const p1 = storage.createProject({ name: "C", path: "/c" });
    const p2 = storage.createProject({ name: "A", path: "/a" });
    const p3 = storage.createProject({ name: "B", path: "/b" });

    storage.updateProject(p1.id, { sortOrder: 3 });
    storage.updateProject(p2.id, { sortOrder: 1 });
    storage.updateProject(p3.id, { sortOrder: 2 });

    const list = storage.listProjects();
    expect(list).toHaveLength(3);
    expect(list[0].name).toBe("A");
    expect(list[1].name).toBe("B");
    expect(list[2].name).toBe("C");
  });

  it("updates a project", () => {
    const p = storage.createProject({ name: "Old Name", path: "/old" });
    storage.updateProject(p.id, {
      name: "New Name",
      gridLayout: "2x2",
      sortOrder: 5,
    });
    const updated = storage.getProject(p.id);
    expect(updated!.name).toBe("New Name");
    expect(updated!.gridLayout).toBe("2x2");
    expect(updated!.sortOrder).toBe(5);
    expect(updated!.updatedAt).toBeGreaterThanOrEqual(p.updatedAt);
  });

  it("deletes a project", () => {
    const p = storage.createProject({ name: "Doomed", path: "/doomed" });
    storage.deleteProject(p.id);
    expect(storage.getProject(p.id)).toBeNull();
  });

  it("cascades: deleting a project orphans sessions (sets projectId to null)", () => {
    const p = storage.createProject({
      name: "Parent",
      path: "/parent",
    });
    const s = storage.createSession({
      name: "Child",
      tool: "claude",
      command: "claude",
      workingDir: "/parent",
      projectId: p.id,
    });

    storage.deleteProject(p.id);
    const session = storage.getSession(s.id);
    expect(session).not.toBeNull();
    expect(session!.projectId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Sessions CRUD
// ---------------------------------------------------------------------------

describe("Sessions", () => {
  it("creates a session and retrieves it", () => {
    const s = storage.createSession({
      name: "Test Session",
      tool: "claude",
      command: "claude",
      workingDir: "/home/user",
    });

    expect(s.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(s.name).toBe("Test Session");
    expect(s.tool).toBe("claude");
    expect(s.command).toBe("claude");
    expect(s.workingDir).toBe("/home/user");
    expect(s.status).toBe("running");
    expect(s.projectId).toBeNull();
    expect(s.gridSlot).toBeNull();
    expect(s.pid).toBeNull();
    expect(s.toolData).toEqual({});
    expect(s.worktreePath).toBeNull();
    expect(s.worktreeBranch).toBeNull();
    expect(s.resumeData).toBeNull();

    const fetched = storage.getSession(s.id);
    expect(fetched).toEqual(s);
  });

  it("creates a session with a project FK", () => {
    const p = storage.createProject({ name: "P", path: "/p" });
    const s = storage.createSession({
      name: "S",
      tool: "gemini",
      command: "gemini",
      workingDir: "/p",
      projectId: p.id,
    });
    expect(s.projectId).toBe(p.id);
  });

  it("returns null for non-existent session", () => {
    expect(
      storage.getSession("00000000-0000-0000-0000-000000000000"),
    ).toBeNull();
  });

  it("lists sessions by project", () => {
    const p = storage.createProject({ name: "P", path: "/p" });
    storage.createSession({
      name: "S1",
      tool: "claude",
      command: "claude",
      workingDir: "/p",
      projectId: p.id,
    });
    storage.createSession({
      name: "S2",
      tool: "claude",
      command: "claude",
      workingDir: "/p",
      projectId: p.id,
    });
    // standalone session — should not appear
    storage.createSession({
      name: "Standalone",
      tool: "claude",
      command: "claude",
      workingDir: "/other",
    });

    const list = storage.listSessionsByProject(p.id);
    expect(list).toHaveLength(2);
    expect(list.every((s) => s.projectId === p.id)).toBe(true);
  });

  it("lists standalone sessions (null projectId)", () => {
    const p = storage.createProject({ name: "P", path: "/p" });
    storage.createSession({
      name: "Attached",
      tool: "claude",
      command: "claude",
      workingDir: "/p",
      projectId: p.id,
    });
    storage.createSession({
      name: "Standalone",
      tool: "claude",
      command: "claude",
      workingDir: "/other",
    });

    const list = storage.listStandaloneSessions();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("Standalone");
  });

  it("lists all sessions", () => {
    const p = storage.createProject({ name: "P", path: "/p" });
    storage.createSession({
      name: "S1",
      tool: "claude",
      command: "claude",
      workingDir: "/p",
      projectId: p.id,
    });
    storage.createSession({
      name: "S2",
      tool: "claude",
      command: "claude",
      workingDir: "/other",
    });

    expect(storage.listAllSessions()).toHaveLength(2);
  });

  it("lists sessions by status", () => {
    const s1 = storage.createSession({
      name: "S1",
      tool: "claude",
      command: "claude",
      workingDir: "/a",
    });
    storage.createSession({
      name: "S2",
      tool: "claude",
      command: "claude",
      workingDir: "/b",
    });
    storage.updateSessionStatus(s1.id, "stopped");

    const running = storage.listSessionsByStatus("running");
    expect(running).toHaveLength(1);
    expect(running[0].name).toBe("S2");

    const stopped = storage.listSessionsByStatus("stopped");
    expect(stopped).toHaveLength(1);
    expect(stopped[0].name).toBe("S1");
  });

  it("updates session status", () => {
    const s = storage.createSession({
      name: "S",
      tool: "claude",
      command: "claude",
      workingDir: "/dir",
    });
    storage.updateSessionStatus(s.id, "running");
    expect(storage.getSession(s.id)!.status).toBe("running");
  });

  it("updates session grid slot", () => {
    const s = storage.createSession({
      name: "S",
      tool: "claude",
      command: "claude",
      workingDir: "/dir",
    });
    storage.updateSessionGridSlot(s.id, 3);
    expect(storage.getSession(s.id)!.gridSlot).toBe(3);
  });

  it("updates session pid", () => {
    const s = storage.createSession({
      name: "S",
      tool: "claude",
      command: "claude",
      workingDir: "/dir",
    });
    storage.updateSessionPid(s.id, 12345);
    expect(storage.getSession(s.id)!.pid).toBe(12345);
  });

  it("updates session name", () => {
    const s = storage.createSession({
      name: "Old",
      tool: "claude",
      command: "claude",
      workingDir: "/dir",
    });
    storage.updateSessionName(s.id, "New");
    expect(storage.getSession(s.id)!.name).toBe("New");
  });

  it("updates session toolData (stored as JSON)", () => {
    const s = storage.createSession({
      name: "S",
      tool: "claude",
      command: "claude",
      workingDir: "/dir",
    });
    const data = { conversationId: "abc123", model: "opus" };
    storage.updateSessionToolData(s.id, data);
    const updated = storage.getSession(s.id);
    expect(updated!.toolData).toEqual(data);
  });

  it("updates session resumeData (stored as JSON)", () => {
    const s = storage.createSession({
      name: "S",
      tool: "claude",
      command: "claude",
      workingDir: "/dir",
    });
    const rd = {
      sessionId: s.id,
      resumeCommand: ["claude", "--resume", "abc"],
      capturedAt: Date.now(),
      toolVersion: "1.0.0",
      outputSnapshot: "some output",
    };
    storage.updateSessionResumeData(s.id, rd);
    const updated = storage.getSession(s.id);
    expect(updated!.resumeData).toEqual(rd);
  });

  it("deletes a session", () => {
    const s = storage.createSession({
      name: "Doomed",
      tool: "claude",
      command: "claude",
      workingDir: "/dir",
    });
    storage.deleteSession(s.id);
    expect(storage.getSession(s.id)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Window state
// ---------------------------------------------------------------------------

describe("Window state", () => {
  it("returns default state when none is saved", () => {
    const state = storage.getWindowState();
    expect(state).toBeNull();
  });

  it("saves and restores window state", () => {
    const ws: WindowState = {
      x: 100,
      y: 200,
      width: 1400,
      height: 900,
      activeProjectId: null,
      sidebarWidth: 240,
    };
    storage.saveWindowState(ws);
    const restored = storage.getWindowState();
    expect(restored).toEqual(ws);
  });

  it("overwrites previous window state", () => {
    storage.saveWindowState({
      x: 0,
      y: 0,
      width: 800,
      height: 600,
      activeProjectId: null,
      sidebarWidth: 200,
    });
    storage.saveWindowState({
      x: 50,
      y: 50,
      width: 1920,
      height: 1080,
      activeProjectId: null,
      sidebarWidth: 300,
    });
    const ws = storage.getWindowState();
    expect(ws!.width).toBe(1920);
    expect(ws!.sidebarWidth).toBe(300);
  });

  it("saves window state with activeProjectId", () => {
    const p = storage.createProject({ name: "P", path: "/p" });
    storage.saveWindowState({
      x: 0,
      y: 0,
      width: 800,
      height: 600,
      activeProjectId: p.id,
      sidebarWidth: 200,
    });
    expect(storage.getWindowState()!.activeProjectId).toBe(p.id);
  });
});

// ---------------------------------------------------------------------------
// UUID validation at public method boundaries
// ---------------------------------------------------------------------------

describe("UUID validation", () => {
  it("rejects invalid UUID for getProject", () => {
    expect(() => storage.getProject("not-a-uuid")).toThrow(/invalid.*uuid/i);
  });

  it("rejects invalid UUID for updateProject", () => {
    expect(() => storage.updateProject("bad", { name: "X" })).toThrow(
      /invalid.*uuid/i,
    );
  });

  it("rejects invalid UUID for deleteProject", () => {
    expect(() => storage.deleteProject("bad")).toThrow(/invalid.*uuid/i);
  });

  it("rejects invalid UUID for getSession", () => {
    expect(() => storage.getSession("bad")).toThrow(/invalid.*uuid/i);
  });

  it("rejects invalid UUID for listSessionsByProject", () => {
    expect(() => storage.listSessionsByProject("bad")).toThrow(
      /invalid.*uuid/i,
    );
  });

  it("rejects invalid UUID for updateSessionStatus", () => {
    expect(() => storage.updateSessionStatus("bad", "running")).toThrow(
      /invalid.*uuid/i,
    );
  });

  it("rejects invalid UUID for updateSessionGridSlot", () => {
    expect(() => storage.updateSessionGridSlot("bad", 0)).toThrow(
      /invalid.*uuid/i,
    );
  });

  it("rejects invalid UUID for updateSessionPid", () => {
    expect(() => storage.updateSessionPid("bad", 1)).toThrow(
      /invalid.*uuid/i,
    );
  });

  it("rejects invalid UUID for updateSessionName", () => {
    expect(() => storage.updateSessionName("bad", "X")).toThrow(
      /invalid.*uuid/i,
    );
  });

  it("rejects invalid UUID for updateSessionToolData", () => {
    expect(() => storage.updateSessionToolData("bad", {})).toThrow(
      /invalid.*uuid/i,
    );
  });

  it("rejects invalid UUID for updateSessionResumeData", () => {
    expect(() =>
      storage.updateSessionResumeData("bad", {
        sessionId: "bad",
        resumeCommand: [],
        capturedAt: 0,
        toolVersion: "",
        outputSnapshot: "",
      }),
    ).toThrow(/invalid.*uuid/i);
  });

  it("rejects invalid UUID for deleteSession", () => {
    expect(() => storage.deleteSession("bad")).toThrow(/invalid.*uuid/i);
  });

  it("rejects invalid UUID for createSession with projectId", () => {
    expect(() =>
      storage.createSession({
        name: "S",
        tool: "claude",
        command: "claude",
        workingDir: "/dir",
        projectId: "not-valid",
      }),
    ).toThrow(/invalid.*uuid/i);
  });
});

// ---------------------------------------------------------------------------
// Directory creation security
// ---------------------------------------------------------------------------

describe("Directory security", () => {
  it("creates parent directory with 0o700 permissions", () => {
    const subDir = path.join(tmpDir, "nested", "deep");
    const dbPath = path.join(subDir, "state.db");
    const s = new Storage(dbPath);
    const stat = fs.statSync(subDir);
    // mode & 0o777 gives the permission bits
    expect(stat.mode & 0o777).toBe(0o700);
    s.close();
  });
});
