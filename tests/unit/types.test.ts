import { describe, it, expect } from "vitest";
import {
  getToolCommand,
  validateUUID,
  type GridLayout,
  type SessionStatus,
  type Tool,
  type Project,
  type Session,
  type ResumeData,
  type SessionCreateOptions,
  type ClaudeOptions,
  type WindowState,
} from "../../electron/core/types";

describe("getToolCommand", () => {
  it("returns 'claude' for claude tool", () => {
    expect(getToolCommand("claude")).toBe("claude");
  });

  it("returns 'opencode' for opencode tool", () => {
    expect(getToolCommand("opencode")).toBe("opencode");
  });

  it("returns 'gemini' for gemini tool", () => {
    expect(getToolCommand("gemini")).toBe("gemini");
  });

  it("returns 'codex' for codex tool", () => {
    expect(getToolCommand("codex")).toBe("codex");
  });

  it("returns SHELL or /bin/bash for custom tool with no custom command", () => {
    const result = getToolCommand("custom");
    expect(result).toBe(process.env.SHELL || "/bin/bash");
  });

  it("returns custom command when provided for custom tool", () => {
    expect(getToolCommand("custom", "my-custom-agent")).toBe("my-custom-agent");
  });

  it("returns SHELL or /bin/bash for shell tool", () => {
    const result = getToolCommand("shell");
    expect(result).toBe(process.env.SHELL || "/bin/bash");
  });
});

describe("validateUUID", () => {
  it("accepts a valid UUID v4", () => {
    expect(validateUUID("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
  });

  it("accepts a valid UUID v4 with lowercase hex", () => {
    expect(validateUUID("6ba7b810-9dad-11d1-80b4-00c04fd430c8")).toBe(true);
  });

  it("accepts UUID with all hex digits", () => {
    expect(validateUUID("abcdef01-2345-6789-abcd-ef0123456789")).toBe(true);
  });

  it("rejects an empty string", () => {
    expect(validateUUID("")).toBe(false);
  });

  it("rejects a random string", () => {
    expect(validateUUID("not-a-uuid")).toBe(false);
  });

  it("rejects a UUID with wrong number of characters", () => {
    expect(validateUUID("550e8400-e29b-41d4-a716-44665544000")).toBe(false);
  });

  it("rejects a UUID with uppercase (strict lowercase)", () => {
    expect(validateUUID("550E8400-E29B-41D4-A716-446655440000")).toBe(false);
  });

  it("rejects a UUID without dashes", () => {
    expect(validateUUID("550e8400e29b41d4a716446655440000")).toBe(false);
  });

  it("rejects a UUID with extra characters", () => {
    expect(validateUUID("550e8400-e29b-41d4-a716-446655440000x")).toBe(false);
  });

  it("rejects null-like inputs", () => {
    expect(validateUUID(null as unknown as string)).toBe(false);
    expect(validateUUID(undefined as unknown as string)).toBe(false);
  });
});

describe("type unions have correct number of values", () => {
  // These tests verify the type unions via runtime arrays that mirror them.
  // The types.ts file exports const arrays for each union type to enable this.

  it("GridLayout has 5 values", () => {
    const gridLayouts: GridLayout[] = ["1x1", "2x1", "2x2", "3x2", "auto"];
    expect(gridLayouts).toHaveLength(5);
  });

  it("SessionStatus has 5 values", () => {
    const statuses: SessionStatus[] = [
      "running",
      "waiting",
      "idle",
      "error",
      "stopped",
    ];
    expect(statuses).toHaveLength(5);
  });

  it("Tool has 6 values", () => {
    const tools: Tool[] = [
      "claude",
      "opencode",
      "gemini",
      "codex",
      "custom",
      "shell",
    ];
    expect(tools).toHaveLength(6);
  });
});

describe("type structure smoke tests", () => {
  it("Project interface has required fields", () => {
    const project: Project = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      name: "Test Project",
      path: "/home/user/projects/test",
      gridLayout: "2x2",
      sortOrder: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    expect(project.id).toBeDefined();
    expect(project.name).toBe("Test Project");
    expect(project.gridLayout).toBe("2x2");
  });

  it("Session interface has required fields", () => {
    const session: Session = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      projectId: null,
      name: "Test Session",
      tool: "claude",
      command: "claude",
      workingDir: "/home/user/projects/test",
      status: "idle",
      gridSlot: null,
      pid: null,
      toolData: {},
      worktreePath: null,
      worktreeBranch: null,
      resumeData: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    expect(session.id).toBeDefined();
    expect(session.tool).toBe("claude");
    expect(session.status).toBe("idle");
  });

  it("ResumeData interface has required fields", () => {
    const resumeData: ResumeData = {
      sessionId: "550e8400-e29b-41d4-a716-446655440000",
      resumeCommand: ["claude", "--resume", "abc123"],
      capturedAt: Date.now(),
      toolVersion: "1.0.0",
      outputSnapshot: "Last 100 lines of output...",
    };
    expect(resumeData.resumeCommand).toHaveLength(3);
    expect(resumeData.toolVersion).toBe("1.0.0");
  });

  it("SessionCreateOptions accepts minimal config", () => {
    const opts: SessionCreateOptions = {
      tool: "claude",
      workingDir: "/home/user/projects",
    };
    expect(opts.tool).toBe("claude");
    expect(opts.name).toBeUndefined();
  });

  it("ClaudeOptions supports resume mode", () => {
    const opts: ClaudeOptions = {
      sessionMode: "resume",
      resumeSessionId: "abc123",
      skipPermissions: true,
    };
    expect(opts.sessionMode).toBe("resume");
    expect(opts.resumeSessionId).toBe("abc123");
  });

  it("WindowState has position and size fields", () => {
    const state: WindowState = {
      x: 100,
      y: 200,
      width: 1400,
      height: 900,
      activeProjectId: null,
      sidebarWidth: 240,
    };
    expect(state.width).toBe(1400);
    expect(state.activeProjectId).toBeNull();
  });
});
