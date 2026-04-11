/**
 * Multi-signal status detector for agent sessions.
 *
 * Combines terminal output pattern matching with activity-level heuristics
 * to determine session status. Tool-specific patterns (e.g., Claude spinners)
 * override generic patterns when available.
 *
 * Detection priority:
 *   exited → error → waiting (low activity) → running (high activity or patterns) → idle (60s+ no activity) → default running
 */

import { createLogger } from "./logger";
import type { Tool, SessionStatus } from "./types";
import {
  CLAUDE_WAITING_PATTERNS,
  CLAUDE_RUNNING_PATTERNS,
  CLAUDE_ERROR_PATTERNS,
} from "./patterns/claude-patterns";
import {
  GENERIC_WAITING_PATTERNS,
  GENERIC_ERROR_PATTERNS,
} from "./patterns/generic-patterns";

/** Bytes/sec below this threshold = low activity */
export const ACTIVITY_THRESHOLD = 50;

/** Milliseconds of inactivity before a session is considered idle */
export const IDLE_TIMEOUT_MS = 60_000;

interface PatternSet {
  waiting: RegExp[];
  running: RegExp[];
  error: RegExp[];
}

/** Returns the pattern set for a given tool */
function getPatternsForTool(tool: Tool): PatternSet {
  if (tool === "claude") {
    return {
      waiting: CLAUDE_WAITING_PATTERNS,
      running: CLAUDE_RUNNING_PATTERNS,
      error: CLAUDE_ERROR_PATTERNS,
    };
  }

  // All other tools use generic patterns (no running patterns — rely on activity)
  return {
    waiting: GENERIC_WAITING_PATTERNS,
    running: [],
    error: GENERIC_ERROR_PATTERNS,
  };
}

/** Returns true if any pattern in the set matches any of the lines */
function matchesAny(patterns: RegExp[], lines: string[]): boolean {
  return lines.some((line) => patterns.some((pattern) => pattern.test(line)));
}

const log = createLogger("status-detector");

export class StatusDetector {
  /**
   * Detect the current status of a session based on multiple signals.
   *
   * @param tool - Which agent tool is running
   * @param lastLines - Recent terminal output lines (typically last 5-10)
   * @param bytesPerSecond - Current output throughput
   * @param msSinceLastActivity - Time since the last output byte (undefined = unknown)
   * @returns The detected session status
   */
  detect(
    tool: Tool,
    lastLines: string[],
    bytesPerSecond: number,
    msSinceLastActivity?: number,
  ): SessionStatus {
    const patterns = getPatternsForTool(tool);

    // Priority 1: Error patterns — problems need attention regardless of activity
    if (matchesAny(patterns.error, lastLines)) {
      log.debug("Status detected: error", { tool, bytesPerSecond });
      return "error";
    }

    // Priority 2: Waiting patterns with low activity — agent needs input
    // High activity + waiting pattern likely means the pattern appeared mid-stream
    if (
      matchesAny(patterns.waiting, lastLines) &&
      bytesPerSecond <= ACTIVITY_THRESHOLD
    ) {
      log.debug("Status detected: waiting", { tool, bytesPerSecond });
      return "waiting";
    }

    // Priority 3: Running patterns or high activity — agent is working
    if (
      matchesAny(patterns.running, lastLines) ||
      bytesPerSecond > ACTIVITY_THRESHOLD
    ) {
      return "running";
    }

    // Priority 4: Idle — no activity for IDLE_TIMEOUT_MS
    if (
      msSinceLastActivity !== undefined &&
      msSinceLastActivity >= IDLE_TIMEOUT_MS
    ) {
      return "idle";
    }

    // Default: assume running (safer than assuming idle for active sessions)
    return "running";
  }
}
