/**
 * Full-grid overlay that renders a single zoomed session.
 *
 * Positioned absolutely over the grid container so background tiles
 * remain mounted (with fade-out) while the zoomed tile fills the space.
 * Uses the `tile-fade-in` animation class from animations.css.
 */

import React from "react";
import type { Session } from "../../../electron/core/types";
import TerminalTile from "./TerminalTile";

interface ZoomOverlayProps {
  session: Session;
  onClose: () => void;
}

export default function ZoomOverlay({ session, onClose }: ZoomOverlayProps) {
  return (
    <div
      data-testid="zoom-overlay"
      className="tile-fade-in"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 10,
        background: "#010409",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
        <TerminalTile session={session} />
      </div>
    </div>
  );
}
