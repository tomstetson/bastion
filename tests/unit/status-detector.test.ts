import { describe, it, expect } from "vitest";
import {
  StatusDetector,
  ACTIVITY_THRESHOLD,
  IDLE_TIMEOUT_MS,
} from "../../electron/core/status-detector";

const detector = new StatusDetector();

// --- Claude: waiting patterns ---

describe("Claude waiting detection", () => {
  it("detects ? prompt as waiting", () => {
    const status = detector.detect("claude", ["? Which file to edit?"], 0);
    expect(status).toBe("waiting");
  });

  it("detects > prompt as waiting", () => {
    const status = detector.detect("claude", ["> "], 0);
    expect(status).toBe("waiting");
  });

  it("detects permission request as waiting", () => {
    const status = detector.detect(
      "claude",
      ["Allow? (y/n)"],
      10,
    );
    expect(status).toBe("waiting");
  });

  it("detects 'Do you want to proceed' as waiting", () => {
    const status = detector.detect(
      "claude",
      ["Do you want to proceed with these changes?"],
      0,
    );
    expect(status).toBe("waiting");
  });

  it("detects 'Press Enter' as waiting", () => {
    const status = detector.detect(
      "claude",
      ["Press Enter to continue..."],
      5,
    );
    expect(status).toBe("waiting");
  });

  it("does NOT detect waiting when activity is high (pattern mid-stream)", () => {
    // High bytes/sec means the pattern likely appeared while output is still flowing
    const status = detector.detect(
      "claude",
      ["? Which file to edit?"],
      200,
    );
    expect(status).toBe("running");
  });
});

// --- Claude: running patterns ---

describe("Claude running detection", () => {
  it("detects braille spinner as running", () => {
    const status = detector.detect("claude", ["⠋ Processing..."], 10);
    expect(status).toBe("running");
  });

  it("detects Thinking... as running", () => {
    const status = detector.detect("claude", ["Thinking..."], 5);
    expect(status).toBe("running");
  });

  it("detects action verb 'Reading' as running", () => {
    const status = detector.detect("claude", ["Reading src/main.ts"], 30);
    expect(status).toBe("running");
  });

  it("detects action verb 'Writing' as running", () => {
    const status = detector.detect("claude", ["Writing to output.json"], 20);
    expect(status).toBe("running");
  });

  it("detects high activity as running even without pattern match", () => {
    const status = detector.detect(
      "claude",
      ["some arbitrary output"],
      ACTIVITY_THRESHOLD + 1,
    );
    expect(status).toBe("running");
  });
});

// --- Claude: error patterns ---

describe("Claude error detection", () => {
  it("detects Error: prefix as error", () => {
    const status = detector.detect(
      "claude",
      ["Error: file not found"],
      0,
    );
    expect(status).toBe("error");
  });

  it("detects FATAL as error", () => {
    const status = detector.detect(
      "claude",
      ["FATAL: process crashed"],
      0,
    );
    expect(status).toBe("error");
  });

  it("detects stack trace line as error", () => {
    const status = detector.detect(
      "claude",
      ["    at Module._compile (/usr/lib/node.js:123:45)"],
      0,
    );
    expect(status).toBe("error");
  });

  it("detects ENOENT as error", () => {
    const status = detector.detect(
      "claude",
      ["ENOENT: no such file or directory"],
      0,
    );
    expect(status).toBe("error");
  });

  it("detects EACCES as error", () => {
    const status = detector.detect(
      "claude",
      ["EACCES: permission denied"],
      0,
    );
    expect(status).toBe("error");
  });

  it("detects EPERM as error", () => {
    const status = detector.detect(
      "claude",
      ["EPERM: operation not permitted"],
      0,
    );
    expect(status).toBe("error");
  });

  it("error takes priority over waiting pattern", () => {
    // If both error and waiting patterns match, error wins
    const status = detector.detect(
      "claude",
      ["Error: something broke", "? Retry?"],
      0,
    );
    expect(status).toBe("error");
  });
});

// --- Idle detection ---

describe("idle detection", () => {
  it("detects idle when no activity for IDLE_TIMEOUT_MS", () => {
    const status = detector.detect(
      "claude",
      ["some old output"],
      0,
      IDLE_TIMEOUT_MS,
    );
    expect(status).toBe("idle");
  });

  it("detects idle when inactivity exceeds threshold", () => {
    const status = detector.detect(
      "claude",
      ["done."],
      0,
      IDLE_TIMEOUT_MS + 10_000,
    );
    expect(status).toBe("idle");
  });

  it("does NOT detect idle when activity is below threshold but recent", () => {
    const status = detector.detect(
      "claude",
      ["some output"],
      0,
      30_000, // 30s — under the 60s threshold
    );
    expect(status).toBe("running"); // default running
  });

  it("does NOT detect idle when msSinceLastActivity is undefined", () => {
    const status = detector.detect("claude", ["some output"], 0, undefined);
    expect(status).toBe("running"); // default running
  });
});

// --- Generic tool patterns ---

describe("generic tool waiting detection", () => {
  it("detects bare $ prompt as waiting", () => {
    const status = detector.detect("shell", ["$ "], 0);
    expect(status).toBe("waiting");
  });

  it("detects > prompt as waiting for generic tool", () => {
    const status = detector.detect("codex", ["> "], 0);
    expect(status).toBe("waiting");
  });

  it("detects (y/n) confirmation as waiting", () => {
    const status = detector.detect(
      "shell",
      ["Continue? (y/n)"],
      0,
    );
    expect(status).toBe("waiting");
  });
});

describe("generic tool error detection", () => {
  it("detects ERROR keyword as error", () => {
    const status = detector.detect(
      "shell",
      ["ERROR: command not found"],
      0,
    );
    expect(status).toBe("error");
  });

  it("detects 'failed' as error", () => {
    const status = detector.detect(
      "gemini",
      ["Build failed with 3 errors"],
      0,
    );
    expect(status).toBe("error");
  });
});

// --- Default behavior ---

describe("default / ambiguous state", () => {
  it("defaults to running for ambiguous output", () => {
    const status = detector.detect(
      "claude",
      ["just some random text without patterns"],
      0,
    );
    expect(status).toBe("running");
  });

  it("defaults to running with empty lines", () => {
    const status = detector.detect("claude", [], 0);
    expect(status).toBe("running");
  });

  it("defaults to running with low activity and no patterns", () => {
    const status = detector.detect(
      "opencode",
      ["processing complete"],
      10,
      5_000,
    );
    expect(status).toBe("running");
  });
});

// --- Constants ---

describe("exported constants", () => {
  it("ACTIVITY_THRESHOLD is 50 bytes/sec", () => {
    expect(ACTIVITY_THRESHOLD).toBe(50);
  });

  it("IDLE_TIMEOUT_MS is 60000ms", () => {
    expect(IDLE_TIMEOUT_MS).toBe(60_000);
  });
});
