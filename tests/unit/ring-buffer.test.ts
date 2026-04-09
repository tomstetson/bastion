import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { RingBuffer } from "../../electron/core/ring-buffer";

describe("RingBuffer", () => {
  // -------------------------------------------------------------------------
  // Append and retrieve lines
  // -------------------------------------------------------------------------

  describe("append and retrieve", () => {
    it("stores a single line", () => {
      const buf = new RingBuffer(10);
      buf.append("hello\n");
      expect(buf.getAll()).toEqual(["hello"]);
    });

    it("stores multiple lines from separate appends", () => {
      const buf = new RingBuffer(10);
      buf.append("line1\n");
      buf.append("line2\n");
      expect(buf.getAll()).toEqual(["line1", "line2"]);
    });

    it("returns empty array when nothing appended", () => {
      const buf = new RingBuffer(10);
      expect(buf.getAll()).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // Multi-line splitting
  // -------------------------------------------------------------------------

  describe("split multi-line input on \\n", () => {
    it("splits a multi-line string into separate lines", () => {
      const buf = new RingBuffer(10);
      buf.append("line1\nline2\nline3\n");
      expect(buf.getAll()).toEqual(["line1", "line2", "line3"]);
    });

    it("handles Windows-style \\r\\n by keeping \\r in line content", () => {
      // PTY output may include \r\n — we split on \n only
      const buf = new RingBuffer(10);
      buf.append("line1\r\nline2\r\n");
      expect(buf.getAll()).toEqual(["line1\r", "line2\r"]);
    });

    it("handles multiple newlines producing empty lines", () => {
      const buf = new RingBuffer(10);
      buf.append("a\n\nb\n");
      expect(buf.getAll()).toEqual(["a", "", "b"]);
    });
  });

  // -------------------------------------------------------------------------
  // Circular eviction (wrap when capacity exceeded)
  // -------------------------------------------------------------------------

  describe("wrap when capacity exceeded", () => {
    it("evicts oldest lines when capacity is reached", () => {
      const buf = new RingBuffer(3);
      buf.append("line1\nline2\nline3\nline4\n");
      expect(buf.getAll()).toEqual(["line2", "line3", "line4"]);
    });

    it("evicts correctly across multiple appends", () => {
      const buf = new RingBuffer(2);
      buf.append("a\n");
      buf.append("b\n");
      buf.append("c\n");
      expect(buf.getAll()).toEqual(["b", "c"]);
    });

    it("handles capacity of 1", () => {
      const buf = new RingBuffer(1);
      buf.append("first\n");
      buf.append("second\n");
      expect(buf.getAll()).toEqual(["second"]);
    });

    it("handles large overflow past capacity", () => {
      const buf = new RingBuffer(3);
      // Append 10 lines, only last 3 should remain
      for (let i = 0; i < 10; i++) {
        buf.append(`line${i}\n`);
      }
      expect(buf.getAll()).toEqual(["line7", "line8", "line9"]);
    });
  });

  // -------------------------------------------------------------------------
  // getLines(n)
  // -------------------------------------------------------------------------

  describe("getLines(n) returns last N lines", () => {
    it("returns last N lines when buffer has more", () => {
      const buf = new RingBuffer(10);
      buf.append("a\nb\nc\nd\ne\n");
      expect(buf.getLines(3)).toEqual(["c", "d", "e"]);
    });

    it("returns all lines when N exceeds stored count", () => {
      const buf = new RingBuffer(10);
      buf.append("a\nb\n");
      expect(buf.getLines(5)).toEqual(["a", "b"]);
    });

    it("returns empty array when buffer is empty", () => {
      const buf = new RingBuffer(10);
      expect(buf.getLines(5)).toEqual([]);
    });

    it("returns last N after wrap-around", () => {
      const buf = new RingBuffer(3);
      buf.append("a\nb\nc\nd\ne\n");
      // Buffer holds [c, d, e]
      expect(buf.getLines(2)).toEqual(["d", "e"]);
    });

    it("returns empty array when N is 0", () => {
      const buf = new RingBuffer(10);
      buf.append("a\nb\n");
      expect(buf.getLines(0)).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // getAll()
  // -------------------------------------------------------------------------

  describe("getAll() returns everything in order", () => {
    it("returns lines in insertion order before wrap", () => {
      const buf = new RingBuffer(5);
      buf.append("a\nb\nc\n");
      expect(buf.getAll()).toEqual(["a", "b", "c"]);
    });

    it("returns lines in correct order after wrap", () => {
      const buf = new RingBuffer(3);
      buf.append("a\nb\nc\nd\ne\n");
      // After wrap: oldest still in buffer is c
      expect(buf.getAll()).toEqual(["c", "d", "e"]);
    });
  });

  // -------------------------------------------------------------------------
  // Partial lines (no trailing newline)
  // -------------------------------------------------------------------------

  describe("handle partial lines (no trailing newline)", () => {
    it("holds partial line until more data arrives", () => {
      const buf = new RingBuffer(10);
      buf.append("partial");
      // Partial line should not be committed yet
      expect(buf.getAll()).toEqual([]);
    });

    it("completes partial line when newline arrives", () => {
      const buf = new RingBuffer(10);
      buf.append("partial");
      buf.append(" complete\n");
      expect(buf.getAll()).toEqual(["partial complete"]);
    });

    it("handles mixed complete and partial lines", () => {
      const buf = new RingBuffer(10);
      buf.append("line1\npartial");
      expect(buf.getAll()).toEqual(["line1"]);
      buf.append(" done\nline3\n");
      expect(buf.getAll()).toEqual(["line1", "partial done", "line3"]);
    });

    it("includes partial line in getAll when includePartial is true", () => {
      const buf = new RingBuffer(10);
      buf.append("complete\npartial");
      // getAll without partial
      expect(buf.getAll()).toEqual(["complete"]);
    });
  });

  // -------------------------------------------------------------------------
  // bytesWritten tracking
  // -------------------------------------------------------------------------

  describe("track bytesWritten counter", () => {
    it("starts at 0", () => {
      const buf = new RingBuffer(10);
      expect(buf.bytesWritten).toBe(0);
    });

    it("increments with each append", () => {
      const buf = new RingBuffer(10);
      buf.append("hello\n"); // 6 bytes
      expect(buf.bytesWritten).toBe(6);
    });

    it("accumulates across multiple appends", () => {
      const buf = new RingBuffer(10);
      buf.append("abc\n"); // 4 bytes
      buf.append("def\n"); // 4 bytes
      expect(buf.bytesWritten).toBe(8);
    });

    it("counts bytes for multi-byte UTF-8 characters", () => {
      const buf = new RingBuffer(10);
      const data = "\u00e9\n"; // e-acute is 2 bytes in UTF-8
      buf.append(data);
      const expected = Buffer.byteLength(data, "utf-8");
      expect(buf.bytesWritten).toBe(expected);
    });
  });

  // -------------------------------------------------------------------------
  // resetBytesCounter
  // -------------------------------------------------------------------------

  describe("resetBytesCounter()", () => {
    it("resets bytesWritten to 0", () => {
      const buf = new RingBuffer(10);
      buf.append("some data\n");
      expect(buf.bytesWritten).toBeGreaterThan(0);
      buf.resetBytesCounter();
      expect(buf.bytesWritten).toBe(0);
    });

    it("allows accumulation after reset", () => {
      const buf = new RingBuffer(10);
      buf.append("abc\n"); // 4 bytes
      buf.resetBytesCounter();
      buf.append("de\n"); // 3 bytes
      expect(buf.bytesWritten).toBe(3);
    });
  });

  // -------------------------------------------------------------------------
  // saveToDisk / loadFromDisk roundtrip
  // -------------------------------------------------------------------------

  describe("saveToDisk / loadFromDisk", () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ringbuf-test-"));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("roundtrips lines through disk", () => {
      const filePath = path.join(tmpDir, "output.log");
      const buf = new RingBuffer(10);
      buf.append("line1\nline2\nline3\n");
      buf.saveToDisk(filePath);

      const loaded = RingBuffer.loadFromDisk(filePath, 10);
      expect(loaded.getAll()).toEqual(["line1", "line2", "line3"]);
    });

    it("creates file with 0o600 permissions", () => {
      const filePath = path.join(tmpDir, "output.log");
      const buf = new RingBuffer(10);
      buf.append("test\n");
      buf.saveToDisk(filePath);

      const stats = fs.statSync(filePath);
      // Check owner-only read/write (0o600 = 384 decimal)
      expect(stats.mode & 0o777).toBe(0o600);
    });

    it("creates parent directory with 0o700 permissions", () => {
      const nestedDir = path.join(tmpDir, "nested", "deep");
      const filePath = path.join(nestedDir, "output.log");
      const buf = new RingBuffer(10);
      buf.append("test\n");
      buf.saveToDisk(filePath);

      const stats = fs.statSync(nestedDir);
      expect(stats.mode & 0o777).toBe(0o700);
    });

    it("loads respecting capacity (truncates to capacity)", () => {
      const filePath = path.join(tmpDir, "output.log");
      const buf = new RingBuffer(10);
      buf.append("a\nb\nc\nd\ne\n");
      buf.saveToDisk(filePath);

      // Load with smaller capacity
      const loaded = RingBuffer.loadFromDisk(filePath, 3);
      expect(loaded.getAll()).toEqual(["c", "d", "e"]);
    });

    it("saveToDisk includes partial line", () => {
      const filePath = path.join(tmpDir, "output.log");
      const buf = new RingBuffer(10);
      buf.append("complete\npartial");
      buf.saveToDisk(filePath);

      const content = fs.readFileSync(filePath, "utf-8");
      expect(content).toContain("complete");
      expect(content).toContain("partial");
    });
  });

  // -------------------------------------------------------------------------
  // loadFromDisk with nonexistent path
  // -------------------------------------------------------------------------

  describe("loadFromDisk returns empty buffer for nonexistent path", () => {
    it("returns empty RingBuffer for missing file", () => {
      const loaded = RingBuffer.loadFromDisk("/nonexistent/path/file.log", 10);
      expect(loaded.getAll()).toEqual([]);
      expect(loaded.bytesWritten).toBe(0);
    });
  });
});
