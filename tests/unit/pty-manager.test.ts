import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PTYManager } from "../../electron/core/pty-manager";

/**
 * Helper: wrap an event listener in a promise with a timeout.
 * Rejects if the event doesn't fire within `ms` milliseconds.
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

describe("PTYManager", () => {
  let manager: PTYManager;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pty-manager-test-"));
    manager = new PTYManager({ buffersDir: tmpDir });
  });

  afterEach(() => {
    manager.disposeAll();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ---------------------------------------------------------------------------
  // spawn
  // ---------------------------------------------------------------------------

  describe("spawn()", () => {
    it("returns sessionId and pid > 0", () => {
      const result = manager.spawn("session-1", {
        command: "/bin/echo",
        args: ["hello"],
        cwd: tmpDir,
        cols: 80,
        rows: 24,
      });
      expect(result.sessionId).toBe("session-1");
      expect(result.pid).toBeGreaterThan(0);
    });

    it("throws when spawning a duplicate sessionId", () => {
      manager.spawn("dup-session", {
        command: "/bin/echo",
        args: ["hello"],
        cwd: tmpDir,
        cols: 80,
        rows: 24,
      });
      expect(() =>
        manager.spawn("dup-session", {
          command: "/bin/echo",
          args: ["hello"],
          cwd: tmpDir,
          cols: 80,
          rows: 24,
        }),
      ).toThrow(/already exists/);
    });
  });

  // ---------------------------------------------------------------------------
  // Data events
  // ---------------------------------------------------------------------------

  describe("onData()", () => {
    it("emits data events from spawned process", async () => {
      manager.spawn("data-session", {
        command: "/bin/echo",
        args: ["hello world"],
        cwd: tmpDir,
        cols: 80,
        rows: 24,
      });

      const data = await waitFor<string>((cb) => {
        let accumulated = "";
        manager.onData("data-session", (chunk) => {
          accumulated += chunk;
          if (accumulated.includes("hello world")) {
            cb(accumulated);
          }
        });
      });

      expect(data).toContain("hello world");
    });
  });

  // ---------------------------------------------------------------------------
  // Exit events
  // ---------------------------------------------------------------------------

  describe("onExit()", () => {
    it("emits exit event when process terminates", async () => {
      manager.spawn("exit-session", {
        command: "/bin/true",
        args: [],
        cwd: tmpDir,
        cols: 80,
        rows: 24,
      });

      const exitInfo = await waitFor<{ exitCode: number; signal?: number }>(
        (cb) => {
          manager.onExit("exit-session", cb);
        },
      );

      // Exit event fired with a numeric exit code
      expect(typeof exitInfo.exitCode).toBe("number");
    });

    it("emits exit event with non-zero code for /bin/false", async () => {
      manager.spawn("fail-session", {
        command: "/bin/false",
        args: [],
        cwd: tmpDir,
        cols: 80,
        rows: 24,
      });

      const exitInfo = await waitFor<{ exitCode: number; signal?: number }>(
        (cb) => {
          manager.onExit("fail-session", cb);
        },
      );

      expect(exitInfo.exitCode).not.toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // write()
  // ---------------------------------------------------------------------------

  describe("write()", () => {
    it("sends input to the PTY process", async () => {
      // Spawn cat which echoes stdin to stdout
      manager.spawn("write-session", {
        command: "/bin/cat",
        args: [],
        cwd: tmpDir,
        cols: 80,
        rows: 24,
      });

      // Send data then EOF (ctrl-D) to terminate cat
      manager.write("write-session", "typed input\n");

      const data = await waitFor<string>((cb) => {
        let accumulated = "";
        manager.onData("write-session", (chunk) => {
          accumulated += chunk;
          if (accumulated.includes("typed input")) {
            cb(accumulated);
          }
        });
      });

      expect(data).toContain("typed input");

      // Send EOF to make cat exit
      manager.write("write-session", "\x04");
    });
  });

  // ---------------------------------------------------------------------------
  // resize()
  // ---------------------------------------------------------------------------

  describe("resize()", () => {
    it("resizes the PTY without throwing", () => {
      manager.spawn("resize-session", {
        command: "/bin/cat",
        args: [],
        cwd: tmpDir,
        cols: 80,
        rows: 24,
      });

      // Should not throw
      expect(() => manager.resize("resize-session", 120, 40)).not.toThrow();

      // Clean up cat
      manager.write("resize-session", "\x04");
    });
  });

  // ---------------------------------------------------------------------------
  // isAlive()
  // ---------------------------------------------------------------------------

  describe("isAlive()", () => {
    it("returns true for a running process", () => {
      manager.spawn("alive-session", {
        command: "/bin/cat",
        args: [],
        cwd: tmpDir,
        cols: 80,
        rows: 24,
      });

      expect(manager.isAlive("alive-session")).toBe(true);

      // Clean up
      manager.write("alive-session", "\x04");
    });

    it("returns false after process exits", async () => {
      manager.spawn("dead-session", {
        command: "/bin/true",
        args: [],
        cwd: tmpDir,
        cols: 80,
        rows: 24,
      });

      // Wait for exit
      await waitFor<{ exitCode: number; signal?: number }>((cb) => {
        manager.onExit("dead-session", cb);
      });

      expect(manager.isAlive("dead-session")).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // dispose()
  // ---------------------------------------------------------------------------

  describe("dispose()", () => {
    it("kills PTY and removes the session", async () => {
      manager.spawn("dispose-session", {
        command: "/bin/cat",
        args: [],
        cwd: tmpDir,
        cols: 80,
        rows: 24,
      });

      expect(manager.isAlive("dispose-session")).toBe(true);

      manager.dispose("dispose-session");

      // After dispose, the session is gone — accessing it should throw
      expect(() => manager.isAlive("dispose-session")).toThrow(/not found/);
    });

    it("throws on unknown sessionId", () => {
      expect(() => manager.dispose("nonexistent")).toThrow(/not found/);
    });
  });

  // ---------------------------------------------------------------------------
  // getBuffer() / getLastLines()
  // ---------------------------------------------------------------------------

  describe("getBuffer()", () => {
    it("returns the ring buffer for a session", async () => {
      manager.spawn("buf-session", {
        command: "/bin/echo",
        args: ["buffer test"],
        cwd: tmpDir,
        cols: 80,
        rows: 24,
      });

      // Wait for exit so all data is flushed
      await waitFor<{ exitCode: number; signal?: number }>((cb) => {
        manager.onExit("buf-session", cb);
      });

      const buffer = manager.getBuffer("buf-session");
      expect(buffer).toBeDefined();
      const lines = buffer.getAll();
      // At least one line should contain our output
      expect(lines.some((l) => l.includes("buffer test"))).toBe(true);
    });

    it("throws on unknown sessionId", () => {
      expect(() => manager.getBuffer("nonexistent")).toThrow(/not found/);
    });
  });

  describe("getLastLines()", () => {
    it("returns recent output lines", async () => {
      manager.spawn("lines-session", {
        command: "/bin/echo",
        args: ["line output"],
        cwd: tmpDir,
        cols: 80,
        rows: 24,
      });

      await waitFor<{ exitCode: number; signal?: number }>((cb) => {
        manager.onExit("lines-session", cb);
      });

      const lines = manager.getLastLines("lines-session", 5);
      expect(Array.isArray(lines)).toBe(true);
      expect(lines.some((l) => l.includes("line output"))).toBe(true);
    });

    it("throws on unknown sessionId", () => {
      expect(() => manager.getLastLines("nonexistent", 5)).toThrow(/not found/);
    });
  });

  // ---------------------------------------------------------------------------
  // getPid()
  // ---------------------------------------------------------------------------

  describe("getPid()", () => {
    it("returns the child process PID", () => {
      manager.spawn("pid-session", {
        command: "/bin/cat",
        args: [],
        cwd: tmpDir,
        cols: 80,
        rows: 24,
      });

      const pid = manager.getPid("pid-session");
      expect(pid).toBeGreaterThan(0);

      // Clean up
      manager.write("pid-session", "\x04");
    });

    it("throws on unknown sessionId", () => {
      expect(() => manager.getPid("nonexistent")).toThrow(/not found/);
    });
  });

  // ---------------------------------------------------------------------------
  // flushBuffer() / loadBuffer()
  // ---------------------------------------------------------------------------

  describe("flushBuffer() / loadBuffer()", () => {
    it("persists buffer to disk and loads it back", async () => {
      manager.spawn("flush-session", {
        command: "/bin/echo",
        args: ["persisted data"],
        cwd: tmpDir,
        cols: 80,
        rows: 24,
      });

      // Wait for process to finish
      await waitFor<{ exitCode: number; signal?: number }>((cb) => {
        manager.onExit("flush-session", cb);
      });

      // Flush to disk
      manager.flushBuffer("flush-session");

      // Verify file exists
      const bufferFile = path.join(tmpDir, "flush-session.log");
      expect(fs.existsSync(bufferFile)).toBe(true);

      // Load back into a new buffer
      const loaded = manager.loadBuffer("flush-session");
      const lines = loaded.getAll();
      expect(lines.some((l) => l.includes("persisted data"))).toBe(true);
    });

    it("flushAllBuffers() persists all active session buffers", async () => {
      manager.spawn("flush-a", {
        command: "/bin/echo",
        args: ["aaa"],
        cwd: tmpDir,
        cols: 80,
        rows: 24,
      });
      manager.spawn("flush-b", {
        command: "/bin/echo",
        args: ["bbb"],
        cwd: tmpDir,
        cols: 80,
        rows: 24,
      });

      // Wait for both to exit
      await Promise.all([
        waitFor<{ exitCode: number; signal?: number }>((cb) => {
          manager.onExit("flush-a", cb);
        }),
        waitFor<{ exitCode: number; signal?: number }>((cb) => {
          manager.onExit("flush-b", cb);
        }),
      ]);

      manager.flushAllBuffers();

      expect(fs.existsSync(path.join(tmpDir, "flush-a.log"))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, "flush-b.log"))).toBe(true);
    });

    it("flushBuffer() throws on unknown sessionId", () => {
      expect(() => manager.flushBuffer("nonexistent")).toThrow(/not found/);
    });
  });

  // ---------------------------------------------------------------------------
  // Unknown session errors
  // ---------------------------------------------------------------------------

  describe("throws on unknown sessionId", () => {
    it("write() throws", () => {
      expect(() => manager.write("nonexistent", "data")).toThrow(/not found/);
    });

    it("resize() throws", () => {
      expect(() => manager.resize("nonexistent", 80, 24)).toThrow(/not found/);
    });

    it("onData() throws", () => {
      expect(() => manager.onData("nonexistent", () => {})).toThrow(
        /not found/,
      );
    });

    it("onExit() throws", () => {
      expect(() => manager.onExit("nonexistent", () => {})).toThrow(
        /not found/,
      );
    });

    it("isAlive() throws", () => {
      expect(() => manager.isAlive("nonexistent")).toThrow(/not found/);
    });
  });

  // ---------------------------------------------------------------------------
  // Environment
  // ---------------------------------------------------------------------------

  describe("environment", () => {
    it("sets TERM=xterm-256color by default", async () => {
      manager.spawn("env-session", {
        command: "/usr/bin/env",
        args: [],
        cwd: tmpDir,
        cols: 80,
        rows: 24,
      });

      const data = await waitFor<string>((cb) => {
        let accumulated = "";
        manager.onData("env-session", (chunk) => {
          accumulated += chunk;
          // env prints variables then exits
          if (accumulated.includes("TERM=")) {
            cb(accumulated);
          }
        });
      });

      expect(data).toContain("TERM=xterm-256color");
    });
  });
});
