/**
 * Generic tool output patterns for status detection.
 *
 * These regexes match common shell/tool output patterns. Used as a
 * fallback for tools that don't have tool-specific pattern sets
 * (opencode, gemini, codex, custom, shell).
 */

/** Patterns that indicate a tool is waiting for user input */
export const GENERIC_WAITING_PATTERNS: RegExp[] = [
  /^\$ $/,        // Shell prompt (bare dollar-space at end of line)
  /^> /,          // Generic input prompt
  /^\? /,         // Interactive question prompt
  /\(y\/n\)/i,   // Yes/no confirmation
];

/** Patterns that indicate a tool encountered an error */
export const GENERIC_ERROR_PATTERNS: RegExp[] = [
  /\bERROR\b/,    // Uppercase ERROR keyword
  /^Error:/m,     // Error: prefix
  /\bfailed\b/i,  // Generic failure indicator
  /\bFATAL\b/,   // Fatal error
];
