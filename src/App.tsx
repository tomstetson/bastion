/**
 * Root application component.
 * Composes Sidebar, Toolbar, and TerminalGrid into the main layout.
 */

import React, { useState, useMemo, useCallback } from "react";
import "./styles/theme.css";
import Sidebar from "./components/Sidebar/Sidebar";
import Toolbar from "./components/Toolbar/Toolbar";
import TerminalGrid from "./components/Grid/TerminalGrid";
import { useProjectsStore } from "./store/projects";
import { useSessionsStore } from "./store/sessions";
import { useUIStore } from "./store/ui";
import type { GridLayout } from "../electron/core/types";

export default function App() {
  const projects = useProjectsStore((s) => s.projects);
  const setLayout = useProjectsStore((s) => s.setLayout);

  const sessions = useSessionsStore((s) => s.sessions);

  const activeProjectId = useUIStore((s) => s.activeProjectId);
  const statusFilter = useUIStore((s) => s.statusFilter);

  // NewSessionDialog state placeholder (actual dialog is Task 18)
  const [showNewSession, setShowNewSession] = useState(false);

  // Active project object
  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId) ?? null,
    [projects, activeProjectId]
  );

  // Current grid layout — from active project or default "auto"
  const currentLayout: GridLayout = activeProject?.gridLayout ?? "auto";

  // Sessions to display in the grid: filter by active project and status
  const gridSessions = useMemo(() => {
    let filtered = sessions;

    // Filter by active project (or show standalone if no project selected)
    if (activeProjectId) {
      filtered = filtered.filter((s) => s.projectId === activeProjectId);
    } else {
      filtered = filtered.filter((s) => !s.projectId);
    }

    // Apply status filter
    if (statusFilter) {
      filtered = filtered.filter((s) => s.status === statusFilter);
    }

    return filtered;
  }, [sessions, activeProjectId, statusFilter]);

  const handleLayoutChange = useCallback(
    (layout: GridLayout) => {
      if (activeProject) {
        setLayout(activeProject.id, layout);
      }
    },
    [activeProject, setLayout]
  );

  const handleNewSession = useCallback(() => {
    setShowNewSession(true);
  }, []);

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      {/* Sidebar */}
      <Sidebar onNewSession={handleNewSession} />

      {/* Main area */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
          background: "#0d1117",
        }}
      >
        {/* Toolbar */}
        <Toolbar
          activeProject={activeProject}
          sessionCount={gridSessions.length}
          activeLayout={currentLayout}
          onLayoutChange={handleLayoutChange}
        />

        {/* Terminal Grid */}
        <TerminalGrid
          sessions={gridSessions}
          layout={currentLayout}
          onCreateSession={handleNewSession}
        />
      </div>

      {/* NewSessionDialog placeholder — Task 18 will replace this */}
      {showNewSession && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
          }}
          onClick={() => setShowNewSession(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#161b22",
              border: "1px solid #30363d",
              borderRadius: 8,
              padding: 24,
              minWidth: 320,
              color: "#c9d1d9",
              fontSize: 14,
            }}
          >
            <p style={{ marginBottom: 16 }}>New Session Dialog (Task 18)</p>
            <button
              onClick={() => setShowNewSession(false)}
              style={{
                padding: "6px 16px",
                borderRadius: 4,
                border: "1px solid #30363d",
                background: "#21262d",
                color: "#c9d1d9",
                cursor: "pointer",
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
