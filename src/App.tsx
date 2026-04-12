/**
 * Root application component.
 * Composes Sidebar, Toolbar, and TerminalGrid into the main layout.
 */

import React, { useState, useMemo, useCallback, useEffect } from "react";
import "./styles/theme.css";
import Sidebar from "./components/Sidebar/Sidebar";
import Toolbar from "./components/Toolbar/Toolbar";
import TerminalGrid from "./components/Grid/TerminalGrid";
import NewSessionDialog from "./components/Dialogs/NewSessionDialog";
import CommandPalette from "./components/Dialogs/CommandPalette";
import { useKeyboard } from "./hooks/useKeyboard";
import { useProjectsStore } from "./store/projects";
import { useSessionsStore } from "./store/sessions";
import { useUIStore } from "./store/ui";
import type { GridLayout } from "../electron/core/types";

export default function App() {
  const projects = useProjectsStore((s) => s.projects);
  const setLayout = useProjectsStore((s) => s.setLayout);

  const sessions = useSessionsStore((s) => s.sessions);

  const activeProjectId = useUIStore((s) => s.activeProjectId);
  const zoomedSessionId = useUIStore((s) => s.zoomedSessionId);
  const statusFilter = useUIStore((s) => s.statusFilter);
  const standaloneGridLayout = useUIStore((s) => s.standaloneGridLayout);
  const setStandaloneGridLayout = useUIStore((s) => s.setStandaloneGridLayout);

  // Dialog visibility state
  const [showNewSession, setShowNewSession] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);

  // Listen for pop-out window close events to remove placeholder tiles
  useEffect(() => {
    const unsubscribe = window.bastion.popout.onClosed((sessionId: string) => {
      useUIStore.getState().removePopOut(sessionId);
    });
    return unsubscribe;
  }, []);

  // Global keyboard shortcuts
  useKeyboard({
    onNewSession: () => setShowNewSession(true),
    onToggleCommandPalette: () => setShowCommandPalette((prev) => !prev),
    onEscape: () => {
      // Close dialogs in priority order
      if (showCommandPalette) {
        setShowCommandPalette(false);
      } else if (showNewSession) {
        setShowNewSession(false);
      }
    },
  });

  // Active project object
  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId) ?? null,
    [projects, activeProjectId]
  );

  // Resolve zoomed session for toolbar breadcrumb
  const zoomedSession = useMemo(
    () => sessions.find((s) => s.id === zoomedSessionId) ?? null,
    [sessions, zoomedSessionId]
  );

  // Current grid layout — from active project, or standalone preference
  const currentLayout: GridLayout = activeProject?.gridLayout ?? standaloneGridLayout;

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
      } else {
        // No active project — store layout preference for standalone sessions
        setStandaloneGridLayout(layout);
      }
    },
    [activeProject, setLayout, setStandaloneGridLayout]
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
          zoomedSession={zoomedSession}
          onZoomClose={() => useUIStore.getState().toggleZoom(null)}
        />

        {/* Terminal Grid */}
        <TerminalGrid
          sessions={gridSessions}
          layout={currentLayout}
          onCreateSession={handleNewSession}
        />
      </div>

      {/* New Session Dialog */}
      {showNewSession && (
        <NewSessionDialog onClose={() => setShowNewSession(false)} />
      )}

      {/* Command Palette */}
      {showCommandPalette && (
        <CommandPalette onClose={() => setShowCommandPalette(false)} />
      )}
    </div>
  );
}
