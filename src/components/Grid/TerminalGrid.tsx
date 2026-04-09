/**
 * CSS Grid container that arranges TerminalTiles in a responsive grid.
 *
 * - Sorts sessions by gridSlot, caps at maxSlots (cols * rows)
 * - Fills empty slots with GhostTiles
 * - When a session is maximized, renders only that session fullscreen
 */

import React, { useMemo } from "react";
import type { Session, GridLayout } from "../../../electron/core/types";
import { useGrid } from "../../hooks/useGrid";
import { useUIStore } from "../../store/ui";
import TerminalTile from "./TerminalTile";
import GhostTile from "./GhostTile";

interface TerminalGridProps {
  sessions: Session[];
  layout: GridLayout;
  onCreateSession: () => void;
}

export default function TerminalGrid({
  sessions,
  layout,
  onCreateSession,
}: TerminalGridProps) {
  const { cols, rows, containerRef } = useGrid(layout);
  const maximizedSessionId = useUIStore((s) => s.maximizedSessionId);

  const maxSlots = cols * rows;

  // Sort by gridSlot (nulls last) and cap at maxSlots
  const gridSessions = useMemo(() => {
    const sorted = [...sessions].sort((a, b) => {
      if (a.gridSlot === null && b.gridSlot === null) return 0;
      if (a.gridSlot === null) return 1;
      if (b.gridSlot === null) return -1;
      return a.gridSlot - b.gridSlot;
    });
    return sorted.slice(0, maxSlots);
  }, [sessions, maxSlots]);

  // If a session is maximized, show only that one
  const maximizedSession = maximizedSessionId
    ? sessions.find((s) => s.id === maximizedSessionId)
    : null;

  if (maximizedSession) {
    return (
      <div
        ref={containerRef}
        style={{
          flex: 1,
          display: "flex",
          minHeight: 0,
          padding: 4,
        }}
      >
        <div style={{ flex: 1, minHeight: 0 }}>
          <TerminalTile session={maximizedSession} />
        </div>
      </div>
    );
  }

  // Build grid slots: session tiles + ghost tiles for empties
  const ghostCount = Math.max(0, maxSlots - gridSessions.length);

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        display: "grid",
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, 1fr)`,
        gap: 4,
        padding: 4,
        minHeight: 0,
      }}
    >
      {gridSessions.map((session) => (
        <TerminalTile key={session.id} session={session} />
      ))}
      {Array.from({ length: ghostCount }, (_, i) => (
        <GhostTile key={`ghost-${i}`} onCreateSession={onCreateSession} />
      ))}
    </div>
  );
}
