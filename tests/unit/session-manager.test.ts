import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Storage } from "../../electron/core/storage";
import { PTYManager } from "../../electron/core/pty-manager";
import { StatusDetector } from "../../electron/core/status-detector";
import { ResumeManager } from "../../electron/core/resume-manager";
import { SessionManager } from "../../electron/core/session-manager";

/**
 * Helper: wrap an event listener in a promise with a timeout.
 */
function waitFor<T>(
  register: (cb: (value: T) => void) => void,
  ms = 5000,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`waitFor timed out after ${ms}ms`)),
      ms,
    );
    register((value) => {
      clearTimeout(timer);
      resolve(value);
    });
  });
}

/** Small delay for short-lived PTY processes to exit */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("SessionManager", () => {
  let tmpDir: string;
  let storage: Storage;
  let ptyManager: PTYManager;
  let statusDetector: StatusDetector;
  let resumeManager: ResumeManager;
  let manager: SessionManager;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "session-mgr-test-"));
    storage = new Storage(path.join(tmpDir, "state.db"));
    ptyManager = new PTYManager({ buffersDir: path.join(tmpDir, "buffers") });
    statusDetector = new StatusDetector();
    resumeManager = new ResumeManager();
    manager = new SessionManager({
      storage,
      ptyManager,
      statusDetector,
      resumeManager,
    });
  });

  afterEach(() => {
    manager.dispose();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ---------------------------------------------------------------------------
  // Projects
  // ---------------------------------------------------------------------------

  describe("createProject()", () => {
    it("creates a project and stores it", () => {
      const project = manager.createProject("My Project", "/tmp/my-project");
      expect(project.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(project.name).toBe("My Project");
      expect(project.path).toBe("/tmp/my-project");
      expect(project.gridLayout).toBe("auto");
    });

    it("can be retrieved after creation", () => {
      const project = manager.createProject("Fetch Test", "/tmp/fetch");
      const fetched = manager.getProject(project.id);
      expect(fetched).not.toBeNull();
      expect(fetched!.name).toBe("Fetch Test");
    });
  });

  describe("listProjects()", () => {
    it("returns all projects", () => {
      manager.createProject("A", "/a");
      manager.createProject("B", "/b");
      const list = manager.listProjects();
      expect(list).toHaveLength(2);
    });
  });

  describe("renameProject()", () => {
    it("updates the project name", () => {
      const p = manager.createProject("Old", "/old");
      manager.renameProject(p.id, "New");
      expect(manager.getProject(p.id)!.name).toBe("New");
    });
  });

  describe("setProjectLayout()", () => {
    it("updates the project grid layout", () => {
      const p = manager.createProject("Layout", "/layout");
      manager.setProjectLayout(p.id, "2x2");
      expect(manager.getProject(p.id)!.gridLayout).toBe("2x2");
    });
  });

  describe("deleteProject()", () => {
    it("removes the project from storage", () => {
      const p = manager.createProject("Doomed", "/doomed");
      manager.deleteProject(p.id);
      expect(manager.getProject(p.id)).toBeNull();
    });

    it("stops all project sessions before deleting", async () => {
      const p = manager.createProject("Parent", tmpDir);
      const s = manager.createSession({
        tool: "shell",
        workingDir: tmpDir,
        projectId: p.id,
      });

      // Verify session is running
      expect(manager.getSession(s.id)!.status).toBe("running");

      manager.deleteProject(p.id);

      // Session should be stopped (orphaned with null projectId due to FK cascade)
      const session = manager.getSession(s.id);
      expect(session).not.toBeNull();
      expect(session!.status).toBe("stopped");
    });
  });

  // ---------------------------------------------------------------------------
  // Session creation
  // ---------------------------------------------------------------------------

  describe("createSession()", () => {
    it("creates a standalone session with auto-generated name", () => {
      const session = manager.createSession({
        tool: "shell",
        workingDir: tmpDir,
      });

      expect(session.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      // Auto-generated name should be adjective-animal pattern
      expect(session.name).toMatch(/^[a-z]+-[a-z]+$/);
      expect(session.tool).toBe("shell");
      expect(session.status).toBe("running");
      expect(session.projectId).toBeNull();
      expect(session.pid).toBeGreaterThan(0);
    });

    it("creates a session with explicit name", () => {
      const session = manager.createSession({
        name: "My Shell",
        tool: "shell",
        workingDir: tmpDir,
      });
      expect(session.name).toBe("My Shell");
    });

    it("creates a session in a project with auto grid slot", () => {
      const p = manager.createProject("Grid Test", tmpDir);
      const s1 = manager.createSession({
        tool: "shell",
        workingDir: tmpDir,
        projectId: p.id,
      });
      const s2 = manager.createSession({
        tool: "shell",
        workingDir: tmpDir,
        projectId: p.id,
      });

      expect(s1.projectId).toBe(p.id);
      expect(s1.gridSlot).toBe(0);
      expect(s2.gridSlot).toBe(1);
    });

    it("auto-detects project from workingDir", () => {
      const p = manager.createProject("Auto Detect", tmpDir);
      const s = manager.createSession({
        tool: "shell",
        workingDir: tmpDir,
      });
      // Should auto-detect the project via storage.findProjectByPath
      expect(s.projectId).toBe(p.id);
    });

    it("tracks activity timestamps via PTY data events", async () => {
      const session = manager.createSession({
        tool: "shell",
        workingDir: tmpDir,
        command: "/bin/echo hello",
      });

      // Wait a bit for some data to come through
      await delay(200);

      // lastActivity should have been updated from data events
      const lastActivity = manager.getLastActivity(session.id);
      expect(lastActivity).toBeGreaterThan(0);
    });

    it("handles PTY exit by marking session stopped", async () => {
      const session = manager.createSession({
        tool: "shell",
        workingDir: tmpDir,
        command: "/bin/echo done",
      });

      // /bin/echo exits quickly — wait for it
      await delay(500);

      const updated = manager.getSession(session.id);
      expect(updated!.status).toBe("stopped");
    });
  });

  // ---------------------------------------------------------------------------
  // Session listing
  // ---------------------------------------------------------------------------

  describe("listing methods", () => {
    it("listSessionsByProject returns only that project's sessions", () => {
      const p = manager.createProject("P", tmpDir);
      manager.createSession({
        tool: "shell",
        workingDir: tmpDir,
        projectId: p.id,
      });
      // Standalone session (use a different dir so auto-detect doesn't kick in)
      const otherDir = fs.mkdtempSync(path.join(os.tmpdir(), "session-other-"));
      manager.createSession({
        tool: "shell",
        workingDir: otherDir,
      });

      const projectSessions = manager.listSessionsByProject(p.id);
      expect(projectSessions).toHaveLength(1);
      expect(projectSessions[0].projectId).toBe(p.id);

      // Clean up otherDir
      fs.rmSync(otherDir, { recursive: true, force: true });
    });

    it("listStandaloneSessions returns sessions without a project", () => {
      const p = manager.createProject("P", tmpDir);
      manager.createSession({
        tool: "shell",
        workingDir: tmpDir,
        projectId: p.id,
      });
      const otherDir = fs.mkdtempSync(path.join(os.tmpdir(), "session-standalone-"));
      manager.createSession({
        tool: "shell",
        workingDir: otherDir,
      });

      const standalone = manager.listStandaloneSessions();
      expect(standalone).toHaveLength(1);
      expect(standalone[0].projectId).toBeNull();

      fs.rmSync(otherDir, { recursive: true, force: true });
    });

    it("listAllSessions returns everything", () => {
      const p = manager.createProject("P", tmpDir);
      manager.createSession({
        tool: "shell",
        workingDir: tmpDir,
        projectId: p.id,
      });
      const otherDir = fs.mkdtempSync(path.join(os.tmpdir(), "session-all-"));
      manager.createSession({
        tool: "shell",
        workingDir: otherDir,
      });

      expect(manager.listAllSessions()).toHaveLength(2);

      fs.rmSync(otherDir, { recursive: true, force: true });
    });

    it("listSessionsByStatus filters correctly", async () => {
      const s1 = manager.createSession({
        tool: "shell",
        workingDir: tmpDir,
        command: "/bin/cat",
      });
      const s2 = manager.createSession({
        tool: "shell",
        workingDir: tmpDir,
        command: "/bin/echo bye",
      });

      // Wait for echo to exit
      await delay(500);

      const running = manager.listSessionsByStatus("running");
      const stopped = manager.listSessionsByStatus("stopped");

      // s1 (cat) should still be running; s2 (echo) should be stopped
      expect(running.some((s) => s.id === s1.id)).toBe(true);
      expect(stopped.some((s) => s.id === s2.id)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Stop session
  // ---------------------------------------------------------------------------

  describe("stopSession()", () => {
    it("marks session as stopped and disposes PTY", () => {
      const session = manager.createSession({
        tool: "shell",
        workingDir: tmpDir,
        command: "/bin/cat",
      });

      expect(manager.getSession(session.id)!.status).toBe("running");

      manager.stopSession(session.id);

      const updated = manager.getSession(session.id);
      expect(updated!.status).toBe("stopped");
    });

    it("is idempotent — stopping an already stopped session does not throw", async () => {
      const session = manager.createSession({
        tool: "shell",
        workingDir: tmpDir,
        command: "/bin/echo x",
      });

      await delay(300);
      // Already stopped via exit handler
      expect(() => manager.stopSession(session.id)).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // Restart session
  // ---------------------------------------------------------------------------

  describe("restartSession()", () => {
    it("spawns a new PTY with fresh status", () => {
      const session = manager.createSession({
        tool: "shell",
        workingDir: tmpDir,
        command: "/bin/cat",
      });

      manager.stopSession(session.id);
      expect(manager.getSession(session.id)!.status).toBe("stopped");

      const restarted = manager.restartSession(session.id);
      expect(restarted.status).toBe("running");
      expect(restarted.pid).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Delete session
  // ---------------------------------------------------------------------------

  describe("deleteSession()", () => {
    it("disposes PTY and removes from storage", () => {
      const session = manager.createSession({
        tool: "shell",
        workingDir: tmpDir,
        command: "/bin/cat",
      });

      manager.deleteSession(session.id);
      expect(manager.getSession(session.id)).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Rename session
  // ---------------------------------------------------------------------------

  describe("renameSession()", () => {
    it("updates the session name", () => {
      const session = manager.createSession({
        tool: "shell",
        workingDir: tmpDir,
      });

      manager.renameSession(session.id, "Renamed");
      expect(manager.getSession(session.id)!.name).toBe("Renamed");
    });
  });

  // ---------------------------------------------------------------------------
  // Set grid slot
  // ---------------------------------------------------------------------------

  describe("setGridSlot()", () => {
    it("updates the session grid slot", () => {
      const session = manager.createSession({
        tool: "shell",
        workingDir: tmpDir,
      });

      manager.setGridSlot(session.id, 4);
      expect(manager.getSession(session.id)!.gridSlot).toBe(4);
    });

    it("clears grid slot with null", () => {
      const session = manager.createSession({
        tool: "shell",
        workingDir: tmpDir,
      });

      manager.setGridSlot(session.id, 3);
      manager.setGridSlot(session.id, null);
      expect(manager.getSession(session.id)!.gridSlot).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Name generation
  // ---------------------------------------------------------------------------

  describe("generateName()", () => {
    it("returns an adjective-animal string", () => {
      const name = manager.generateName();
      expect(name).toMatch(/^[a-z]+-[a-z]+$/);
    });

    it("generates different names (statistical — not guaranteed)", () => {
      const names = new Set<string>();
      for (let i = 0; i < 10; i++) {
        names.add(manager.generateName());
      }
      // With 20 adjectives * 20 animals = 400 combos, 10 draws should have variety
      expect(names.size).toBeGreaterThan(1);
    });
  });

  // ---------------------------------------------------------------------------
  // buildCommandArgs
  // ---------------------------------------------------------------------------

  describe("buildCommandArgs()", () => {
    it("returns empty args for shell tool", () => {
      const args = manager.buildCommandArgs("shell", {});
      expect(args).toEqual([]);
    });

    it("returns empty args for claude tool in new session mode", () => {
      const args = manager.buildCommandArgs("claude", {
        claudeOptions: { sessionMode: "new" },
      });
      expect(args).toEqual([]);
    });

    it("returns resume args for claude tool in resume mode", () => {
      const args = manager.buildCommandArgs("claude", {
        claudeOptions: { sessionMode: "resume", resumeSessionId: "abc-123" },
      });
      expect(args).toEqual(["--resume", "abc-123"]);
    });

    it("includes --dangerously-skip-permissions when set", () => {
      const args = manager.buildCommandArgs("claude", {
        claudeOptions: { sessionMode: "new", skipPermissions: true },
      });
      expect(args).toContain("--dangerously-skip-permissions");
    });
  });

  // ---------------------------------------------------------------------------
  // Status refresh
  // ---------------------------------------------------------------------------

  describe("status refresh", () => {
    it("startStatusRefresh / stopStatusRefresh lifecycle", () => {
      // Should not throw
      manager.startStatusRefresh(5000);
      manager.stopStatusRefresh();
    });

    it("refreshAllStatuses updates session statuses", async () => {
      // Create a long-running session
      manager.createSession({
        tool: "shell",
        workingDir: tmpDir,
        command: "/bin/cat",
      });

      // Should not throw
      await manager.refreshAllStatuses();
    });
  });

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  describe("flushAndClose()", () => {
    it("captures state and disposes all sessions", () => {
      manager.createSession({
        tool: "shell",
        workingDir: tmpDir,
        command: "/bin/cat",
      });
      manager.createSession({
        tool: "shell",
        workingDir: tmpDir,
        command: "/bin/cat",
      });

      // Should not throw
      manager.flushAndClose();

      // All sessions should be stopped
      const sessions = manager.listAllSessions();
      expect(sessions.every((s) => s.status === "stopped")).toBe(true);
    });
  });

  describe("dispose()", () => {
    it("cleans up all resources", () => {
      manager.createSession({
        tool: "shell",
        workingDir: tmpDir,
        command: "/bin/cat",
      });

      // Should not throw (afterEach also calls dispose — ensure idempotent)
      manager.dispose();
      manager.dispose();
    });
  });
});
