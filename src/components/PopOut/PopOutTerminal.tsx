import React, { useState, useEffect } from "react";
import { useTerminal } from "../../hooks/useTerminal";
import type { Session, SessionStatus } from "../../../electron/core/types";

const STATUS_COLORS: Record<SessionStatus, string> = {
  running: "#3fb950",
  waiting: "#d29922",
  idle: "#8b949e",
  error: "#f85149",
  stopped: "#484f58",
};

interface PopOutTerminalProps {
  sessionId: string;
}

export default function PopOutTerminal({ sessionId }: PopOutTerminalProps) {
  const [session, setSession] = useState<Session | null>(null);
  const { containerRef } = useTerminal({ sessionId });

  useEffect(() => {
    const fetchSession = async () => {
      const s = await window.bastion.sessions.get(sessionId);
      setSession(s);
    };
    fetchSession();
    const interval = setInterval(fetchSession, 2000);
    return () => clearInterval(interval);
  }, [sessionId]);

  const statusColor = session ? STATUS_COLORS[session.status] : "#484f58";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      {/* macOS drag region */}
      <div style={{
        height: 38, flexShrink: 0,
        // @ts-expect-error -- Electron-specific CSS property for window dragging
        WebkitAppRegion: "drag",
      }} />

      {/* Minimal header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 12px 8px", flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            width: 8, height: 8, borderRadius: "50%",
            backgroundColor: statusColor, flexShrink: 0,
          }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: "#c9d1d9" }}>
            {session?.name || "Loading..."}
          </span>
          <span style={{ fontSize: 11, color: "#484f58" }}>
            {session?.tool || ""}
          </span>
        </div>
        <button
          onClick={async () => {
            if (session && session.status !== "stopped" && confirm(`Stop session "${session.name}"?`)) {
              await window.bastion.sessions.stop(sessionId);
            }
          }}
          style={{
            fontSize: 11, padding: "3px 10px", borderRadius: 4,
            border: "1px solid #30363d", background: "transparent",
            color: "#8b949e", cursor: "pointer",
            // @ts-expect-error -- Electron-specific CSS property for window dragging
            WebkitAppRegion: "no-drag",
          }}
        >
          Stop
        </button>
      </div>

      {/* Terminal fills remaining space */}
      <div ref={containerRef} style={{ flex: 1, minHeight: 0 }} />
    </div>
  );
}
