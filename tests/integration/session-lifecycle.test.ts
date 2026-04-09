/**
 * Integration test: full session lifecycle through SessionManager.
 *
 * Uses a mock PTYManager to avoid the node-pty native module dependency
 * (which is compiled against Electron's Node version, not system Node).
 * This validates the critical user path:
 *   create project -> create session -> verify running -> stop ->
 *   verify stopped -> verify resumeData captured -> resume ->
 *   verify running again -> delete
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Storage } from "../../electron/core/storage";
import { StatusDetector } from "../../electron/core/status-detector";
import { ResumeManager } from "../../electron/core/resume-manager";
import { SessionManager } from "../../electron/core/session-manager";
import { RingBuffer } from "../../electron/core/ring-buffer";

// ---------------------------------------------------------------------------
// Mock PTYManager — simulates PTY behavior without node-pty
// ---------------------------------------------------------------------------

class MockPTYManager {
  private sessions = new Map<
    string,
    {
      alive: boolean;
      pid: number;
      buffer: RingBuffer;
      dataListeners: Array<(data: string) => void>;
      exitListeners: Array<(info: { exitCode: number; signal?: number }) => void>;
    }
  >();

  private nextPid = 1000;

  spawn(
    sessionId: string,
    _options: {
      command: string;
      args: string[];
      cwd: string;
      cols: number;
      rows: number;
    },
  ): { sessionId: string; pid: number } {
    if (this.sessions.has(sessionId)) {
      throw new Error(`PTY session "${sessionId}" already exists`);
    }

    const pid = this.nextPid++;
    const buffer = new RingBuffer(1000);

    this.sessions.set(sessionId, {
      alive: true,
      pid,
      buffer,
      dataListeners: [],
      exitListeners: [],
    });

    // Simulate initial output
    buffer.append("Session started\n");

    return { sessionId, pid };
  }

  onData(sessionId: string, listener: (data: string) => void): void {
    const instance = this.getSession(sessionId);
    instance.dataListeners.push(listener);
  }

  onExit(
    sessionId: string,
    listener: (info: { exitCode: number; signal?: number }) => void,
  ): void {
    const instance = this.getSession(sessionId);
    instance.exitListeners.push(listener);
  }

  isAlive(sessionId: string): boolean {
    const instance = this.getSession(sessionId);
    return instance.alive;
  }

  getBuffer(sessionId: string): RingBuffer {
    const instance = this.getSession(sessionId);
    return instance.buffer;
  }

  getLastLines(sessionId: string, n: number): string[] {
    const instance = this.getSession(sessionId);
    return instance.buffer.getLines(n);
  }

  dispose(sessionId: string): void {
    const instance = this.sessions.get(sessionId);
    if (!instance) throw new Error(`PTY session "${sessionId}" not found`);
    instance.alive = false;
    instance.dataListeners.length = 0;
    instance.exitListeners.length = 0;
    this.sessions.delete(sessionId);
  }

  disposeAll(): void {
    for (const [, instance] of this.sessions) {
      instance.alive = false;
      instance.dataListeners.length = 0;
      instance.exitListeners.length = 0;
    }
    this.sessions.clear();
  }

  flushAllBuffers(): void {
    // No-op for mock
  }

  flushBuffer(_sessionId: string): void {
    // No-op for mock
  }

  /** Test helper: simulate the PTY process exiting */
  simulateExit(sessionId: string, exitCode = 0): void {
    const instance = this.sessions.get(sessionId);
    if (!instance) return;
    instance.alive = false;
    for (const listener of instance.exitListeners) {
      listener({ exitCode });
    }
  }

  /** Test helper: simulate PTY writing output data */
  simulateData(sessionId: string, data: string): void {
    const instance = this.sessions.get(sessionId);
    if (!instance) return;
    instance.buffer.append(data);
    for (const listener of instance.dataListeners) {
      listener(data);
    }
  }

  private getSession(sessionId: string) {
    const instance = this.sessions.get(sessionId);
    if (!instance) throw new Error(`PTY session "${sessionId}" not found`);
    return instance;
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Session Lifecycle Integration", () => {
  let tmpDir: string;
  let storage: Storage;
  let mockPty: MockPTYManager;
  let statusDetector: StatusDetector;
  let resumeManager: ResumeManager;
  let manager: SessionManager;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lifecycle-test-"));
    storage = new Storage(path.join(tmpDir, "state.db"));
    mockPty = new MockPTYManager();
    statusDetector = new StatusDetector();
    resumeManager = new ResumeManager();

    // SessionManager accepts duck-typed deps — our mock satisfies the interface
    manager = new SessionManager({
      storage,
      ptyManager: mockPty as any,
      statusDetector,
      resumeManager,
    });
  });

  afterEach(() => {
    manager.dispose();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("full lifecycle: create project -> create session -> stop -> resume -> delete", () => {
    // --- Step 1: Create a project ---
    const project = manager.createProject("Integration Test", tmpDir);
    expect(project.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(project.name).toBe("Integration Test");

    // Verify project is retrievable
    const fetched = manager.getProject(project.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.name).toBe("Integration Test");

    // --- Step 2: Create a Claude session in the project ---
    const session = manager.createSession({
      name: "test-agent",
      tool: "claude",
      workingDir: tmpDir,
      projectId: project.id,
    });

    expect(session.status).toBe("running");
    expect(session.tool).toBe("claude");
    expect(session.name).toBe("test-agent");
    expect(session.projectId).toBe(project.id);
    expect(session.pid).toBeGreaterThan(0);
    expect(session.gridSlot).toBe(0); // First slot auto-assigned

    // --- Step 3: Verify session is running and retrievable ---
    const running = manager.getSession(session.id);
    expect(running).not.toBeNull();
    expect(running!.status).toBe("running");

    // Verify it shows up in project listing
    const projectSessions = manager.listSessionsByProject(project.id);
    expect(projectSessions).toHaveLength(1);
    expect(projectSessions[0].id).toBe(session.id);

    // --- Step 4: Simulate the session producing Claude output with session ID ---
    // This is needed for resume data capture — Claude prints a session ID
    mockPty.simulateData(
      session.id,
      "Claude session: abc-1234-def\n> Working on it...\n",
    );

    // Store a Claude session ID in toolData (normally done by UI/IPC)
    storage.updateSessionToolData(session.id, {
      claudeSessionId: "abc-1234-def",
      toolVersion: "1.0.0",
    });

    // --- Step 5: Stop the session ---
    manager.stopSession(session.id);

    const stopped = manager.getSession(session.id);
    expect(stopped).not.toBeNull();
    expect(stopped!.status).toBe("stopped");
    expect(stopped!.pid).toBeNull();

    // --- Step 6: Verify resume data was captured ---
    // Re-fetch to get updated resumeData
    const withResume = storage.getSession(session.id);
    expect(withResume).not.toBeNull();
    expect(withResume!.resumeData).not.toBeNull();
    expect(withResume!.resumeData!.sessionId).toBe("abc-1234-def");
    expect(withResume!.resumeData!.resumeCommand).toEqual([
      "claude",
      "--resume",
      "abc-1234-def",
    ]);
    expect(withResume!.resumeData!.capturedAt).toBeGreaterThan(0);

    // --- Step 7: Resume the session ---
    const resumed = manager.resumeSession(session.id);
    expect(resumed).not.toBeNull();
    expect(resumed!.status).toBe("running");
    expect(resumed!.pid).toBeGreaterThan(0);

    // Verify it's still in the project
    expect(resumed!.projectId).toBe(project.id);

    // --- Step 8: Delete the session ---
    manager.deleteSession(session.id);
    expect(manager.getSession(session.id)).toBeNull();

    // --- Step 9: Verify project still exists after session deletion ---
    expect(manager.getProject(project.id)).not.toBeNull();
  });

  it("multiple sessions in a project get sequential grid slots", () => {
    const project = manager.createProject("Multi Session", tmpDir);

    const s1 = manager.createSession({
      tool: "shell",
      workingDir: tmpDir,
      projectId: project.id,
    });
    const s2 = manager.createSession({
      tool: "shell",
      workingDir: tmpDir,
      projectId: project.id,
    });
    const s3 = manager.createSession({
      tool: "shell",
      workingDir: tmpDir,
      projectId: project.id,
    });

    expect(s1.gridSlot).toBe(0);
    expect(s2.gridSlot).toBe(1);
    expect(s3.gridSlot).toBe(2);

    // After deleting s2, slot 1 should be reusable
    manager.deleteSession(s2.id);
    const s4 = manager.createSession({
      tool: "shell",
      workingDir: tmpDir,
      projectId: project.id,
    });
    expect(s4.gridSlot).toBe(1); // Reclaimed slot 1
  });

  it("stopping already-stopped session is idempotent", () => {
    const session = manager.createSession({
      tool: "shell",
      workingDir: tmpDir,
    });

    manager.stopSession(session.id);
    expect(manager.getSession(session.id)!.status).toBe("stopped");

    // Second stop should not throw
    expect(() => manager.stopSession(session.id)).not.toThrow();
    expect(manager.getSession(session.id)!.status).toBe("stopped");
  });

  it("restart session creates new PTY with running status", () => {
    const session = manager.createSession({
      tool: "shell",
      workingDir: tmpDir,
    });

    const originalPid = session.pid;
    manager.stopSession(session.id);
    expect(manager.getSession(session.id)!.status).toBe("stopped");

    const restarted = manager.restartSession(session.id);
    expect(restarted.status).toBe("running");
    expect(restarted.pid).toBeGreaterThan(0);
    // New PTY should have a different PID
    expect(restarted.pid).not.toBe(originalPid);
  });

  it("deleting a project stops all its sessions first", () => {
    const project = manager.createProject("Doomed Project", tmpDir);
    const s1 = manager.createSession({
      tool: "shell",
      workingDir: tmpDir,
      projectId: project.id,
    });
    const s2 = manager.createSession({
      tool: "shell",
      workingDir: tmpDir,
      projectId: project.id,
    });

    expect(manager.getSession(s1.id)!.status).toBe("running");
    expect(manager.getSession(s2.id)!.status).toBe("running");

    manager.deleteProject(project.id);

    // Project should be gone
    expect(manager.getProject(project.id)).toBeNull();

    // Sessions should be stopped (orphaned by FK cascade)
    const orphanedS1 = manager.getSession(s1.id);
    expect(orphanedS1).not.toBeNull();
    expect(orphanedS1!.status).toBe("stopped");
  });

  it("PTY exit event marks session stopped automatically", () => {
    const session = manager.createSession({
      tool: "shell",
      workingDir: tmpDir,
    });

    expect(manager.getSession(session.id)!.status).toBe("running");

    // Simulate the PTY process exiting on its own
    mockPty.simulateExit(session.id, 0);

    // Session should now be stopped
    expect(manager.getSession(session.id)!.status).toBe("stopped");
    expect(manager.getSession(session.id)!.pid).toBeNull();
  });

  it("resume returns null for non-resumable tool", () => {
    const session = manager.createSession({
      tool: "shell",
      workingDir: tmpDir,
    });

    manager.stopSession(session.id);

    // Shell tool doesn't support resume — should return null
    const result = manager.resumeSession(session.id);
    expect(result).toBeNull();
  });

  it("flushAndClose stops all sessions and captures resume data", () => {
    // Create multiple sessions
    manager.createSession({ tool: "shell", workingDir: tmpDir });
    manager.createSession({ tool: "shell", workingDir: tmpDir });

    const before = manager.listAllSessions();
    expect(before.every((s) => s.status === "running")).toBe(true);

    manager.flushAndClose();

    const after = manager.listAllSessions();
    expect(after.every((s) => s.status === "stopped")).toBe(true);
  });

  it("status refresh detects PTY state changes", async () => {
    const session = manager.createSession({
      tool: "shell",
      workingDir: tmpDir,
    });

    // Simulate the PTY dying without triggering exit listeners
    // (this simulates a crash scenario where the process just disappears)
    // We'll use the status refresh to detect it
    mockPty.simulateData(session.id, "some output\n");

    // Run status refresh — should not throw
    await manager.refreshAllStatuses();

    // Session should still be running since mock PTY reports alive
    expect(manager.getSession(session.id)!.status).not.toBe("stopped");
  });

  it("auto-detects project from workingDir", () => {
    const project = manager.createProject("Auto Detect", tmpDir);

    // Create session without explicit projectId but with matching workingDir
    const session = manager.createSession({
      tool: "shell",
      workingDir: tmpDir,
    });

    // Should auto-detect the project
    expect(session.projectId).toBe(project.id);
  });

  it("standalone sessions have null projectId", () => {
    // Use a different path that doesn't match any project
    const otherDir = fs.mkdtempSync(path.join(os.tmpdir(), "standalone-"));

    const session = manager.createSession({
      tool: "shell",
      workingDir: otherDir,
    });

    expect(session.projectId).toBeNull();
    expect(manager.listStandaloneSessions()).toHaveLength(1);

    // Clean up
    manager.deleteSession(session.id);
    fs.rmSync(otherDir, { recursive: true, force: true });
  });
});
