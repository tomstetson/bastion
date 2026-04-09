/**
 * Compact sidebar list item for a single session.
 * Shows status-colored left border, session name, and status dot.
 */

import React from "react";
import type { Session, SessionStatus } from "../../../electron/core/types";

const STATUS_COLORS: Record<SessionStatus, string> = {
  running: "#3fb950",
  waiting: "#d29922",
  idle: "#8b949e",
  error: "#f85149",
  stopped: "#484f58",
};

interface SessionItemProps {
  session: Session;
  isActive: boolean;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}

export default function SessionItem({
  session,
  isActive,
  onClick,
  onContextMenu,
}: SessionItemProps) {
  return (
    <div
      onClick={onClick}
      onContextMenu={onContextMenu}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "4px 8px 4px 10px",
        borderLeft: `2px solid ${STATUS_COLORS[session.status]}`,
        background: isActive ? "#1c2128" : "transparent",
        cursor: "pointer",
        borderRadius: "0 4px 4px 0",
        transition: "background 100ms",
      }}
      onMouseEnter={(e) => {
        if (!isActive)
          (e.currentTarget as HTMLDivElement).style.background = "#161b22";
      }}
      onMouseLeave={(e) => {
        if (!isActive)
          (e.currentTarget as HTMLDivElement).style.background = "transparent";
      }}
    >
      {/* Status dot */}
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: STATUS_COLORS[session.status],
          flexShrink: 0,
        }}
      />

      {/* Session name */}
      <span
        style={{
          fontSize: 12,
          color: isActive ? "#c9d1d9" : "#8b949e",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          flex: 1,
        }}
      >
        {session.name}
      </span>
    </div>
  );
}
