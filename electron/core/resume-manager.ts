/**
 * Resume manager for session resumption.
 *
 * Handles building resume commands, capturing resume data from tool sessions,
 * and validating whether stored resume data is still usable.
 *
 * Currently only Claude Code supports session resumption via --resume flag.
 * Other tools (opencode, gemini, codex) may add resume support in the future.
 */

import type { Tool, ResumeData } from "./types";

/** Maximum number of output lines to keep in a resume snapshot */
const MAX_SNAPSHOT_LINES = 500;

/** Maximum age (in ms) before resume data is considered stale: 30 days */
const MAX_RESUME_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/** Tools that currently support session resumption */
const RESUMABLE_TOOLS: ReadonlySet<Tool> = new Set(["claude"]);

export interface CaptureInput {
  toolSessionId: string | null;
  lastLines: string[];
  toolVersion: string;
}

export class ResumeManager {
  /**
   * Build the CLI command array to resume a session for the given tool.
   *
   * @returns Command array (e.g., ["claude", "--resume", sessionId]) or null
   *          if the tool doesn't support resumption or sessionId is missing.
   */
  buildResumeCommand(
    tool: Tool,
    data: { sessionId?: string },
  ): string[] | null {
    if (!RESUMABLE_TOOLS.has(tool)) return null;
    if (!data.sessionId) return null;

    switch (tool) {
      case "claude":
        return ["claude", "--resume", data.sessionId];
      default:
        return null;
    }
  }

  /**
   * Capture resume data from a running tool session.
   *
   * @returns ResumeData if the tool supports resumption and a session ID is
   *          available, otherwise null.
   */
  captureResumeData(tool: Tool, input: CaptureInput): ResumeData | null {
    if (!RESUMABLE_TOOLS.has(tool)) return null;
    if (!input.toolSessionId) return null;

    const resumeCommand = this.buildResumeCommand(tool, {
      sessionId: input.toolSessionId,
    });
    if (!resumeCommand) return null;

    // Keep only the last MAX_SNAPSHOT_LINES lines
    const lines =
      input.lastLines.length > MAX_SNAPSHOT_LINES
        ? input.lastLines.slice(-MAX_SNAPSHOT_LINES)
        : input.lastLines;

    return {
      sessionId: input.toolSessionId,
      resumeCommand,
      capturedAt: Date.now(),
      toolVersion: input.toolVersion,
      outputSnapshot: lines.join("\n"),
    };
  }

  /**
   * Check whether stored resume data is still valid for use.
   *
   * Invalid if:
   * - sessionId is empty
   * - resumeCommand is empty
   * - Data is older than 30 days
   */
  isResumeValid(data: ResumeData): boolean {
    if (!data.sessionId) return false;
    if (!data.resumeCommand || data.resumeCommand.length === 0) return false;

    const age = Date.now() - data.capturedAt;
    if (age > MAX_RESUME_AGE_MS) return false;

    return true;
  }
}
