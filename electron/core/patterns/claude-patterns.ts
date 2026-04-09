/**
 * Claude Code-specific output patterns for status detection.
 *
 * These regexes match terminal output from Claude Code to determine
 * whether the agent is waiting for input, actively running, or in error.
 */

/** Patterns that indicate Claude is waiting for user input */
export const CLAUDE_WAITING_PATTERNS: RegExp[] = [
  /^\? /,                        // Interactive question prompt
  /^> /,                         // Input prompt
  /Allow\? \(y\/n\)/,           // Permission request
  /Do you want to proceed/i,    // Confirmation prompt
  /Press Enter/i,               // Enter key prompt
];

/** Patterns that indicate Claude is actively working */
export const CLAUDE_RUNNING_PATTERNS: RegExp[] = [
  /[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/,             // Braille spinner characters
  /Thinking\.\.\./,              // Thinking indicator
  /\b(Reading|Writing|Editing|Creating|Searching|Analyzing|Running|Installing|Building|Compiling)\b/,
];

/** Patterns that indicate Claude encountered an error */
export const CLAUDE_ERROR_PATTERNS: RegExp[] = [
  /^Error:/m,                    // Error message prefix
  /\bFATAL\b/,                  // Fatal error
  /^\s+at\s+.+\(.+:\d+:\d+\)/, // Stack trace line
  /\bENOENT\b/,                 // File not found
  /\bEACCES\b/,                 // Permission denied
  /\bEPERM\b/,                  // Operation not permitted
];
