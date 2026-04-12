/**
 * CSS Grid container that arranges TerminalTiles in a responsive grid.
 *
 * - Sorts sessions by gridSlot, caps at maxSlots (cols * rows)
 * - Fills empty slots with GhostTiles
 * - When a session is zoomed, fades background tiles and renders a
 *   ZoomOverlay on top with the zoomed session at full grid size
 */

import React, { useMemo } from "react";
import type { Session, GridLayout } from "../../../electron/core/types";
import { useGrid } from "../../hooks/useGrid";
import { useUIStore } from "../../store/ui";
import TerminalTile from "./TerminalTile";
import PlaceholderTile from "./PlaceholderTile";
import GhostTile from "./GhostTile";
import ZoomOverlay from "./ZoomOverlay";

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
  const zoomedSessionId = useUIStore((s) => s.zoomedSessionId);
  const poppedOutSessionIds = useUIStore((s) => s.poppedOutSessionIds);

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

  // Resolve zoomed session (if any)
  const zoomedSession = zoomedSessionId
    ? sessions.find((s) => s.id === zoomedSessionId)
    : null;

  // Build grid slots: session tiles + ghost tiles for empties
  const ghostCount = Math.max(0, maxSlots - gridSessions.length);

  return (
    <div
      ref={containerRef}
      data-testid="terminal-grid"
      style={{
        flex: 1,
        display: "grid",
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, 1fr)`,
        gap: 4,
        padding: 4,
        minHeight: 0,
        position: "relative",
      }}
    >
      {gridSessions.map((session) => (
        <div key={session.id} className={zoomedSessionId ? "tile-fade-out" : ""}>
          {poppedOutSessionIds.has(session.id) ? (
            <PlaceholderTile
              session={session}
              onSnapBack={() => window.bastion.popout.close(session.id)}
            />
          ) : (
            <TerminalTile session={session} />
          )}
        </div>
      ))}
      {ghostCount > 0 &&
        Array.from({ length: ghostCount }, (_, i) => (
          <div key={`ghost-${i}`} className={zoomedSessionId ? "tile-fade-out" : ""}>
            <GhostTile onCreateSession={onCreateSession} />
          </div>
        ))}

      {/* Zoom overlay on top of the grid */}
      {zoomedSession && (
        <ZoomOverlay
          session={zoomedSession}
          onClose={() => useUIStore.getState().toggleZoom(null)}
        />
      )}
    </div>
  );
}
