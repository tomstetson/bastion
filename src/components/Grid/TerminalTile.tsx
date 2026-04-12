/**
 * A single terminal tile in the grid.
 * Shows a header bar with session info and a terminal body powered by xterm.js.
 *
 * When a session is stopped, the xterm.js terminal is fully unmounted to avoid
 * "ghost" output. A clean stopped state with Resume/Remove buttons is shown instead.
 *
 * Header layout:
 *   ● session-name        claude    2m ago    [⤢] [⧉] [▾]
 *
 * Left group: status dot, session name (bold, double-click to rename), tool badge
 * Right group: last activity, expand button, pop-out button, menu button
 *
 * Border color reflects state:
 * - Blue (#58a6ff) when focused
 * - Amber (#d29922) when waiting for input
 * - Default (#30363d) otherwise
 */

import React, { useMemo, useCallback, useState, useRef, useEffect } from "react";
import type { Session, SessionStatus } from "../../../electron/core/types";
import { useTerminal } from "../../hooks/useTerminal";
import { useUIStore } from "../../store/ui";
import { useSessionsStore } from "../../store/sessions";
import { useContextMenu } from "../../hooks/useContextMenu";
import ContextMenu from "../ContextMenu";

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

/** Shared style for header icon buttons */
const ICON_BUTTON_STYLE = {
  background: "none",
  border: "none",
  color: "#484f58",
  cursor: "pointer",
  fontSize: 12,
  padding: "2px 4px",
  lineHeight: 1,
  WebkitAppRegion: "no-drag",
} as React.CSSProperties;

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

/**
 * Inner component that mounts the xterm.js terminal.
 * Extracted so the useTerminal hook is only called (and the Terminal instance
 * only created) when the session is NOT stopped.
 */
function TerminalBody({ sessionId, onFocus }: { sessionId: string; onFocus: () => void }) {
  const { containerRef } = useTerminal({ sessionId });

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        minHeight: 0,
        padding: 4,
      }}
      onFocus={onFocus}
    />
  );
}

export default function TerminalTile({ session }: TerminalTileProps) {
  const focusedTileSessionId = useUIStore((s) => s.focusedTileSessionId);
  const setFocusedTile = useUIStore((s) => s.setFocusedTile);
  const toggleZoom = useUIStore((s) => s.toggleZoom);
  const stopSession = useSessionsStore((s) => s.stopSession);
  const restartSession = useSessionsStore((s) => s.restartSession);
  const resumeSession = useSessionsStore((s) => s.resumeSession);
  const deleteSession = useSessionsStore((s) => s.deleteSession);
  const renameSession = useSessionsStore((s) => s.renameSession);
  const setGridSlot = useSessionsStore((s) => s.setGridSlot);

  const contextMenu = useContextMenu();

  // Inline rename state
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus rename input when it appears
  useEffect(() => {
    if (isRenaming && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [isRenaming]);

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

  /** Stub for pop-out — implemented in Task 6 */
  const handlePopOut = () => {
    /* implemented in Task 6 */
  };

  /** Save the rename and exit rename mode */
  const handleRenameSave = useCallback(() => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== session.name) {
      renameSession(session.id, trimmed);
    }
    setIsRenaming(false);
  }, [renameValue, session.name, session.id, renameSession]);

  /** Cancel rename without saving */
  const handleRenameCancel = useCallback(() => {
    setIsRenaming(false);
  }, []);

  /** Context menu items */
  const menuItems = useMemo(
    () => [
      { label: "Expand", action: () => toggleZoom(session.id) },
      { label: "Pop Out to Window", action: handlePopOut },
      {
        label: "Rename",
        action: () => {
          setRenameValue(session.name);
          setIsRenaming(true);
        },
      },
      null, // separator
      {
        label: "Stop Session",
        action: () => stopSession(session.id),
        disabled: session.status === "stopped",
      },
      { label: "Restart Session", action: () => restartSession(session.id) },
      null, // separator
      { label: "Remove from Grid", action: () => setGridSlot(session.id, null) },
      {
        label: "Delete Session",
        action: () => {
          if (confirm(`Delete "${session.name}"?`)) deleteSession(session.id);
        },
        danger: true,
      },
    ],
    [
      session.id,
      session.name,
      session.status,
      toggleZoom,
      stopSession,
      restartSession,
      deleteSession,
      setGridSlot,
    ],
  );

  const borderColor = useMemo(() => {
    if (isFocused) return "#58a6ff";
    if (isWaiting) return "#d29922";
    return "#30363d";
  }, [isFocused, isWaiting]);

  const tileClassName = [
    isWaiting && !isFocused ? "tile-waiting" : "",
    isFocused ? "tile-focused" : "",
  ].filter(Boolean).join(" ") || undefined;

  return (
    <div
      data-testid="terminal-tile"
      className={tileClassName}
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
        onContextMenu={(e) => {
          e.preventDefault();
          contextMenu.show(e, menuItems);
        }}
      >
        {/* Status dot */}
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            backgroundColor: STATUS_COLORS[session.status],
            flexShrink: 0,
          }}
        />

        {/* Session name — inline rename on double-click */}
        {isRenaming ? (
          <input
            ref={renameInputRef}
            data-testid="tile-rename-input"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleRenameSave();
              } else if (e.key === "Escape") {
                handleRenameCancel();
              }
            }}
            onBlur={handleRenameSave}
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "#c9d1d9",
              background: "transparent",
              border: "none",
              borderBottom: "1px solid #484f58",
              outline: "none",
              padding: 0,
              fontFamily: "inherit",
              flex: 1,
              minWidth: 0,
            }}
          />
        ) : (
          <span
            data-testid="tile-name"
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "#c9d1d9",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              flex: 1,
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              setRenameValue(session.name);
              setIsRenaming(true);
            }}
          >
            {session.name}
          </span>
        )}

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

        {/* Expand button */}
        <button
          data-testid="expand-btn"
          onClick={(e) => {
            e.stopPropagation();
            toggleZoom(session.id);
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = "#c9d1d9";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = "#484f58";
          }}
          style={ICON_BUTTON_STYLE}
          title="Expand (⌘↵)"
        >
          ⤢
        </button>

        {/* Pop-out button */}
        <button
          data-testid="popout-btn"
          onClick={(e) => {
            e.stopPropagation();
            handlePopOut();
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = "#c9d1d9";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = "#484f58";
          }}
          style={ICON_BUTTON_STYLE}
          title="Pop out to window"
        >
          ⧉
        </button>

        {/* Menu button */}
        <button
          data-testid="tile-menu-btn"
          onClick={(e) => {
            e.stopPropagation();
            contextMenu.show(e, menuItems);
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = "#c9d1d9";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = "#484f58";
          }}
          style={ICON_BUTTON_STYLE}
          title="Actions"
        >
          ▾
        </button>
      </div>

      {/* Terminal body (unmounted when stopped) or clean stopped state */}
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

          {/* Session name for context */}
          <span
            style={{
              fontSize: 11,
              color: "#484f58",
              fontFamily: "'SF Mono', 'Menlo', monospace",
            }}
          >
            {session.name}
          </span>

          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            {/* Resume button — only enabled when resume data exists */}
            {session.resumeData && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleResume();
                }}
                style={{
                  padding: "6px 16px",
                  borderRadius: 4,
                  border: "1px solid #238636",
                  background: "#238636",
                  color: "#ffffff",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 600,
                }}
                title="Resume this session"
              >
                Resume
              </button>
            )}

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
        <TerminalBody
          sessionId={session.id}
          onFocus={() => setFocusedTile(session.id)}
        />
      )}

      {/* Context menu */}
      {contextMenu.visible && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onHide={contextMenu.hide}
        />
      )}
    </div>
  );
}
