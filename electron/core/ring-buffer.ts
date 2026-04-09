/**
 * Circular line buffer for PTY output history.
 * Stores the last N lines in a fixed-capacity ring, evicting the oldest
 * when full. Handles partial lines (data without a trailing newline)
 * by buffering them until the next newline arrives.
 */

import fs from "node:fs";
import path from "node:path";

export class RingBuffer {
  private lines: string[];
  private head: number; // Next write position
  private count: number; // Number of stored lines (0..capacity)
  private partial: string; // Incomplete line awaiting a newline
  private _bytesWritten: number;
  readonly capacity: number;

  constructor(capacity: number) {
    if (capacity < 1) {
      throw new Error("RingBuffer capacity must be at least 1");
    }
    this.capacity = capacity;
    this.lines = new Array<string>(capacity);
    this.head = 0;
    this.count = 0;
    this.partial = "";
    this._bytesWritten = 0;
  }

  /**
   * Total bytes appended since creation or last resetBytesCounter().
   * Useful for calculating activity rate.
   */
  get bytesWritten(): number {
    return this._bytesWritten;
  }

  /** Reset the bytes-written counter to 0. */
  resetBytesCounter(): void {
    this._bytesWritten = 0;
  }

  /**
   * Append data to the buffer. Splits on \n and stores each complete line.
   * Any trailing content without a newline is held as a partial line until
   * more data arrives.
   */
  append(data: string): void {
    this._bytesWritten += Buffer.byteLength(data, "utf-8");

    // Prepend any leftover partial from previous append
    const combined = this.partial + data;
    const segments = combined.split("\n");

    // Last segment is either "" (if data ended with \n) or a new partial
    this.partial = segments.pop()!;

    // Each remaining segment is a complete line
    for (const line of segments) {
      this.pushLine(line);
    }
  }

  /** Push a single complete line into the ring. */
  private pushLine(line: string): void {
    this.lines[this.head] = line;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) {
      this.count++;
    }
  }

  /** Return the last N complete lines (or fewer if the buffer has less). */
  getLines(n: number): string[] {
    if (n <= 0) return [];
    const all = this.getAll();
    if (n >= all.length) return all;
    return all.slice(all.length - n);
  }

  /** Return all complete lines in insertion order (oldest first). */
  getAll(): string[] {
    if (this.count === 0) return [];

    const result: string[] = new Array(this.count);
    // The oldest line is at (head - count) mod capacity
    const start = (this.head - this.count + this.capacity) % this.capacity;
    for (let i = 0; i < this.count; i++) {
      result[i] = this.lines[(start + i) % this.capacity];
    }
    return result;
  }

  /**
   * Write all lines (including any partial line) to a file.
   * Creates parent directories with 0o700 and the file with 0o600.
   */
  saveToDisk(filePath: string): void {
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });

    const allLines = this.getAll();
    // Include partial line if present
    if (this.partial) {
      allLines.push(this.partial);
    }

    const content = allLines.join("\n") + "\n";

    // Write with restrictive permissions: owner read/write only
    const fd = fs.openSync(filePath, "w", 0o600);
    try {
      fs.writeSync(fd, content);
    } finally {
      fs.closeSync(fd);
    }
  }

  /**
   * Load lines from a file into a new RingBuffer.
   * Returns an empty buffer if the file does not exist.
   */
  static loadFromDisk(filePath: string, capacity: number): RingBuffer {
    const buf = new RingBuffer(capacity);

    let content: string;
    try {
      content = fs.readFileSync(filePath, "utf-8");
    } catch {
      // File doesn't exist or can't be read — return empty buffer
      return buf;
    }

    if (content.length === 0) return buf;

    // Feed content through append so it goes through the normal ring logic
    buf.append(content);

    // Don't count loaded bytes toward the activity counter
    buf.resetBytesCounter();

    return buf;
  }
}
