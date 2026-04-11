/**
 * Empty grid slot placeholder.
 * Dashed border with a "+" icon that invites the user to create a new session.
 */

import React, { useState } from "react";

interface GhostTileProps {
  onCreateSession: () => void;
}

export default function GhostTile({ onCreateSession }: GhostTileProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      data-testid="ghost-tile"
      onClick={onCreateSession}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        border: `1px dashed ${hovered ? "#484f58" : "#30363d"}`,
        borderRadius: 6,
        cursor: "pointer",
        background: hovered ? "#161b22" : "transparent",
        transition: "border-color 150ms, background 150ms",
        minHeight: 0,
      }}
    >
      <span
        style={{
          fontSize: 28,
          color: hovered ? "#8b949e" : "#484f58",
          lineHeight: 1,
          transition: "color 150ms",
        }}
      >
        +
      </span>
      <span
        style={{
          fontSize: 12,
          color: hovered ? "#8b949e" : "#484f58",
          transition: "color 150ms",
        }}
      >
        New Session
      </span>
      <span
        style={{
          fontSize: 10,
          color: "#484f58",
        }}
      >
        Cmd+N
      </span>
    </div>
  );
}
