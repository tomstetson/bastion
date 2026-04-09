/**
 * A single terminal tile in the grid.
 * Shows a header bar with session info and a terminal body powered by xterm.js.
 *
 * Border color reflects state:
 * - Blue (#58a6ff) when focused
 * - Amber (#d29922) when waiting for input
 * - Default (#30363d) otherwise
 */

import React, { useMemo, useCallback } from "react";
import type { Session, SessionStatus } from "../../../electron/core/types";
import { useTerminal } from "../../hooks/useTerminal";
import { useUIStore } from "../../store/ui";
import { useSessionsStore } from "../../store/sessions";

/** Extracts the first N lines from a string */
function firstLines(text: string, n: number): string {
  return text.split("\n").slice(0, n).join("\n");
}

interface TerminalTileProps {
  session: Session;
}

/** Maps session status to a colored dot */
const STATUS_COLORS: Record<SessionStatus, string> = {
  running: "#3fb950",
  waiting: "#d29922",
  idle: "#8b949e",
  error: "#f85149",
  stopped: "#484f58",
};

/** Tool display names */
const TOOL_LABELS: Record<string, string> = {
  claude: "Claude",
  opencode: "OpenCode",
  gemini: "Gemini",
  codex: "Codex",
  custom: "Custom",
  shell: "Shell",
};

/** Format a timestamp as relative time ("2m ago", "1h ago", etc.) */
function relativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function TerminalTile({ session }: TerminalTileProps) {
  const focusedTileSessionId = useUIStore((s) => s.focusedTileSessionId);
  const setFocusedTile = useUIStore((s) => s.setFocusedTile);
  const toggleMaximized = useUIStore((s) => s.toggleMaximized);
  const stopSession = useSessionsStore((s) => s.stopSession);
  const resumeSession = useSessionsStore((s) => s.resumeSession);
  const deleteSession = useSessionsStore((s) => s.deleteSession);

  const { containerRef } = useTerminal({ sessionId: session.id });

  const isFocused = focusedTileSessionId === session.id;
  const isWaiting = session.status === "waiting";
  const isStopped = session.status === "stopped";

  const handleResume = useCallback(async () => {
    await resumeSession(session.id);
  }, [resumeSession, session.id]);

  const handleRemove = useCallback(async () => {
    if (window.confirm(`Remove session "${session.name}"? This cannot be undone.`)) {
      await deleteSession(session.id);
    }
  }, [deleteSession, session.id, session.name]);

  const borderColor = useMemo(() => {
    if (isFocused) return "#58a6ff";
    if (isWaiting) return "#d29922";
    return "#30363d";
  }, [isFocused, isWaiting]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        border: `1px solid ${borderColor}`,
        borderRadius: 6,
        overflow: "hidden",
        background: "#0d1117",
        minHeight: 0,
      }}
      onClick={() => setFocusedTile(session.id)}
    >
      {/* Header bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 10px",
          background: "#161b22",
          borderBottom: `1px solid ${borderColor}`,
          cursor: "default",
          userSelect: "none",
          flexShrink: 0,
        }}
        onDoubleClick={() => toggleMaximized(session.id)}
      >
        {/* Status dot */}
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: STATUS_COLORS[session.status],
            flexShrink: 0,
          }}
        />

        {/* Session name */}
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "#c9d1d9",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flex: 1,
          }}
        >
          {session.name}
        </span>

        {/* Tool badge */}
        <span
          style={{
            fontSize: 10,
            padding: "1px 6px",
            borderRadius: 3,
            background: "#30363d",
            color: "#8b949e",
            flexShrink: 0,
          }}
        >
          {TOOL_LABELS[session.tool] || session.tool}
        </span>

        {/* Last activity */}
        <span
          style={{
            fontSize: 10,
            color: "#484f58",
            flexShrink: 0,
          }}
        >
          {relativeTime(session.updatedAt)}
        </span>

        {/* Maximize button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleMaximized(session.id);
          }}
          style={{
            background: "none",
            border: "none",
            color: "#8b949e",
            cursor: "pointer",
            fontSize: 14,
            padding: "0 2px",
            lineHeight: 1,
          }}
          title="Maximize"
        >
          ⤢
        </button>

        {/* Close button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            stopSession(session.id);
          }}
          style={{
            background: "none",
            border: "none",
            color: "#8b949e",
            cursor: "pointer",
            fontSize: 14,
            padding: "0 2px",
            lineHeight: 1,
          }}
          title="Stop session"
        >
          ✕
        </button>
      </div>

      {/* Terminal body or stopped state */}
      {isStopped ? (
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            padding: 20,
          }}
        >
          <span style={{ fontSize: 13, color: "#8b949e", fontWeight: 500 }}>
            Session ended
          </span>

          {/* Output snapshot preview */}
          {session.resumeData?.outputSnapshot && (
            <pre
              style={{
                fontSize: 11,
                color: "#484f58",
                background: "#0d1117",
                border: "1px solid #21262d",
                borderRadius: 4,
                padding: "8px 12px",
                maxWidth: "100%",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
                margin: 0,
                lineHeight: 1.4,
              }}
            >
              {firstLines(session.resumeData.outputSnapshot, 2)}
            </pre>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            {/* Resume button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleResume();
              }}
              disabled={!session.resumeData}
              style={{
                padding: "6px 16px",
                borderRadius: 4,
                border: session.resumeData ? "1px solid #238636" : "1px solid #30363d",
                background: session.resumeData ? "#238636" : "#21262d",
                color: session.resumeData ? "#ffffff" : "#484f58",
                cursor: session.resumeData ? "pointer" : "default",
                fontSize: 12,
                fontWeight: 600,
              }}
              title={session.resumeData ? "Resume this session" : "No resume data available"}
            >
              Resume
            </button>

            {/* Remove button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleRemove();
              }}
              style={{
                padding: "6px 16px",
                borderRadius: 4,
                border: "1px solid #f8514922",
                background: "transparent",
                color: "#f85149",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <div
          ref={containerRef}
          style={{
            flex: 1,
            minHeight: 0,
            padding: 4,
          }}
          onFocus={() => setFocusedTile(session.id)}
        />
      )}
    </div>
  );
}
