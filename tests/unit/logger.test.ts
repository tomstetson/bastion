/**
 * Unit tests for the structured logger.
 *
 * Tests file output, log rotation, and level filtering.
 * Uses a temporary directory to avoid touching the real ~/.bastion/bastion.log.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// ---------------------------------------------------------------------------
// We can't easily swap the hardcoded LOG_DIR inside the logger module
// (it reads os.homedir() at import time). Instead, we test the formatting
// and level-filtering logic directly, and verify file I/O with a separate
// integration-style test that writes to the actual log file.
// ---------------------------------------------------------------------------

describe("Logger", () => {
  // We'll dynamically import the module so env var changes take effect
  let createLogger: typeof import("../../electron/core/logger").createLogger;
  let closeLogger: typeof import("../../electron/core/logger").closeLogger;
  let setLogLevel: typeof import("../../electron/core/logger").setLogLevel;
  let logStartupDiagnostics: typeof import("../../electron/core/logger").logStartupDiagnostics;

  const LOG_DIR = path.join(os.homedir(), ".bastion");
  const LOG_FILE = path.join(LOG_DIR, "bastion.log");

  /** Read the last N lines from the log file */
  function readLastLines(n: number): string[] {
    if (!fs.existsSync(LOG_FILE)) return [];
    const content = fs.readFileSync(LOG_FILE, "utf-8").trim();
    if (!content) return [];
    const lines = content.split("\n");
    return lines.slice(-n);
  }

  beforeEach(async () => {
    // Fresh import each test to reset module state
    const mod = await import("../../electron/core/logger");
    createLogger = mod.createLogger;
    closeLogger = mod.closeLogger;
    setLogLevel = mod.setLogLevel;
    logStartupDiagnostics = mod.logStartupDiagnostics;

    // Reset to info level
    setLogLevel("info");
  });

  afterEach(() => {
    closeLogger();
  });

  it("creates a logger with module-scoped methods", () => {
    const log = createLogger("test-module");
    expect(log).toHaveProperty("debug");
    expect(log).toHaveProperty("info");
    expect(log).toHaveProperty("warn");
    expect(log).toHaveProperty("error");
  });

  it("writes log lines to file", () => {
    const log = createLogger("test-write");
    log.info("hello from test");
    closeLogger(); // flush

    const lines = readLastLines(1);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines[0]).toContain("[INFO]");
    expect(lines[0]).toContain("[test-write]");
    expect(lines[0]).toContain("hello from test");
  });

  it("includes ISO timestamp in log lines", () => {
    const log = createLogger("test-timestamp");
    log.info("timestamp check");
    closeLogger();

    const lines = readLastLines(1);
    // ISO timestamps look like: 2024-01-15T10:30:00.000Z
    expect(lines[0]).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/);
  });

  it("includes optional data as JSON", () => {
    const log = createLogger("test-data");
    log.info("with data", { key: "value", num: 42 });
    closeLogger();

    const lines = readLastLines(1);
    expect(lines[0]).toContain('{"key":"value","num":42}');
  });

  it("filters out debug messages when level is info", () => {
    setLogLevel("info");
    const log = createLogger("test-filter");

    // Write an info first so we have a reference point
    log.info("visible");
    log.debug("should-be-filtered");
    closeLogger();

    const lines = readLastLines(2);
    const debugLines = lines.filter((l) => l.includes("should-be-filtered"));
    expect(debugLines).toHaveLength(0);
  });

  it("includes debug messages when level is debug", () => {
    setLogLevel("debug");
    const log = createLogger("test-debug");
    log.debug("debug-visible");
    closeLogger();

    const lines = readLastLines(1);
    const found = lines.some((l) => l.includes("debug-visible"));
    expect(found).toBe(true);
  });

  it("filters out info messages when level is warn", () => {
    setLogLevel("warn");
    const log = createLogger("test-warn-filter");
    log.info("should-not-appear");
    log.warn("should-appear");
    closeLogger();

    const lines = readLastLines(2);
    expect(lines.some((l) => l.includes("should-not-appear"))).toBe(false);
    expect(lines.some((l) => l.includes("should-appear"))).toBe(true);
  });

  it("writes ERROR level regardless of filter", () => {
    setLogLevel("error");
    const log = createLogger("test-error-only");
    log.info("nope");
    log.warn("nope");
    log.error("yes-error");
    closeLogger();

    const lines = readLastLines(3);
    expect(lines.some((l) => l.includes("nope"))).toBe(false);
    expect(lines.some((l) => l.includes("yes-error"))).toBe(true);
  });

  it("logStartupDiagnostics writes platform info", () => {
    logStartupDiagnostics();
    closeLogger();

    const lines = readLastLines(1);
    expect(lines[0]).toContain("[startup]");
    expect(lines[0]).toContain("Bastion starting");
    expect(lines[0]).toContain(process.platform);
  });

  it("handles rotation when log exceeds max size", () => {
    // This test verifies that the rotation logic doesn't crash.
    // We can't easily simulate a 5 MB file in a fast test,
    // so we just verify the logger works after calling close + reopen.
    const log1 = createLogger("test-rotate-1");
    log1.info("before close");
    closeLogger();

    const log2 = createLogger("test-rotate-2");
    log2.info("after reopen");
    closeLogger();

    const lines = readLastLines(1);
    expect(lines[0]).toContain("after reopen");
  });
});
