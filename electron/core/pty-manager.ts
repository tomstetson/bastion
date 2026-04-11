/**
 * PTY Manager — manages pseudo-terminal processes using node-pty with ring buffers.
 *
 * Each session gets its own PTY process and a RingBuffer that captures output.
 * Buffers can be persisted to disk and loaded back for session resume.
 *
 * Security: Uses node-pty's spawn with argument arrays — no shell strings.
 */

import * as pty from "node-pty";
import path from "node:path";
import { RingBuffer } from "./ring-buffer";
import { createLogger } from "./logger";

const log = createLogger("pty-manager");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PTYSpawnOptions {
  command: string;
  args: string[];
  cwd: string;
  cols: number;
  rows: number;
  env?: Record<string, string>;
}

export interface PTYSpawnResult {
  sessionId: string;
  pid: number;
}

interface PTYInstance {
  pty: pty.IPty;
  buffer: RingBuffer;
  pid: number;
  dataListeners: Array<(data: string) => void>;
  exitListeners: Array<(info: { exitCode: number; signal?: number }) => void>;
  alive: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default ring buffer capacity: 10,000 lines of output history. */
const RING_BUFFER_CAPACITY = 10_000;

// ---------------------------------------------------------------------------
// PTYManager
// ---------------------------------------------------------------------------

export class PTYManager {
  private sessions = new Map<string, PTYInstance>();
  private buffersDir: string;

  constructor(options: { buffersDir: string }) {
    this.buffersDir = options.buffersDir;
  }

  /**
   * Spawn a new PTY process for a session.
   * Creates the PTY via node-pty (argument array, no shell string),
   * wires data/exit listeners, and creates a ring buffer.
   */
  spawn(sessionId: string, options: PTYSpawnOptions): PTYSpawnResult {
    if (this.sessions.has(sessionId)) {
      throw new Error(`PTY session "${sessionId}" already exists`);
    }

    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
      TERM: "xterm-256color",
      ...options.env,
    };

    const ptyProcess = pty.spawn(options.command, options.args, {
      name: "xterm-256color",
      cols: options.cols,
      rows: options.rows,
      cwd: options.cwd,
      env,
    });

    const buffer = new RingBuffer(RING_BUFFER_CAPACITY);
    const instance: PTYInstance = {
      pty: ptyProcess,
      buffer,
      pid: ptyProcess.pid,
      dataListeners: [],
      exitListeners: [],
      alive: true,
    };

    // Wire PTY data → ring buffer + listeners
    ptyProcess.onData((data: string) => {
      buffer.append(data);
      for (const listener of instance.dataListeners) {
        listener(data);
      }
    });

    // Wire PTY exit → mark dead + notify listeners
    ptyProcess.onExit(({ exitCode, signal }) => {
      instance.alive = false;
      log.info("PTY exited", { sessionId, pid: ptyProcess.pid, exitCode, signal });
      const info = { exitCode, signal };
      for (const listener of instance.exitListeners) {
        listener(info);
      }
    });

    this.sessions.set(sessionId, instance);
    log.info("PTY spawned", { sessionId, pid: ptyProcess.pid, command: options.command });

    return { sessionId, pid: ptyProcess.pid };
  }

  /** Forward input data to the PTY. */
  write(sessionId: string, data: string): void {
    const instance = this.getSession(sessionId);
    instance.pty.write(data);
  }

  /** Resize the PTY terminal dimensions. */
  resize(sessionId: string, cols: number, rows: number): void {
    const instance = this.getSession(sessionId);
    instance.pty.resize(cols, rows);
  }

  /** Register a callback for PTY output data. */
  onData(sessionId: string, listener: (data: string) => void): void {
    const instance = this.getSession(sessionId);
    instance.dataListeners.push(listener);
  }

  /** Register a callback for PTY process exit. */
  onExit(
    sessionId: string,
    listener: (info: { exitCode: number; signal?: number }) => void,
  ): void {
    const instance = this.getSession(sessionId);
    instance.exitListeners.push(listener);
  }

  /** Check whether the PTY process is still running. */
  isAlive(sessionId: string): boolean {
    const instance = this.getSession(sessionId);
    return instance.alive;
  }

  /** Get the ring buffer for a session. */
  getBuffer(sessionId: string): RingBuffer {
    const instance = this.getSession(sessionId);
    return instance.buffer;
  }

  /** Get the last N lines from the session's ring buffer. */
  getLastLines(sessionId: string, n: number): string[] {
    const instance = this.getSession(sessionId);
    return instance.buffer.getLines(n);
  }

  /** Get the child process PID for a session. */
  getPid(sessionId: string): number {
    const instance = this.getSession(sessionId);
    return instance.pid;
  }

  /** Kill a specific PTY and clean up its resources. */
  dispose(sessionId: string): void {
    const instance = this.getSession(sessionId);

    if (instance.alive) {
      instance.pty.kill();
      instance.alive = false;
    }

    log.info("PTY disposed", { sessionId });
    instance.dataListeners.length = 0;
    instance.exitListeners.length = 0;
    this.sessions.delete(sessionId);
  }

  /** Kill all managed PTY processes. */
  disposeAll(): void {
    for (const [sessionId] of this.sessions) {
      // Use internal logic directly to avoid modifying map during iteration
      const instance = this.sessions.get(sessionId)!;
      if (instance.alive) {
        instance.pty.kill();
        instance.alive = false;
      }
      instance.dataListeners.length = 0;
      instance.exitListeners.length = 0;
    }
    this.sessions.clear();
  }

  /** Persist a session's ring buffer to disk. */
  flushBuffer(sessionId: string): void {
    const instance = this.getSession(sessionId);
    const filePath = this.bufferFilePath(sessionId);
    instance.buffer.saveToDisk(filePath);
  }

  /** Persist all session ring buffers to disk. */
  flushAllBuffers(): void {
    for (const [sessionId, instance] of this.sessions) {
      const filePath = this.bufferFilePath(sessionId);
      instance.buffer.saveToDisk(filePath);
    }
  }

  /** Load a persisted ring buffer from disk. Returns a new RingBuffer. */
  loadBuffer(sessionId: string): RingBuffer {
    const filePath = this.bufferFilePath(sessionId);
    return RingBuffer.loadFromDisk(filePath, RING_BUFFER_CAPACITY);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /** Look up a session, throwing if it doesn't exist. */
  private getSession(sessionId: string): PTYInstance {
    const instance = this.sessions.get(sessionId);
    if (!instance) {
      throw new Error(`PTY session "${sessionId}" not found`);
    }
    return instance;
  }

  /** Compute the on-disk path for a session's buffer file. */
  private bufferFilePath(sessionId: string): string {
    return path.join(this.buffersDir, `${sessionId}.log`);
  }
}
