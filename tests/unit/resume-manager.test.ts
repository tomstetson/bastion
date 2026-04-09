import { describe, it, expect } from "vitest";
import { ResumeManager } from "../../electron/core/resume-manager";
import type { ResumeData } from "../../electron/core/types";

const manager = new ResumeManager();

// --- buildResumeCommand ---

describe("buildResumeCommand", () => {
  it("returns correct array for claude tool", () => {
    const result = manager.buildResumeCommand("claude", {
      sessionId: "abc-123",
    });
    expect(result).toEqual(["claude", "--resume", "abc-123"]);
  });

  it("returns null for claude when sessionId is missing", () => {
    const result = manager.buildResumeCommand("claude", {});
    expect(result).toBeNull();
  });

  it("returns null for opencode (not yet supported)", () => {
    const result = manager.buildResumeCommand("opencode", {
      sessionId: "abc-123",
    });
    expect(result).toBeNull();
  });

  it("returns null for gemini (not yet supported)", () => {
    const result = manager.buildResumeCommand("gemini", {
      sessionId: "abc-123",
    });
    expect(result).toBeNull();
  });

  it("returns null for codex (not yet supported)", () => {
    const result = manager.buildResumeCommand("codex", {
      sessionId: "abc-123",
    });
    expect(result).toBeNull();
  });

  it("returns null for shell tool", () => {
    const result = manager.buildResumeCommand("shell", {
      sessionId: "abc-123",
    });
    expect(result).toBeNull();
  });

  it("returns null for custom tool", () => {
    const result = manager.buildResumeCommand("custom", {
      sessionId: "abc-123",
    });
    expect(result).toBeNull();
  });
});

// --- captureResumeData ---

describe("captureResumeData", () => {
  it("builds full ResumeData when toolSessionId is present", () => {
    const result = manager.captureResumeData("claude", {
      toolSessionId: "session-xyz",
      lastLines: ["line 1", "line 2", "line 3"],
      toolVersion: "1.2.3",
    });

    expect(result).not.toBeNull();
    expect(result!.sessionId).toBe("session-xyz");
    expect(result!.resumeCommand).toEqual([
      "claude",
      "--resume",
      "session-xyz",
    ]);
    expect(result!.outputSnapshot).toBe("line 1\nline 2\nline 3");
    expect(result!.toolVersion).toBe("1.2.3");
    expect(typeof result!.capturedAt).toBe("number");
    // Timestamp should be recent (within last 5 seconds)
    expect(Date.now() - result!.capturedAt).toBeLessThan(5_000);
  });

  it("returns null when toolSessionId is null", () => {
    const result = manager.captureResumeData("claude", {
      toolSessionId: null,
      lastLines: ["some output"],
      toolVersion: "1.0.0",
    });
    expect(result).toBeNull();
  });

  it("returns null when toolSessionId is empty string", () => {
    const result = manager.captureResumeData("claude", {
      toolSessionId: "",
      lastLines: ["some output"],
      toolVersion: "1.0.0",
    });
    expect(result).toBeNull();
  });

  it("returns null for tools that do not support resume", () => {
    const result = manager.captureResumeData("shell", {
      toolSessionId: "session-xyz",
      lastLines: ["$ "],
      toolVersion: "5.2",
    });
    expect(result).toBeNull();
  });

  it("truncates outputSnapshot to last 500 lines", () => {
    const lines = Array.from({ length: 600 }, (_, i) => `line ${i + 1}`);
    const result = manager.captureResumeData("claude", {
      toolSessionId: "session-xyz",
      lastLines: lines,
      toolVersion: "1.0.0",
    });

    expect(result).not.toBeNull();
    const snapshotLines = result!.outputSnapshot.split("\n");
    expect(snapshotLines).toHaveLength(500);
    // Should keep the LAST 500 lines
    expect(snapshotLines[0]).toBe("line 101");
    expect(snapshotLines[499]).toBe("line 600");
  });
});

// --- isResumeValid ---

describe("isResumeValid", () => {
  const validData: ResumeData = {
    sessionId: "session-xyz",
    resumeCommand: ["claude", "--resume", "session-xyz"],
    capturedAt: Date.now(),
    toolVersion: "1.2.3",
    outputSnapshot: "some output",
  };

  it("returns true for valid recent ResumeData", () => {
    expect(manager.isResumeValid(validData)).toBe(true);
  });

  it("returns false when age exceeds 30 days", () => {
    const thirtyOneDaysAgo = Date.now() - 31 * 24 * 60 * 60 * 1000;
    const staleData: ResumeData = {
      ...validData,
      capturedAt: thirtyOneDaysAgo,
    };
    expect(manager.isResumeValid(staleData)).toBe(false);
  });

  it("returns true when age is exactly at the 30-day boundary", () => {
    const exactly30Days = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const borderData: ResumeData = {
      ...validData,
      capturedAt: exactly30Days,
    };
    // At exactly 30 days, still valid (> 30 days is invalid)
    expect(manager.isResumeValid(borderData)).toBe(true);
  });

  it("returns false when sessionId is empty", () => {
    const data: ResumeData = { ...validData, sessionId: "" };
    expect(manager.isResumeValid(data)).toBe(false);
  });

  it("returns false when resumeCommand is empty array", () => {
    const data: ResumeData = { ...validData, resumeCommand: [] };
    expect(manager.isResumeValid(data)).toBe(false);
  });
});
