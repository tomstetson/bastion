import React from "react";
import type { Session } from "../../../electron/core/types";

interface PlaceholderTileProps {
  session: Session;
  onSnapBack: () => void;
}

export default function PlaceholderTile({ session, onSnapBack }: PlaceholderTileProps) {
  return (
    <div
      data-testid="placeholder-tile"
      className="tile-placeholder-enter"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        background: "#0d111788",
        border: "2px dashed #30363d",
        borderRadius: 4,
        gap: 4,
      }}
    >
      <div style={{ color: "#8b949e", fontSize: 12, fontWeight: 500 }}>
        {session.name}
      </div>
      <div style={{ color: "#484f58", fontSize: 11 }}>
        Popped out ↗
      </div>
      <button
        onClick={onSnapBack}
        style={{
          marginTop: 8,
          fontSize: 11,
          padding: "4px 12px",
          borderRadius: 4,
          border: "1px solid #30363d",
          background: "#21262d",
          color: "#c9d1d9",
          cursor: "pointer",
        }}
      >
        Snap Back
      </button>
    </div>
  );
}
