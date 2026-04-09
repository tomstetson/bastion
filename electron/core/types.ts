/**
 * Core types for Bastion Electron app.
 * Adapted from src/core/types.ts for the Electron/React architecture.
 */

// --- Type unions ---

export type GridLayout = "1x1" | "2x1" | "2x2" | "3x2" | "auto";

export type SessionStatus =
  | "running"   // Agent is actively working
  | "waiting"   // Agent needs input/approval
  | "idle"      // Session exists but agent is not active
  | "error"     // Session encountered an error
  | "stopped";  // Session was explicitly stopped

export type Tool =
  | "claude"    // Claude Code
  | "opencode"  // OpenCode
  | "gemini"    // Gemini CLI
  | "codex"     // OpenAI Codex CLI
  | "custom"    // Custom command
  | "shell";    // Plain shell

// --- Interfaces ---

export interface Project {
  id: string;              // UUID
  name: string;            // User-editable display name
  path: string;            // Absolute filesystem path
  gridLayout: GridLayout;
  sortOrder: number;
  createdAt: number;       // Unix timestamp (ms)
  updatedAt: number;       // Unix timestamp (ms)
}

export interface Session {
  id: string;              // UUID
  projectId: string | null;
  name: string;
  tool: Tool;
  command: string;
  workingDir: string;
  status: SessionStatus;
  gridSlot: number | null; // 0-5 position in grid
  pid: number | null;
  toolData: Record<string, unknown>;
  worktreePath: string | null;
  worktreeBranch: string | null;
  resumeData: ResumeData | null;
  createdAt: number;       // Unix timestamp (ms)
  updatedAt: number;       // Unix timestamp (ms)
}

export interface ResumeData {
  sessionId: string;
  resumeCommand: string[];
  capturedAt: number;      // Unix timestamp (ms)
  toolVersion: string;
  outputSnapshot: string;
}

export interface SessionCreateOptions {
  name?: string;
  tool: Tool;
  command?: string;
  workingDir: string;
  projectId?: string;
  worktreeBranch?: string;
  claudeOptions?: ClaudeOptions;
}

export interface ClaudeOptions {
  sessionMode: "new" | "resume";
  resumeSessionId?: string;
  skipPermissions?: boolean;
}

export interface WindowState {
  x: number;
  y: number;
  width: number;
  height: number;
  activeProjectId: string | null;
  sidebarWidth: number;
}

// --- Utility functions ---

/**
 * Returns the CLI command string for a given tool.
 * For "custom" tool, uses the provided customCmd or falls back to the user's shell.
 * For "shell" tool, returns the user's shell.
 */
export function getToolCommand(tool: Tool, customCmd?: string): string {
  switch (tool) {
    case "claude":
      return "claude";
    case "opencode":
      return "opencode";
    case "gemini":
      return "gemini";
    case "codex":
      return "codex";
    case "custom":
      return customCmd || process.env.SHELL || "/bin/bash";
    case "shell":
      return process.env.SHELL || "/bin/bash";
  }
}

/**
 * Validates that a string is a valid UUID (8-4-4-4-12 hex format, lowercase).
 * Accepts any UUID version with lowercase hex digits.
 */
export function validateUUID(id: string): boolean {
  if (typeof id !== "string") return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id);
}
