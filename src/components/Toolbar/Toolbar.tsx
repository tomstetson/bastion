/**
 * Top toolbar with project breadcrumb and grid layout switcher.
 *
 * Left side: active project name + session count (or placeholder text),
 *            plus zoomed session breadcrumb with close button when zoomed
 * Right side: layout buttons (1x1, 2x1, 2x2, 3x2, auto)
 */

import React from "react";
import type { Project, Session, GridLayout } from "../../../electron/core/types";

const LAYOUTS: Array<{ value: GridLayout; label: string }> = [
  { value: "1x1", label: "1x1" },
  { value: "2x1", label: "2x1" },
  { value: "2x2", label: "2x2" },
  { value: "3x2", label: "3x2" },
  { value: "auto", label: "Auto" },
];

interface ToolbarProps {
  activeProject: Project | null;
  sessionCount: number;
  activeLayout: GridLayout;
  onLayoutChange: (layout: GridLayout) => void;
  zoomedSession?: Session | null;
  onZoomClose?: () => void;
}

export default function Toolbar({
  activeProject,
  sessionCount,
  activeLayout,
  onLayoutChange,
  zoomedSession,
  onZoomClose,
}: ToolbarProps) {
  return (
    <div
      data-testid="toolbar"
      style={{
        background: "#161b22",
        borderBottom: "1px solid #21262d",
        flexShrink: 0,
      }}
    >
      {/* Drag region for macOS title bar */}
      <div
        style={{
          height: 38,
          // @ts-expect-error -- Electron-specific CSS property for window dragging
          WebkitAppRegion: "drag",
        }}
      />

      {/* Toolbar content */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 12px 8px",
        }}
      >
        {/* Left: breadcrumb */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {activeProject ? (
            <>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#c9d1d9",
                }}
              >
                {activeProject.name}
              </span>
              <span
                style={{
                  fontSize: 11,
                  color: "#484f58",
                }}
              >
                {sessionCount} session{sessionCount !== 1 ? "s" : ""}
              </span>
            </>
          ) : (
            <span
              style={{
                fontSize: 13,
                color: "#484f58",
                fontStyle: "italic",
              }}
            >
              Standalone sessions
            </span>
          )}

          {/* Zoomed session breadcrumb */}
          {zoomedSession && (
            <>
              <span style={{ color: "#484f58", margin: "0 6px" }}>&rsaquo;</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#58a6ff" }}>
                {zoomedSession.name}
              </span>
              <button
                data-testid="zoom-close-btn"
                onClick={onZoomClose}
                title="Back to grid (Esc)"
                style={{
                  marginLeft: 8,
                  fontSize: 11,
                  padding: "1px 6px",
                  borderRadius: 3,
                  border: "1px solid #30363d",
                  background: "transparent",
                  color: "#8b949e",
                  cursor: "pointer",
                  // @ts-expect-error -- Electron-specific CSS property to allow button clicks in drag region
                  WebkitAppRegion: "no-drag",
                }}
              >
                &#x2715;
              </button>
            </>
          )}
        </div>

        {/* Right: layout switcher */}
        <div style={{ display: "flex", gap: 2 }}>
          {LAYOUTS.map(({ value, label }) => {
            const isActive = activeLayout === value;
            return (
              <button
                key={value}
                data-testid={`layout-btn-${value}`}
                onClick={() => onLayoutChange(value)}
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  padding: "3px 8px",
                  borderRadius: 4,
                  border: isActive ? "1px solid #58a6ff" : "1px solid #30363d",
                  background: isActive ? "#58a6ff22" : "transparent",
                  color: isActive ? "#58a6ff" : "#8b949e",
                  cursor: "pointer",
                  transition: "all 100ms",
                  // @ts-expect-error -- Electron-specific CSS property to allow button clicks in drag region
                  WebkitAppRegion: "no-drag",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
